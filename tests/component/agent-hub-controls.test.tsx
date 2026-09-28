import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentHubWorkspace } from '../../src/renderer/src/features/agent-hub/AgentHubWorkspace'
import type { AgentHubStatus } from '../../src/shared/agent-hub'

const onlineStatus: AgentHubStatus = {
  hub: 'online',
  connector: 'online',
  updatedAt: 1,
  dataApi: 'online',
  databaseReady: true,
  accountId: 'fixture-agent'
}

describe('Clawbot controls', () => {
  beforeEach(() => {
    window.api = {
      getAgentHubStatus: vi.fn().mockResolvedValue(onlineStatus),
      getAgentHubLogs: vi.fn().mockResolvedValue([
        { id: 1, timestamp: 1, source: 'system', level: 'info', message: '系统就绪' },
        {
          id: 2,
          timestamp: 2,
          source: 'wechat-connector',
          level: 'warn',
          message: '等待连接'
        }
      ]),
      getAgentHubPromptSettings: vi.fn().mockResolvedValue({
        customInstructions: '',
        maxLength: 4000
      }),
      saveAgentHubPromptSettings: vi.fn(async (customInstructions: string) => ({
        success: true,
        settings: { customInstructions: customInstructions.trim(), maxLength: 4000 }
      })),
      onAgentHubStatus: vi.fn(() => () => undefined),
      onAgentHubLog: vi.fn(() => () => undefined),
      copyText: vi.fn().mockResolvedValue(undefined),
      clearAgentHubLogs: vi.fn().mockResolvedValue({ success: true }),
      startAgentHubLogin: vi.fn().mockResolvedValue({ status: onlineStatus }),
      cancelAgentHubLogin: vi.fn().mockResolvedValue({ status: onlineStatus }),
      disconnectAgentHub: vi.fn().mockResolvedValue({
        status: { ...onlineStatus, connector: 'disconnected' }
      })
    } as typeof window.api
  })

  it('filters, copies, and clears logs through shared controls', async () => {
    const user = userEvent.setup()
    render(<AgentHubWorkspace />)
    await screen.findByText('系统就绪')

    await user.click(screen.getByRole('combobox', { name: '筛选日志来源' }))
    await user.click(screen.getByRole('option', { name: '系统', exact: true }))
    expect(screen.getByText('系统就绪')).toBeInTheDocument()
    expect(screen.queryByText('等待连接')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '复制日志' }))
    expect(window.api.copyText).toHaveBeenCalledWith(expect.stringContaining('系统就绪'))
    expect(window.api.copyText).toHaveBeenCalledWith(expect.not.stringContaining('等待连接'))

    await user.click(screen.getByRole('button', { name: '清空' }))
    expect(window.api.clearAgentHubLogs).toHaveBeenCalledOnce()
    expect(screen.getByText(/暂无运行日志/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制日志' })).toBeDisabled()
  })

  it('keeps the enabled capability examples visible', async () => {
    render(<AgentHubWorkspace />)
    await screen.findByText('系统就绪')

    expect(screen.getByRole('heading', { name: 'Clawbot' })).toBeInTheDocument()
    expect(screen.getByText('已启用能力')).toBeInTheDocument()
    expect(screen.getByText('微信数据助手')).toBeInTheDocument()
    expect(screen.getByText('支持自然语言总结，可以这样问')).toBeInTheDocument()
    expect(screen.getByText('“总结产品交流群最近 100 条消息”')).toBeInTheDocument()
    expect(screen.getByText('“总结产品交流群今天下午的消息”')).toBeInTheDocument()
    expect(screen.getByText('“总结技术群里张三最近的发言”')).toBeInTheDocument()
    expect(screen.getByText('不提供删除、修改、群发或主动发送工具')).toBeInTheDocument()
    expect(
      document.querySelectorAll(
        '.agent-hub-capability-card li:not(.agent-hub-capability-status) > i'
      )
    ).toHaveLength(5)
  })

  it('keeps reconnect and destructive disconnect actions separate', async () => {
    const user = userEvent.setup()
    render(<AgentHubWorkspace />)
    await screen.findByText('微信机器人已连接')

    await user.click(screen.getByRole('button', { name: '重新扫码登录' }))
    expect(window.api.startAgentHubLogin).toHaveBeenCalledOnce()

    const disconnect = screen.getByRole('button', { name: '断开连接' })
    expect(disconnect).toHaveClass('bg-destructive')
    await user.click(disconnect)
    await act(async () => {
      await Promise.resolve()
    })
    expect(window.api.disconnectAgentHub).toHaveBeenCalledOnce()
  })

  it('saves and resets custom summary instructions without changing safety rules', async () => {
    const user = userEvent.setup()
    render(<AgentHubWorkspace />)
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
