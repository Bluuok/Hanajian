import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIAssistantSettingsWorkspace } from '../../src/renderer/src/features/agent-hub/AgentHubWorkspace'

describe('AI assistant settings', () => {
  beforeEach(() => {
    window.api = {
      getAgentHubLogs: vi.fn().mockResolvedValue([
        { id: 1, timestamp: 1, source: 'system', level: 'info', message: '系统就绪' },
        { id: 2, timestamp: 2, source: 'agent-hub', level: 'info', message: '只读查询完成' }
      ]),
      getAgentHubPromptSettings: vi.fn().mockResolvedValue({
        customInstructions: '',
        maxLength: 4000
      }),
      saveAgentHubPromptSettings: vi.fn(async (customInstructions: string) => ({
        success: true,
        settings: { customInstructions: customInstructions.trim(), maxLength: 4000 }
      })),
      onAgentHubLog: vi.fn(() => () => undefined),
      copyText: vi.fn().mockResolvedValue(undefined),
      clearAgentHubLogs: vi.fn().mockResolvedValue(undefined)
    } as typeof window.api
  })

  it('filters, copies, and clears local AI logs', async () => {
    const user = userEvent.setup()
    render(<AIAssistantSettingsWorkspace />)
    await screen.findByText('系统就绪')

    await user.click(screen.getByRole('combobox', { name: '筛选日志来源' }))
    await user.click(screen.getByRole('option', { name: '系统', exact: true }))
    expect(screen.getByText('系统就绪')).toBeInTheDocument()
    expect(screen.queryByText('只读查询完成')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '复制日志' }))
    expect(window.api.copyText).toHaveBeenCalledWith(expect.stringContaining('系统就绪'))
    expect(window.api.copyText).toHaveBeenCalledWith(expect.not.stringContaining('只读查询完成'))

    await user.click(screen.getByRole('button', { name: '清空' }))
    expect(window.api.clearAgentHubLogs).toHaveBeenCalledOnce()
    expect(screen.getByText(/暂无运行日志/)).toBeInTheDocument()
  })

  it('shows only local read-only assistant settings and no connector controls', async () => {
    render(<AIAssistantSettingsWorkspace />)
    await screen.findByText('系统就绪')

    expect(screen.getByRole('heading', { name: 'AI 助手设置' })).toBeInTheDocument()
    expect(screen.getByText('仅使用本机只读聊天工具')).toBeInTheDocument()
    expect(screen.queryByText('Clawbot')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /扫码|连接|发送/ })).not.toBeInTheDocument()
  })

  it('saves and resets custom summary instructions without changing safety rules', async () => {
    const user = userEvent.setup()
    render(<AIAssistantSettingsWorkspace />)
    const prompt = await screen.findByRole('textbox', { name: '附加指令' })

    expect(screen.getByText('只读规则始终生效')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存指令' })).toBeDisabled()

    await user.type(prompt, '先给出三行摘要，再列出待办。')
    await user.click(screen.getByRole('button', { name: '保存指令' }))
    expect(window.api.saveAgentHubPromptSettings).toHaveBeenLastCalledWith(
      '先给出三行摘要，再列出待办。'
    )

    await user.click(screen.getByRole('button', { name: '恢复默认' }))
    expect(window.api.saveAgentHubPromptSettings).toHaveBeenLastCalledWith('')
  })
})
