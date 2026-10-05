import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const fixture = vi.hoisted(() => ({
  account: 'account-a',
  ready: true,
  root: `${process.cwd()}/test-results/local-ai-assistant-${process.pid}`,
  chat: vi.fn(),
  tools: vi.fn(),
  read: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: () => fixture.root },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('../../src/main/services/settings-store', () => ({
  loadSettings: () => ({ agentHubCustomInstructions: '' }),
  updateSettings: vi.fn()
}))
vi.mock('../../src/main/services/ai-provider-service', () => ({
  AIProviderService: class {
    chat = fixture.chat
    chatWithTools = fixture.tools
  }
}))
vi.mock('../../src/main/services/chat-service', () => ({
  isReady: () => fixture.ready,
  getCurrentAccountRoot: () => fixture.account
}))
vi.mock('../../src/main/services/agent-hub-read-tools', () => ({
  AGENT_HUB_READ_TOOLS: [],
  executeAgentHubReadTool: fixture.read
}))
vi.mock('../../src/main/services/topic-package-service', () => ({ generateTopicBundle: vi.fn() }))
vi.mock('../../src/main/platform-integration/platform-agent-tools', () => ({
  PLATFORM_AGENT_READ_TOOLS: [],
  executePlatformAgentReadTool: vi.fn()
}))

import { agentHubService } from '../../src/main/services/agent-hub-service'
import type { AgentHubLocalAskRequest } from '../../src/shared/agent-hub'

beforeEach(() => {
  fixture.account = 'account-a'
  fixture.ready = true
  fixture.chat.mockReset().mockResolvedValue({ success: true, data: '已整理所有消息' })
  fixture.tools.mockReset()
  fixture.read.mockReset()
  mkdirSync(fixture.root, { recursive: true })
})
const request = (question: string): AgentHubLocalAskRequest => ({
  question,
  groupId: 'group-a',
  groupName: '合成测试群'
})
const message = (
  id: number
): { id: string; text: string; sender: string; time: string; unix_time: number; type: string } => ({
  id: String(id),
  text: `原文-${id}`,
  sender: '测试成员',
  time: String(id),
  unix_time: id,
  type: '文本'
})

describe('local desktop summaries', () => {
  it('reads the requested count across compound-cursor pages before summarizing once', async () => {
    fixture.read.mockImplementation(async (call) => {
      const args = JSON.parse(call.function.arguments)
      return args.before_cursor
        ? {
            ok: true,
            messages: Array.from({ length: 205 }, (_, i) => message(i + 1)),
            has_more: false
          }
        : {
            ok: true,
            messages: Array.from({ length: 1000 }, (_, i) => message(i + 206)),
            has_more: true,
            next_cursor: 'v1:206:206'
          }
    })
    expect(await agentHubService.askLocal(request('总结最近1205条消息'))).toMatchObject({
      success: true,
      answer: '已整理所有消息'
    })
    expect(fixture.read).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fixture.read.mock.calls[1][0].function.arguments)).toMatchObject({
      limit: 205,
      before_cursor: 'v1:206:206'
    })
    expect(fixture.chat).toHaveBeenCalledOnce()
    const prompt = fixture.chat.mock.calls[0][0][1].content
    expect(prompt).toContain('实际从本地数据库读取：1205 条')
    expect(prompt).toContain('原文-1')
    expect(prompt).toContain('原文-1205')
  })
  it('keeps member and time constraints from conversation history when the next question is a plain summary', async () => {
    const history = [{ role: 'user' as const, content: '只看张三今天上午的消息' }]
    const args = {
      group_id: 'group-a',
      member_query: '张三',
      start_time: '2026-10-05 00:00:00',
      end_time: '2026-10-05 12:00:00',
      limit: 100
    }
    fixture.read.mockResolvedValue({ ok: true, messages: [message(1)], has_more: false })
    fixture.tools
      .mockResolvedValueOnce({
        success: true,
        toolCalls: [
          {
            id: 'history-filter',
            type: 'function',
            function: { name: 'read_group_member_messages', arguments: JSON.stringify(args) }
          }
        ]
      })
      .mockResolvedValueOnce({ success: true, content: '保留历史限定' })
    expect(
      await agentHubService.askLocal({ ...request('总结最近100条消息'), history })
    ).toMatchObject({ success: true, answer: '保留历史限定' })
    expect(fixture.tools.mock.calls[0][0]).toContainEqual(history[0])
    expect(fixture.chat).not.toHaveBeenCalled()
    expect(fixture.read.mock.calls[0][0].function.name).toBe('read_group_member_messages')
    expect(JSON.parse(fixture.read.mock.calls[0][0].function.arguments)).toEqual(args)
  })
  it('discards a response if the database account changes during model processing', async () => {
    fixture.read.mockResolvedValue({ ok: true, messages: [message(1)], has_more: false })
    fixture.chat.mockImplementation(async () => {
      fixture.account = 'account-b'
      return { success: true, data: '旧账号回答' }
    })
    const result = await agentHubService.askLocal(request('总结最近1条消息'))
    expect(result.success).toBe(false)
    expect(result.error).toContain('账号已切换')
    expect(result.answer).toBeUndefined()
  })
  it.each([9999, 100000])(
    'rejects a requested count of %i instead of silently reporting a smaller count',
    async (count) => {
      const result = await agentHubService.askLocal(request(`总结最近${count}条消息`))
      expect(result.success).toBe(false)
      expect(result.error).toContain('5000')
      expect(fixture.read).not.toHaveBeenCalled()
      expect(fixture.chat).not.toHaveBeenCalled()
    }
  )
  it.each([
    {
      question: '总结张三最近100条消息',
      tool: 'read_group_member_messages',
      args: { group_id: 'group-a', member_query: '张三', limit: 100 }
    },
    {
      question: '总结最近100条消息中张三的发言',
      tool: 'read_group_member_messages',
      args: { group_id: 'group-a', member_query: '张三', limit: 100 }
    },
    {
      question: '总结今天上午最近100条消息',
      tool: 'read_group_messages',
      args: {
        group_id: 'group-a',
        start_time: '2026-10-05 00:00:00',
        end_time: '2026-10-05 12:00:00',
        limit: 100
      }
    }
  ])('keeps the requested filters for $question', async ({ question, tool, args }) => {
    fixture.read.mockResolvedValue({ ok: true, messages: [message(1)], has_more: false })
    fixture.tools
      .mockResolvedValueOnce({
        success: true,
        toolCalls: [
          {
            id: 'filtered-read',
            type: 'function',
            function: { name: tool, arguments: JSON.stringify(args) }
          }
        ]
      })
      .mockResolvedValueOnce({ success: true, content: '已按限定范围整理' })
    expect(await agentHubService.askLocal(request(question))).toMatchObject({
      success: true,
      answer: '已按限定范围整理'
    })
    expect(fixture.tools).toHaveBeenCalledTimes(2)
    expect(fixture.chat).not.toHaveBeenCalled()
    expect(fixture.read).toHaveBeenCalledOnce()
    expect(fixture.read.mock.calls[0][0].function.name).toBe(tool)
    expect(JSON.parse(fixture.read.mock.calls[0][0].function.arguments)).toEqual(args)
  })
  it('rejects a model tool call to another group before reading its messages', async () => {
    fixture.tools
      .mockResolvedValueOnce({
        success: true,
        toolCalls: [
          {
            id: 'wrong-group',
            type: 'function',
            function: {
              name: 'read_group_messages',
              arguments: JSON.stringify({ group_id: 'group-b' })
            }
          }
        ]
      })
      .mockResolvedValueOnce({ success: true, content: '请先切换群聊' })
    expect(await agentHubService.askLocal(request('查找上周的发布计划'))).toMatchObject({
      success: true,
      answer: '请先切换群聊'
    })
    expect(fixture.read).not.toHaveBeenCalled()
    const messages = fixture.tools.mock.calls[1][0]
    expect(messages.find((entry) => entry.role === 'tool').content).toContain(
      '本次只允许读取当前选中的群聊'
    )
  })
  it('only writes an explicit successful draft and preserves existing files', () => {
    const draft = {
      id: 'draft-a',
      success: true,
      title: '合成笔记',
      markdown: '# 合成笔记\n\n原文依据',
      groupId: 'group-a',
      groupName: '合成测试群',
      focus: '工程',
      generatedAt: 1790982000000,
      sourceMessageCount: 1,
      professionalMessageCount: 1,
      excludedMessageCount: 0
    }
    const first = agentHubService.writeMemoryDraft({
      draft,
      outputDirectory: resolve(fixture.root, 'notes')
    })
    const second = agentHubService.writeMemoryDraft({
      draft,
      outputDirectory: resolve(fixture.root, 'notes')
    })
    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(second.path).not.toBe(first.path)
    expect(readFileSync(first.path!, 'utf8')).toContain('- 来源群聊：合成测试群')
    expect(
      agentHubService.writeMemoryDraft({
        draft: { ...draft, success: false },
        outputDirectory: fixture.root
      }).success
    ).toBe(false)
  })
})
