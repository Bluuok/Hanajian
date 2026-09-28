import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AskAIWorkspace } from '../../src/renderer/src/features/ask-ai/AskAIWorkspace'
import { TooltipProvider } from '../../src/renderer/src/components/ui'
import type { Contact } from '../../src/shared/types'

const group: Contact = {
  m_nsUsrName: 'fixture@chatroom',
  m_nsNickName: 'helson的agent学习群',
  md5: 'fixture-group',
  type: 'group'
}

const renderWorkspace = (): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <AskAIWorkspace
        contacts={[group]}
        selectedContact={group}
        messages={[]}
        isLoadingMessages={false}
        messageHistoryStatus="idle"
        contentFilter=""
        onContentFilterChange={vi.fn()}
        onSelectGroup={vi.fn().mockResolvedValue(undefined)}
        onRefreshGroups={vi.fn().mockResolvedValue(undefined)}
        onRefreshData={vi.fn().mockResolvedValue(undefined)}
        onReloadAvatars={vi.fn().mockResolvedValue(undefined)}
        onLoadOlderMessages={vi.fn().mockResolvedValue(undefined)}
        onCreateGroupReport={vi.fn()}
        onOpenTextToSpeechSettings={vi.fn()}
        isAiReportLoading={false}
      />
    </TooltipProvider>
  )

describe('AskAIWorkspace', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
      }
    )
  })

  it('scopes a question to the selected group and keeps the answer after remounting', async () => {
    const user = userEvent.setup()
    window.api = {
      askAgentHubLocal: vi.fn().mockResolvedValue({
        success: true,
        answer: '最近讨论了 Agent 工具设计，并确认所有工具保持只读。',
        toolCallCount: 1
      })
    } as typeof window.api

    const view = renderWorkspace()

    expect(screen.getByRole('heading', { name: '问问 AI' })).toBeInTheDocument()
    expect(screen.getByText('正在查看：helson的agent学习群')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: '向 AI 提问' }), '总结最近100条')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(window.api.askAgentHubLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        question: '总结最近100条',
        groupId: 'fixture-group',
        groupName: 'helson的agent学习群'
      })
    )
    expect(
      await screen.findByText('最近讨论了 Agent 工具设计，并确认所有工具保持只读。')
    ).toBeInTheDocument()

    view.unmount()
    renderWorkspace()
    expect(
      screen.getByText('最近讨论了 Agent 工具设计，并确认所有工具保持只读。')
    ).toBeInTheDocument()
  })

  it('lets the user choose retention, clear history, and resize both side panels', async () => {
    const user = userEvent.setup()
    window.api = {
      askAgentHubLocal: vi.fn().mockResolvedValue({ success: true, answer: '测试回答' })
    } as typeof window.api
    const view = renderWorkspace()

    const retention = screen.getByRole('combobox', { name: '自动清空历史时间' })
    expect(retention).toHaveValue('30d')
    await user.selectOptions(retention, '7d')
    expect(localStorage.getItem('tracedigest_ask_ai_retention')).toBe('7d')

    const leftSeparator = screen.getByRole('separator', { name: '调整群聊列表宽度' })
    const rightSeparator = screen.getByRole('separator', { name: '调整 AI 对话框宽度' })
    expect(leftSeparator).toHaveAttribute('aria-valuenow', '250')
    expect(rightSeparator).toHaveAttribute('aria-valuenow', '390')
    leftSeparator.focus()
    await user.keyboard('{ArrowRight}')
    expect(leftSeparator).toHaveAttribute('aria-valuenow', '262')
    rightSeparator.focus()
    await user.keyboard('{ArrowLeft}')
    expect(rightSeparator).toHaveAttribute('aria-valuenow', '402')

    view.unmount()
    renderWorkspace()
    expect(screen.getByRole('separator', { name: '调整群聊列表宽度' })).toHaveAttribute(
      'aria-valuenow',
      '262'
    )
    expect(screen.getByRole('separator', { name: '调整 AI 对话框宽度' })).toHaveAttribute(
      'aria-valuenow',
      '402'
    )

    await user.type(screen.getByRole('textbox', { name: '向 AI 提问' }), '测试持久化')
    await user.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByText('测试回答')
    await user.click(screen.getByRole('button', { name: '立即清空' }))
    expect(screen.queryByText('测试回答')).not.toBeInTheDocument()
  })

  it('drops locally stored messages after their retention period', () => {
    localStorage.setItem('tracedigest_ask_ai_retention', '1d')
    localStorage.setItem(
      'tracedigest_ask_ai_histories_v1',
      JSON.stringify({
        version: 1,
        groups: {
          'fixture-group': [
            {
              id: 'expired-answer',
              role: 'assistant',
              content: '已经过期的回答',
              timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000
            }
          ]
        }
      })
    )
    window.api = { askAgentHubLocal: vi.fn() } as typeof window.api

    renderWorkspace()

    expect(screen.queryByText('已经过期的回答')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '自动清空历史时间' })).toHaveValue('1d')
  })
})
