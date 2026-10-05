import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AskAIWorkspace } from '../../src/renderer/src/features/ask-ai/AskAIWorkspace'
import { TooltipProvider } from '../../src/renderer/src/components/ui'
import type { Contact } from '../../src/shared/types'
import type { TopicBundle, TopicCenterState } from '../../src/shared/topic-digest'

const group: Contact = {
  m_nsUsrName: 'fixture@chatroom',
  m_nsNickName: 'helson的agent学习群',
  md5: 'fixture-group',
  type: 'group'
}

const emptyCenter: TopicCenterState = {
  subscriptions: [],
  runs: [],
  nativeForward: {
    supported: false,
    reason: '当前连接不支持原生合并聊天记录，结果只保存在本机。'
  }
}

const topicBundle: TopicBundle = {
  id: 'bundle-1',
  query: {
    groupId: 'fixture-group',
    topic: 'craft',
    aliases: ['手作'],
    excludes: ['招聘'],
    memberIds: ['wxid-a'],
    startTime: 1_700_000_000,
    endTime: 1_700_003_600,
    timezone: 'Asia/Shanghai'
  },
  groupName: 'helson的agent学习群',
  createdAt: 1_700_004_000_000,
  evidence: [
    {
      id: 'E1',
      messageId: 'message-1',
      sender: 'Alice',
      senderId: 'wxid-a',
      timestamp: 1_700_000_100,
      text: '这是候选消息的原文全文。',
      type: 'text',
      reason: '关键词',
      selected: true
    }
  ],
  claims: [{ kind: '决定', text: '确定采用手作方案。', evidenceIds: ['E1'] }],
  scannedCount: 8,
  complete: true,
  warnings: ['图片消息未纳入文本证据'],
  review: 'verified'
}

const renderWorkspace = (accountScope?: string): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <AskAIWorkspace
        accountScope={accountScope}
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

  it('keeps histories separate for accounts with the same group identifier', async () => {
    const user = userEvent.setup()
    window.api = {
      askAgentHubLocal: vi.fn().mockResolvedValue({ success: true, answer: '账号甲的讨论' })
    } as typeof window.api
    const accountA = renderWorkspace('account-a')
    await user.type(screen.getByRole('textbox', { name: '向 AI 提问' }), '整理这次讨论')
    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByText('账号甲的讨论')).toBeInTheDocument()
    accountA.unmount()
    const accountB = renderWorkspace('account-b')
    expect(screen.queryByText('账号甲的讨论')).not.toBeInTheDocument()
    accountB.unmount()
    renderWorkspace('account-a')
    expect(screen.getByText('账号甲的讨论')).toBeInTheDocument()
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

  it('passes structured topic conditions and keeps the bundle outside chat history', async () => {
    const user = userEvent.setup()
    window.api = {
      askAgentHubLocal: vi.fn().mockResolvedValue({ success: true, bundle: topicBundle }),
      getTopicCenter: vi.fn().mockResolvedValue(emptyCenter),
      getAgentHubStatus: vi.fn().mockResolvedValue({
        hub: 'online',
        connector: 'online',
        wechatUserId: 'wxid-owner',
        updatedAt: Date.now()
      })
    } as typeof window.api
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: '话题' }))
    await user.clear(screen.getByRole('textbox', { name: '别名' }))
    await user.type(screen.getByRole('textbox', { name: '别名' }), '手作, 工艺')
    await user.type(screen.getByRole('textbox', { name: '排除' }), '招聘')
    await user.type(screen.getByRole('textbox', { name: '成员 ID' }), 'wxid-a')
    fireEvent.change(screen.getByLabelText('开始时间'), {
      target: { value: '2026-09-10T08:30:00' }
    })
    fireEvent.change(screen.getByLabelText('结束时间'), {
      target: { value: '2026-09-10T09:45:00' }
    })
    expect(screen.getByRole('textbox', { name: '时区' })).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: '生成话题包' }))

    expect(window.api.askAgentHubLocal).toHaveBeenCalledWith({
      question: '整理话题：craft',
      groupId: 'fixture-group',
      groupName: 'helson的agent学习群',
      topicQuery: {
        groupId: 'fixture-group',
        topic: 'craft',
        aliases: ['手作', '工艺'],
        excludes: ['招聘'],
        memberIds: ['wxid-a'],
        startTime: Math.floor(new Date('2026-09-10T08:30:00+08:00').getTime() / 1000),
        endTime: Math.floor(new Date('2026-09-10T09:45:00+08:00').getTime() / 1000),
        timezone: 'Asia/Shanghai'
      }
    })
    expect(await screen.findByText('这是候选消息的原文全文。')).toBeInTheDocument()
    expect(localStorage.getItem('tracedigest_ask_ai_histories_v1')).toBeNull()
  })

  it('does not submit Enter while an IME composition is active', async () => {
    window.api = { askAgentHubLocal: vi.fn() } as typeof window.api
    renderWorkspace()
    const composer = screen.getByRole('textbox', { name: '向 AI 提问' })
    fireEvent.change(composer, { target: { value: '中文输入' } })

    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter', isComposing: true })
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter', keyCode: 229 })

    expect(window.api.askAgentHubLocal).not.toHaveBeenCalled()
    expect(composer).toHaveValue('中文输入')
  })

  it('only labels a legacy blocked subscription as saved when its local bundle exists', async () => {
    const user = userEvent.setup()
    const center: TopicCenterState = {
      ...emptyCenter,
      runs: [
        { id: 'blocked-empty', subscriptionId: 'legacy-1', windowEnd: 1_700_003_600, startedAt: 1_700_004_000_000, status: 'blocked', message: '旧任务没有本地话题包' },
        { id: 'blocked-saved', subscriptionId: 'legacy-2', windowEnd: 1_700_003_600, startedAt: 1_700_004_000_000, status: 'blocked', message: '旧任务已留存本地话题包', bundle: topicBundle }
      ]
    }
    window.api = { getTopicCenter: vi.fn().mockResolvedValue(center) } as typeof window.api
    renderWorkspace()
    await user.click(screen.getByRole('button', { name: '话题' }))
    const unsaved = (await screen.findByText('旧任务没有本地话题包')).closest('article')!
    const saved = screen.getByText('旧任务已留存本地话题包').closest('article')!
    expect(within(unsaved).getByText('未保存')).toBeInTheDocument()
    expect(within(unsaved).queryByText('已保存')).not.toBeInTheDocument()
    expect(within(saved).getByText('已保存')).toBeInTheDocument()
  })

  it('locates cited evidence and invalidates claims after manual selection changes', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    })
    window.api = {
      askAgentHubLocal: vi.fn().mockResolvedValue({ success: true, bundle: topicBundle }),
      getTopicCenter: vi.fn().mockResolvedValue(emptyCenter),
      getAgentHubStatus: vi.fn().mockResolvedValue({
        hub: 'offline',
        connector: 'disconnected',
        updatedAt: Date.now()
      })
    } as typeof window.api
    renderWorkspace()

    await user.click(screen.getByRole('button', { name: '话题' }))
    expect(await screen.findByText(/结果保存在本机，不需要机器人账号/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存订阅' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '生成话题包' }))
    const preview = await screen.findByRole('region', { name: '话题包预览' })
    await user.click(within(preview).getByRole('button', { name: '定位证据 E1' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })

    await user.click(within(preview).getByRole('checkbox', { name: '选择候选消息 E1' }))
    expect(
      screen.getByText('候选消息已人工修改，原 AI 结论已失效。请重新生成话题包。')
    ).toBeInTheDocument()
    expect(screen.queryByText('确定采用手作方案。')).not.toBeInTheDocument()
  })
  it('previews an optional memory draft and writes it only after confirmation', async () => {
    const user = userEvent.setup()
    window.api = {
      askAgentHubLocal: vi.fn().mockResolvedValue({
        success: true,
        answer: '本次讨论完成。',
        memoryDraft: {
          id: 'draft-1',
          success: true,
          title: 'Agent 工具设计要点',
          markdown: '# Agent 工具设计要点\n\n- 查询工具应保持只读。',
          groupId: 'fixture-group',
          groupName: 'helson的agent学习群',
          focus: '只保留 Agent 工程实践',
          generatedAt: Date.now(),
          sourceMessageCount: 20,
          professionalMessageCount: 8,
          excludedMessageCount: 12
        }
      }),
      selectExportDirectory: vi.fn().mockResolvedValue({ canceled: false, path: 'D:\\记忆库' }),
      writeAgentHubMemoryDraft: vi.fn().mockResolvedValue({
        success: true,
        path: 'D:\\记忆库\\Agent 工具设计要点.md'
      })
    } as typeof window.api

    renderWorkspace()
    await user.click(screen.getByRole('checkbox', { name: /提取专业记忆/ }))
    const memoryFocusInput = screen.getByRole('textbox', { name: '记忆提取提示词' })
    await user.clear(memoryFocusInput)
    await user.type(memoryFocusInput, '只保留 Agent 工程实践')
    await user.selectOptions(screen.getByRole('combobox', { name: '笔记格式' }), 'action-memory-v1')
    await user.type(screen.getByRole('textbox', { name: '记忆表达风格' }), '简短条目')
    await user.click(screen.getByRole('button', { name: '选择保存路径' }))
    await user.type(screen.getByRole('textbox', { name: '向 AI 提问' }), '总结最近100条')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('Agent 工具设计要点')).toBeInTheDocument()
    expect(screen.getByText('记忆提取设置').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText(/本次读取 20 条，沉淀内容引用 8 条消息/)).toBeInTheDocument()
    const preview = screen.getByText(/# Agent 工具设计要点/)
    expect(preview.textContent).toContain('- 来源群聊：helson的agent学习群')
    expect(preview.textContent).toContain('- 草稿 ID：draft-1')
    expect(preview.textContent).toContain('- 沉淀来源消息：8/20')
    expect(preview.textContent).not.toContain('第一轮')
    expect(window.api.writeAgentHubMemoryDraft).not.toHaveBeenCalled()
    expect(window.api.askAgentHubLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryExtraction: {
          enabled: true,
          focus: '只保留 Agent 工程实践',
          formatId: 'action-memory-v1',
          writingStyle: '简短条目'
        }
      })
    )
    await user.click(screen.getByRole('button', { name: '写入记忆库' }))
    expect(window.api.writeAgentHubMemoryDraft).toHaveBeenCalledWith(
      expect.objectContaining({ outputDirectory: 'D:\\记忆库' })
    )
    expect(await screen.findByText(/已写入：D:\\记忆库/)).toBeInTheDocument()
  })
})
