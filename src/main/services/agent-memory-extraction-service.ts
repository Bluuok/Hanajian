import { createHash } from 'crypto'
import type {
  AgentMemoryDraft,
  AgentMemoryExtractionOptions,
  AgentMemorySourceMessage
} from '../../shared/agent-memory'
import {
  AGENT_MEMORY_FOCUS_MAX_LENGTH,
  AGENT_MEMORY_STYLE_MAX_LENGTH
} from '../../shared/agent-memory'
import {
  buildAgentMemoryFormatPrompt,
  countAgentMemorySources,
  getAgentMemoryFormat,
  parseAgentMemoryDocument,
  renderAgentMemoryDocument
} from '../../shared/agent-memory-format'
import type { AgentMemoryDocument, AgentMemoryFormat } from '../../shared/agent-memory-format'
import { AIProviderService } from './ai-provider-service'

type ChatClient = Pick<AIProviderService, 'chat'>

export class AgentMemoryExtractionService {
  constructor(private readonly ai: ChatClient = new AIProviderService()) {}

  async createDraft(input: {
    groupId: string
    groupName: string
    sourceMessages: AgentMemorySourceMessage[]
    options: AgentMemoryExtractionOptions
  }): Promise<AgentMemoryDraft> {
    const generatedAt = Date.now()
    const focus = String(input.options.focus || '')
      .trim()
      .slice(0, AGENT_MEMORY_FOCUS_MAX_LENGTH)
    const writingStyle = String(input.options.writingStyle || '')
      .trim()
      .slice(0, AGENT_MEMORY_STYLE_MAX_LENGTH)
    // Use the full range read for this request. Never silently reduce it to the last 90/180 messages.
    const sourceMessages = dedupeMessages(input.sourceMessages)
    const base = {
      id: createHash('sha256')
        .update(`${input.groupId}:${generatedAt}:${focus}`)
        .digest('hex')
        .slice(0, 18),
      groupId: input.groupId,
      groupName: input.groupName,
      focus,
      writingStyle,
      generatedAt,
      sourceMessageCount: sourceMessages.length,
      selectedMessageCount: 0,
      professionalMessageCount: 0,
      excludedMessageCount: 0
    }
    if (!sourceMessages.length) {
      return {
        ...base,
        success: false,
        title: '未生成记忆草稿',
        markdown: '',
        error: '本次总结没有读取到可供提取的消息，请先让 AI 总结具体的消息范围。'
      }
    }
    try {
      const format = getAgentMemoryFormat(input.options.formatId)
      const document = await this.extractKnowledge(sourceMessages, focus, format, writingStyle)
      const selectedMessageCount = countAgentMemorySources(document)
      return {
        ...base,
        formatId: format.id,
        success: true,
        title: document.title,
        markdown: renderAgentMemoryDocument(document, format, sourceMessages),
        selectedMessageCount,
        professionalMessageCount: selectedMessageCount,
        excludedMessageCount: sourceMessages.length - selectedMessageCount,
        warning: selectedMessageCount ? undefined : '本次消息中没有找到符合提取要求的可沉淀内容。'
      }
    } catch (error) {
      return {
        ...base,
        success: false,
        title: '记忆草稿生成失败',
        markdown: '',
        error: error instanceof Error ? error.message : '记忆草稿生成失败'
      }
    }
  }

  private async extractKnowledge(
    sourceMessages: AgentMemorySourceMessage[],
    focus: string,
    format: AgentMemoryFormat,
    writingStyle: string
  ): Promise<AgentMemoryDocument> {
    const promptMessages = [
      { role: 'system', content: buildAgentMemoryFormatPrompt(format) },
      {
        role: 'user',
        content: `${focus ? `提取要求：${focus}` : '提取要求：保留可复用的专业知识与资源。'}${writingStyle ? `\n表达要求：${writingStyle}。保持模板结构和来源引用。` : ''}\n\n本次读取的消息（JSON 数据）：\n${JSON.stringify(sourceMessages)}`
      }
    ]
    const result = await this.ai.chat(promptMessages)
    if (!result.success || !result.data?.trim())
      throw new Error(result.error || 'AI 没有返回记忆草稿')
    let validationError: string
    try {
      return parseAgentMemoryDocument(result.data, format, sourceMessages)
    } catch (error) {
      validationError = error instanceof Error ? error.message : '格式校验失败'
    }
    // Compatibility with providers without response_format: prompt + validation + one repair.
    const repaired = await this.ai.chat([
      ...promptMessages,
      { role: 'assistant', content: result.data.trim() },
      {
        role: 'user',
        content: `上一次输出不符合要求：${validationError}。请根据原始消息和提取要求，严格按 system prompt 中的完整 JSON 模板重新输出。所有分区必须存在，来源只用真实消息 ID，正文不得混入来源。不要解释，不要 Markdown。`
      }
    ])
    if (!repaired.success || !repaired.data?.trim())
      throw new Error(repaired.error || 'AI 未能按要求重写记忆草稿')
    try {
      return parseAgentMemoryDocument(repaired.data, format, sourceMessages)
    } catch (error) {
      throw new Error(
        `AI 两次输出均不符合记忆提取格式：${error instanceof Error ? error.message : '格式校验失败'}`
      )
    }
  }
}

function dedupeMessages(messages: AgentMemorySourceMessage[]): AgentMemorySourceMessage[] {
  const result = new Map<string, AgentMemorySourceMessage>()
  for (const message of messages) {
    if (!message?.id || !String(message.text || '').trim()) continue
    result.set(String(message.id), {
      id: String(message.id),
      unixTime: Number.isFinite(message.unixTime) ? message.unixTime : undefined,
      time: String(message.time || ''),
      sender: String(message.sender || '未知成员'),
      type: String(message.type || '消息'),
      text: String(message.text).trim()
    })
  }
  return [...result.values()].sort((left, right) => (left.unixTime || 0) - (right.unixTime || 0))
}
