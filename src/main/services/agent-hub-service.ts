import { generateTopicBundle } from './topic-package-service'
import { validateTopicQuery, formatTopicBundle } from '../../shared/topic-digest'
import { app, BrowserWindow } from 'electron'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import type {
  AgentHubLogEntry,
  AgentHubLogLevel,
  AgentHubLogSource,
  AgentHubLocalAskRequest,
  AgentHubLocalAskResult,
  AgentHubPromptSettings,
  AgentHubPromptSettingsResult
} from '../../shared/agent-hub'
import type {
  AgentMemoryDraft,
  AgentMemorySourceMessage,
  AgentMemoryWriteRequest,
  AgentMemoryWriteResult
} from '../../shared/agent-memory'
import { AGENT_HUB_CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '../../shared/agent-hub'
import type { AIToolChatMessage } from '../../shared/ai-provider'
import { loadSettings, updateSettings } from './settings-store'
import { AIProviderService } from './ai-provider-service'
import { isReady, getCurrentAccountRoot } from './chat-service'
import { AGENT_HUB_READ_TOOLS, executeAgentHubReadTool } from './agent-hub-read-tools'
import { buildAgentHubSystemPrompt, normalizeAgentHubCustomInstructions } from './agent-hub-prompt'
import { AgentMemoryExtractionService } from './agent-memory-extraction-service'
import { renderAgentMemoryExport } from '../../shared/agent-memory-format'
import {
  PLATFORM_AGENT_READ_TOOLS,
  executePlatformAgentReadTool
} from '../platform-integration/platform-agent-tools'

const MAX_LOG_ENTRIES = 800
const MAX_AGENT_ROUNDS = 8
const MAX_AGENT_TOOL_CALLS = 12
const agentAIProvider = new AIProviderService()
const agentMemoryExtractionService = new AgentMemoryExtractionService(agentAIProvider)

/**
 * Local, read-only AI assistant used by the “问问 AI” workspace.
 *
 * This service deliberately has no WeChat login, connector, HTTP webhook or
 * message-sending code. It can read the opened local database and parse public
 * Douyin shares. Only the platform UI can request user-confirmed file saves.
 */
class AgentHubService {
  private logs: AgentHubLogEntry[] = []
  private nextLogId = 1

  getPromptSettings(): AgentHubPromptSettings {
    return {
      customInstructions: normalizeAgentHubCustomInstructions(
        loadSettings().agentHubCustomInstructions
      ),
      maxLength: AGENT_HUB_CUSTOM_INSTRUCTIONS_MAX_LENGTH
    }
  }

  savePromptSettings(customInstructions: unknown): AgentHubPromptSettingsResult {
    const current = this.getPromptSettings()
    if (typeof customInstructions !== 'string') {
      return { success: false, settings: current, error: '自定义总结指令必须是文本' }
    }
    const normalized = normalizeAgentHubCustomInstructions(customInstructions)
    if (normalized.length > AGENT_HUB_CUSTOM_INSTRUCTIONS_MAX_LENGTH) {
      return {
        success: false,
        settings: current,
        error: `自定义总结指令不能超过 ${AGENT_HUB_CUSTOM_INSTRUCTIONS_MAX_LENGTH} 个字符`
      }
    }
    updateSettings({ agentHubCustomInstructions: normalized })
    this.addLog(
      'agent-hub',
      'info',
      normalized ? '自定义总结指令已更新' : '自定义总结指令已恢复默认'
    )
    return { success: true, settings: this.getPromptSettings() }
  }

  getLogs(): AgentHubLogEntry[] {
    return [...this.logs]
  }

  clearLogs(): void {
    this.logs = []
    try {
      writeFileSync(this.logFilePath(), '', 'utf8')
    } catch {
      // The live log remains usable when the persistent file cannot be cleared.
    }
    this.addLog('system', 'info', '运行日志已清空')
  }

  async askLocal(input: AgentHubLocalAskRequest): Promise<AgentHubLocalAskResult> {
    try {
      if (!isReady()) throw new Error('花笺本地数据库尚未连接，请连接后再试')
      const accountRoot = getCurrentAccountRoot()
      if (input?.topicQuery) {
        const bundle = await generateTopicBundle(validateTopicQuery(input.topicQuery))
        return { success: true, answer: formatTopicBundle(bundle), bundle }
      }
      const question = String(input?.question || '')
        .trim()
        .slice(0, 4000)
      const groupId = String(input?.groupId || '').trim()
      const groupName = String(input?.groupName || '').trim()
      if (!question) throw new Error('请输入想问的问题')
      if (!groupId || !groupName) throw new Error('请先选择一个群聊')

      const requestedRecentCount = parseRequestedRecentMessageCount(question)
      const exactReadRequirement = requestedRecentCount
        ? `\n\n硬性读取要求：本次用户要求总结最近 ${requestedRecentCount} 条消息。你必须从本地数据库读取这 ${requestedRecentCount} 条，而不是根据聊天界面当前显示的消息数量作答。单次最多读 1000 条；超过 1000 条时优先使用 next_cursor 连续分页，累计读够后才可总结。若数据库实际不足 ${requestedRecentCount} 条，须明确说明实际读取数量。`
        : ''

      this.addLog('agent-hub', 'info', `开始处理群聊“${groupName}”的提问`)
      const completed =
        requestedRecentCount && isPlainRecentSummaryQuestion(question) && !input.history?.length
          ? await this.summarizeRecentMessagesFromDatabase({
              groupId,
              groupName,
              question,
              requestedCount: requestedRecentCount,
              accountRoot,
              customInstructions: loadSettings().agentHubCustomInstructions
            })
          : await this.completeReadOnlyAgent(
              this.buildToolAgentMessages({
                input,
                groupId,
                groupName,
                question,
                exactReadRequirement
              }),
              accountRoot,
              groupId
            )
      this.assertAccount(accountRoot)
      this.addLog(
        'agent-hub',
        'info',
        completed.toolCallCount
          ? `处理完成（只读工具调用 ${completed.toolCallCount} 次）`
          : `处理完成（直接从数据库读取 ${completed.sourceMessages.length} 条）`
      )
      let memoryDraft: AgentMemoryDraft | undefined
      if (input.memoryExtraction?.enabled) {
        this.addLog('agent-hub', 'info', '开始生成记忆草稿：直接按提取要求筛选并整理沉淀内容')
        memoryDraft = await agentMemoryExtractionService.createDraft({
          groupId,
          groupName,
          sourceMessages: completed.sourceMessages,
          options: input.memoryExtraction
        })
        this.assertAccount(accountRoot)
        this.addLog(
          'agent-hub',
          memoryDraft.success ? 'info' : 'error',
          memoryDraft.success
            ? `记忆草稿已生成（引用 ${memoryDraft.selectedMessageCount ?? memoryDraft.professionalMessageCount} 条来源消息，尚未写入）`
            : `记忆草稿生成失败：${memoryDraft.error || '未知错误'}`
        )
      }
      return {
        success: true,
        answer: this.formatAIReply(completed.answer.slice(0, 12000)),
        toolCallCount: completed.toolCallCount,
        memoryDraft
      }
    } catch (error) {
      const message = this.errorMessage(error)
      this.addLog('agent-hub', 'error', `处理失败：${message}`)
      return { success: false, error: message }
    }
  }

  writeMemoryDraft(request: AgentMemoryWriteRequest): AgentMemoryWriteResult {
    const draft = request?.draft
    const outputDirectory = String(request?.outputDirectory || '').trim()
    if (!draft?.success || !String(draft.markdown || '').trim()) {
      return { success: false, error: '没有可写入的记忆草稿' }
    }
    if (!outputDirectory || !isAbsolute(outputDirectory)) {
      return { success: false, error: '请选择一个有效的绝对路径作为记忆库目录' }
    }
    try {
      const root = resolve(outputDirectory)
      mkdirSync(root, { recursive: true })
      const fileBase = safeMemoryFilePart(draft.title || draft.groupName || '记忆')
      const stamp = new Date(draft.generatedAt || Date.now())
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .replace('Z', '')
      let filePath = join(root, `${fileBase}_${stamp}.md`)
      let suffix = 2
      while (existsSync(filePath)) {
        filePath = join(root, `${fileBase}_${stamp}_${suffix}.md`)
        suffix += 1
      }
      const markdown = this.memoryMarkdown(draft)
      writeFileSync(filePath, markdown, { encoding: 'utf8', flag: 'wx' })
      this.addLog('agent-hub', 'info', `记忆草稿已写入：${filePath}`)
      return { success: true, path: filePath }
    } catch (error) {
      const message = this.errorMessage(error)
      this.addLog('agent-hub', 'error', `写入记忆草稿失败：${message}`)
      return { success: false, error: message }
    }
  }

  private async completeReadOnlyAgent(
    messages: AIToolChatMessage[],
    accountRoot: string,
    groupId: string
  ): Promise<{
    answer: string
    toolCallCount: number
    sourceMessages: AgentMemorySourceMessage[]
  }> {
    let toolCallCount = 0
    const sourceMessages: AgentMemorySourceMessage[] = []
    for (let round = 0; round < MAX_AGENT_ROUNDS; round += 1) {
      this.assertAccount(accountRoot)
      const result = await agentAIProvider.chatWithTools(messages, [
        ...AGENT_HUB_READ_TOOLS,
        ...PLATFORM_AGENT_READ_TOOLS
      ])
      this.assertAccount(accountRoot)
      if (!result.success) throw new Error(result.error || 'AI 调用失败')
      const toolCalls = result.toolCalls || []
      messages.push({
        role: 'assistant',
        content: result.content || null,
        toolCalls: toolCalls.length ? toolCalls : undefined
      })

      if (!toolCalls.length) {
        const answer = String(result.content || '').trim()
        if (!answer) throw new Error('AI 没有返回总结')
        return { answer, toolCallCount, sourceMessages: dedupeMemorySourceMessages(sourceMessages) }
      }

      for (const call of toolCalls) {
        this.assertAccount(accountRoot)
        toolCallCount += 1
        if (toolCallCount > MAX_AGENT_TOOL_CALLS) {
          throw new Error('本次读取步骤过多，请缩小群聊、时间或消息数量范围')
        }
        this.addLog('agent-hub', 'info', `AI 调用只读工具：${call.function.name}`)
        let output: Record<string, unknown>
        if (['parse_platform_share', 'parse_douyin_share'].includes(call.function.name)) {
          output = await executePlatformAgentReadTool(call)
        } else {
          let selectedGroupOnly = true
          if (
            ['read_group_messages', 'read_group_member_messages', 'find_group_members'].includes(
              call.function.name
            )
          ) {
            try {
              selectedGroupOnly = JSON.parse(call.function.arguments || '{}').group_id === groupId
            } catch {
              selectedGroupOnly = false
            }
          }
          output = selectedGroupOnly
            ? await executeAgentHubReadTool(call)
            : {
                ok: false,
                error: '本次只允许读取当前选中的群聊；需要其他群聊时，请先切换群聊再提问。'
              }
        }
        this.assertAccount(accountRoot)
        sourceMessages.push(...readMemorySourceMessages(output))
        messages.push({
          role: 'tool',
          content: JSON.stringify(output),
          toolCallId: call.id
        })
      }
    }
    throw new Error('本次读取步骤过多，请缩小群聊、时间或消息数量范围')
  }

  private buildToolAgentMessages(input: {
    input: AgentHubLocalAskRequest
    groupId: string
    groupName: string
    question: string
    exactReadRequirement: string
  }): AIToolChatMessage[] {
    const now = new Date()
    const localTime = now.toLocaleString('zh-CN', { hour12: false })
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return [
      {
        role: 'system',
        content: buildAgentHubSystemPrompt(
          localTime,
          timezone,
          loadSettings().agentHubCustomInstructions
        )
      },
      ...(Array.isArray(input.input.history) ? input.input.history : [])
        .slice(-12)
        .map((message) => ({
          role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: String(message.content || '')
            .trim()
            .slice(0, 4000)
        }))
        .filter((message) => message.content),
      {
        role: 'user',
        content: `当前界面已选择群聊“${input.groupName}”，其已确认的群聊 ID 是 ${input.groupId}。本次只能读取这个群；调用读取工具时直接使用此 ID。如果问题需要其他群聊，请提示我先切换群聊。${input.exactReadRequirement}\n\n我的问题：${input.question}`
      }
    ]
  }

  private async summarizeRecentMessagesFromDatabase(input: {
    groupId: string
    groupName: string
    question: string
    requestedCount: number
    accountRoot: string
    customInstructions: unknown
  }): Promise<{
    answer: string
    toolCallCount: number
    sourceMessages: AgentMemorySourceMessage[]
  }> {
    this.addLog('agent-hub', 'info', `直接从数据库读取最近 ${input.requestedCount} 条消息…`)
    const sources: AgentMemorySourceMessage[] = []
    let cursor: string | undefined
    while (sources.length < input.requestedCount) {
      this.assertAccount(input.accountRoot)
      const page = await executeAgentHubReadTool({
        id: `recent-${sources.length}`,
        type: 'function',
        function: {
          name: 'read_group_messages',
          arguments: JSON.stringify({
            group_id: input.groupId,
            limit: Math.min(1000, input.requestedCount - sources.length),
            before_cursor: cursor
          })
        }
      })
      this.assertAccount(input.accountRoot)
      if (!page.ok) throw new Error(String(page.error || '读取群聊失败'))
      const messages = readMemorySourceMessages(page)
      sources.push(...messages)
      const next = typeof page.next_cursor === 'string' ? page.next_cursor : undefined
      if (!page.has_more || !messages.length || !next || next === cursor) break
      cursor = next
    }
    const source = dedupeMemorySourceMessages(sources)
    if (!source.length) throw new Error('该群聊没有可读取的消息')

    this.addLog(
      'agent-hub',
      'info',
      `数据库读取完成：${source.length}/${input.requestedCount} 条${source.length < input.requestedCount ? '（历史记录不足）' : ''}`
    )

    this.addLog('agent-hub', 'info', `正在将 ${source.length} 条消息一次性发送给模型总结…`)
    const result = await agentAIProvider.chat([
      { role: 'system', content: buildDirectSummaryPrompt(input.customInstructions) },
      {
        role: 'user',
        content: `群聊：${input.groupName}\n用户问题：${input.question}\n实际从本地数据库读取：${source.length} 条消息${source.length < input.requestedCount ? `（用户要求 ${input.requestedCount} 条，但数据库只找到 ${source.length} 条）` : ''}。\n\n以下是聊天记录，请直接生成最终总结：\n\n${source.map((message) => `[${message.time}] ${message.sender}：${message.text}`).join('\n')}`
      }
    ])
    if (!result.success || !String(result.data || '').trim()) {
      throw new Error(result.error || '最终总结生成失败')
    }
    return {
      answer: String(result.data).trim(),
      toolCallCount: 0,
      sourceMessages: source
    }
  }

  private formatAIReply(content: string): string {
    return content
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]*•[ \t]*/g, '\n• ')
      .replace(/[ \t]+(?=\d+[.、][ \t])/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  private assertAccount(accountRoot: string): void {
    if (!isReady() || getCurrentAccountRoot() !== accountRoot) {
      throw new Error('微信账号已切换或数据库已断开，本次结果已丢弃，请重新提问')
    }
  }

  private memoryMarkdown(draft: AgentMemoryDraft): string {
    return renderAgentMemoryExport(draft)
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private addLog(source: AgentHubLogSource, level: AgentHubLogLevel, rawMessage: string): void {
    const message = this.redactLog(rawMessage).trim()
    if (!message) return
    const entry: AgentHubLogEntry = {
      id: this.nextLogId++,
      timestamp: Date.now(),
      source,
      level,
      message
    }
    this.logs.push(entry)
    if (this.logs.length > MAX_LOG_ENTRIES) this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES)
    try {
      const filePath = this.logFilePath()
      mkdirSync(dirname(filePath), { recursive: true })
      appendFileSync(
        filePath,
        `${new Date(entry.timestamp).toISOString()} [${source}] [${level}] ${message}\n`,
        'utf8'
      )
    } catch {
      // Logging must never interrupt a local question.
    }
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('agent-hub:log', entry)
    }
  }

  private redactLog(message: string): string {
    return message
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [已隐藏]')
      .replace(/(token[=:\s]+)[^\s,}]+/gi, '$1[已隐藏]')
  }

  private logFilePath(): string {
    return join(app.getPath('logs'), 'ai-assistant.log')
  }
}

function readMemorySourceMessages(output: Record<string, unknown>): AgentMemorySourceMessage[] {
  const messages = output['messages']
  if (!Array.isArray(messages)) return []
  return messages.flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const message = value as Record<string, unknown>
    const id = String(message['id'] || '').trim()
    const text = String(message['text'] || '').trim()
    if (!id || !text) return []
    const unixTime = Number(message['unix_time'])
    return [
      {
        id,
        unixTime: Number.isFinite(unixTime) ? unixTime : undefined,
        time: String(message['time'] || ''),
        sender: String(message['sender'] || '未知成员'),
        type: String(message['type'] || '消息'),
        text
      }
    ]
  })
}

function dedupeMemorySourceMessages(
  messages: AgentMemorySourceMessage[]
): AgentMemorySourceMessage[] {
  const result = new Map<string, AgentMemorySourceMessage>()
  for (const message of messages) result.set(message.id, message)
  return [...result.values()].sort((left, right) => (left.unixTime || 0) - (right.unixTime || 0))
}

function parseRequestedRecentMessageCount(question: string): number | null {
  const match = String(question || '').match(/(?:最近|近)\s*(\d+)\s*条(?:消息|聊天记录)?/)
  if (!match?.[1]) return null
  const count = Number(match[1])
  if (!Number.isFinite(count) || count > 5000)
    throw new Error('单次最多总结 5000 条消息，请分段提问')
  if (count < 1) return null
  return Math.floor(count)
}

function isPlainRecentSummaryQuestion(question: string): boolean {
  // Only a whole-group count request can bypass the tools that apply member/time filters.
  const normalized = String(question || '')
    .replace(/\s+/g, '')
    .replace(/[。！？.!?]+$/, '')
  return /^(?:请)?(?:帮我)?(?:总结|汇总|概括|梳理|提炼)(?:一下)?(?:本群(?:聊)?的?)?(?:最近|近)\d+条(?:消息|聊天记录)?$/.test(
    normalized
  )
}

function buildDirectSummaryPrompt(customInstructions: unknown): string {
  const custom = normalizeAgentHubCustomInstructions(customInstructions)
  const customSection = custom ? `\n\n用户的总结偏好：\n${custom}` : ''
  return `你是花笺的本地群聊总结助手。只根据提供的完整真实聊天记录回答，不要编造，不要输出 JSON、函数调用、工具参数或内部处理过程。请使用清晰的中文标题、分段和列表，优先写主要话题、结论、决定、待办和未解决问题；必要时注明发言人和时间。${customSection}`
}

function safeMemoryFilePart(value: string): string {
  const safe = basename(String(value || '记忆'))
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return (safe || '记忆').slice(0, 80)
}

export const agentHubService = new AgentHubService()
