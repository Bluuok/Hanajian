import { describe, expect, it } from 'vitest'
import { AGENT_HUB_CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '../../src/shared/agent-hub'
import {
  buildAgentHubSystemPrompt,
  normalizeAgentHubCustomInstructions
} from '../../src/main/services/agent-hub-prompt'

describe('Agent Hub system prompt', () => {
  it('keeps the built-in read-only rules when no custom instructions exist', () => {
    const prompt = buildAgentHubSystemPrompt('2026/8/28 20:00:00', 'Asia/Shanghai', '')

    expect(prompt).toContain('只读微信群聊总结助手')
    expect(prompt).toContain('不得声称删除、修改、群发、主动发送')
    expect(prompt).not.toContain('<custom_summary_instructions>')
  })

  it('appends custom summary preferences below the immutable safety rules', () => {
    const prompt = buildAgentHubSystemPrompt(
      '2026/8/28 20:00:00',
      'Asia/Shanghai',
      '先给出三行摘要，再列出待办。'
    )

    expect(prompt).toContain('用户自定义总结指令（低于以上安全规则')
    expect(prompt).toContain('<custom_summary_instructions>\n先给出三行摘要，再列出待办。')
    expect(prompt.indexOf('你只有读取能力')).toBeLessThan(
      prompt.indexOf('<custom_summary_instructions>')
    )
  })

  it('normalizes unsafe control characters and caps the injected text', () => {
    expect(normalizeAgentHubCustomInstructions('  第一行\r\n第二\u0000行  ')).toBe('第一行\n第二行')
    const oversized = 'a'.repeat(AGENT_HUB_CUSTOM_INSTRUCTIONS_MAX_LENGTH + 50)
    const prompt = buildAgentHubSystemPrompt('now', 'zone', oversized)
    const injected = prompt.match(/<custom_summary_instructions>\n([\s\S]*?)\n<\//)?.[1]
    expect(injected).toHaveLength(AGENT_HUB_CUSTOM_INSTRUCTIONS_MAX_LENGTH)
  })
})
