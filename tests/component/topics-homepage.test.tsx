import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TopicsHomePage } from '../../src/renderer/src/features/topics/TopicsHomePage'
import { TopicEmptyState } from '../../src/renderer/src/features/topics/components/TopicEmptyState'
import type { Contact } from '../../src/shared/types'
import type { TopicBundle } from '../../src/shared/topic-digest'
import type { TopicPackage } from '../../src/shared/topic-package'

const fixtureContacts: Contact[] = [
  {
    m_nsUsrName: 'group1@chatroom',
    m_nsNickName: '产品测试群',
    md5: 'group1-md5',
    type: 'group'
  },
  {
    m_nsUsrName: 'group2@chatroom',
    m_nsNickName: '技术交流群',
    md5: 'group2-md5',
    type: 'group'
  }
]

const sampleBundle: TopicBundle = {
  id: 'bundle-1',
  query: {
    groupId: 'group1-md5',
    topic: 'craft',
    aliases: [],
    excludes: [],
    memberIds: [],
    startTime: 1789000000,
    endTime: 1789086399,
    timezone: 'Asia/Shanghai'
  },
  groupName: '产品测试群',
  createdAt: 1789086400,
  claims: [{ kind: '决定', text: '周六上线新功能', evidenceIds: ['E1'] }],
  evidence: [
    {
      id: 'E1',
      messageId: 'msg-1',
      sender: '阿杰',
      timestamp: 1789001000,
      text: '我们周六准备上线新功能',
      type: '文本',
      reason: '核心决定',
      selected: true
    },
    {
      id: 'E2',
      messageId: 'msg-2',
      sender: 'luna',
      timestamp: 1789002000,
      text: '界面非常干净好用',
      type: '文本',
      reason: '用户反馈',
      selected: true
    }
  ],
  scannedCount: 20,
  complete: true,
  warnings: [],
  review: 'verified'
}

const samplePackage: TopicPackage = {
  topicId: 'bundle-1',
  topic: 'craft',
  groupId: 'group1-md5',
  groupName: '产品测试群',
  createdAt: 1789086400,
  dateRange: { start: 1789000000, end: 1789086399, timezone: 'Asia/Shanghai', inclusive: true },
  summary: {
    title: 'craft',
    abstract: '周六上线新功能',
    category: '产品',
    tags: [],
    evidenceCount: 2,
    claims: sampleBundle.claims
  },
  evidences: [
    {
      id: 'E1',
      senderId: 'wxid-ajie',
      senderName: '阿杰',
      sentAt: 1789001000,
      excerpt: '我们周六准备上线新功能',
      selected: true,
      reason: '核心决定',
      sourceLocator: { groupId: 'group1-md5', messageId: 'msg-1', timestamp: 1789001000 }
    },
    {
      id: 'E2',
      senderId: 'wxid-luna',
      senderName: 'luna',
      sentAt: 1789002000,
      excerpt: '界面非常干净好用',
      selected: true,
      reason: '用户反馈',
      sourceLocator: { groupId: 'group1-md5', messageId: 'msg-2', timestamp: 1789002000 }
    }
  ],
  relatedTopics: [],
  capabilities: { relatedTopics: false, categories: false, tags: false },
  review: 'verified',
  scannedCount: 20,
  complete: true,
  warnings: [],
  notices: []
}

describe('TopicsHomePage Defect Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.api = {
      generateTopicPackage: vi.fn().mockResolvedValue({
        success: true,
        package: samplePackage,
        bundle: sampleBundle,
        fromCache: false
      }),
      locateTopicSource: vi.fn().mockResolvedValue({
        success: true,
        message: {
          id: 'msg-1',
          groupId: 'group1-md5',
          senderId: 'wxid-ajie',
          senderName: '阿杰',
          sentAt: 1789001000,
          content: '数据库完整原文：我们周六准备上线新功能。',
          type: '文本'
        }
      }),
      getTopicCenter: vi.fn().mockResolvedValue({
        subscriptions: [],
        runs: [],
        nativeForward: { supported: true }
      }),
      getAgentHubStatus: vi.fn().mockResolvedValue({
        hub: 'online',
        connector: 'online',
        wechatUserId: 'wxid-tester',
        updatedAt: Date.now()
      })
    } as unknown as typeof window.api
  })

  it.each(['initial', 'no_results', 'no_group'] as const)(
    'declares bounded artwork dimensions for the %s empty state',
    (variant) => {
      const { container } = render(<TopicEmptyState variant={variant} topic="craft" />)
      const artwork = container.querySelector('.state-doodle')

      expect(artwork).toHaveAttribute('width', '80')
      expect(artwork).toHaveAttribute('height', '64')
    }
  )

  it('Defect 1: does NOT reset evidence selection or summaryInvalid when switching between E1 and E2', async () => {
    const user = userEvent.setup()
    const onOpenChat = vi.fn()

    render(<TopicsHomePage contacts={fixtureContacts} active={true} onOpenChat={onOpenChat} />)

    // Generate topic package
    await user.click(screen.getByRole('button', { name: '生成话题包' }))
    const results = await screen.findAllByText('周六上线新功能')
    expect(results.length).toBeGreaterThan(0)

    // Both E1 and E2 are checked initially
    const checkE1 = screen.getByRole('checkbox', { name: '选择候选消息 E1' })
    const checkE2 = screen.getByRole('checkbox', { name: '选择候选消息 E2' })
    expect(checkE1).toBeChecked()
    expect(checkE2).toBeChecked()

    // Deselect E1
    await user.click(checkE1)
    expect(checkE1).not.toBeChecked()

    // Summary is now invalidated
    expect(screen.getByRole('alert')).toHaveTextContent('原 AI 结论已失效')

    // Now click on E2 to view or select E2 (e.g. clicking 查看原文 E2)
    const viewE2 = screen.getByRole('button', { name: '查看原文 E2' })
    await user.click(viewE2)

    // Crucial: E1 MUST remain unchecked and summary MUST remain invalidated!
    expect(checkE1).not.toBeChecked()
    expect(checkE2).toBeChecked()
    expect(screen.getByRole('alert')).toHaveTextContent('原 AI 结论已失效')
    expect(screen.queryByText('周六上线新功能', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: '话题分类过滤' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('赞')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('心')).not.toBeInTheDocument()
    expect(screen.queryByText('昨天 18:30')).not.toBeInTheDocument()
  })

  it('Defect 2: preserves original TopicEvidence schema on export and drops claims when summary is invalidated', async () => {
    const user = userEvent.setup()
    const onOpenChat = vi.fn()

    // Intercept URL.createObjectURL and anchor download
    let exportedData: unknown = null
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob) => {
      void blob.text().then((text) => {
        exportedData = JSON.parse(text)
      })
      return 'blob:mock-url'
    })
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(<TopicsHomePage contacts={fixtureContacts} active={true} onOpenChat={onOpenChat} />)

    await user.click(screen.getByRole('button', { name: '生成话题包' }))
    const results = await screen.findAllByText('周六上线新功能')
    expect(results.length).toBeGreaterThan(0)

    // Modify evidence selection (uncheck E1)
    await user.click(screen.getByRole('checkbox', { name: '选择候选消息 E1' }))

    // Click Export button
    await user.click(screen.getByRole('button', { name: '导出本地 JSON' }))

    await waitFor(() => expect(exportedData).not.toBeNull())

    const exported = exportedData as TopicBundle & { manualReview?: string }
    expect(exported.id).toBe('bundle-1')

    // Claims dropped because manual review invalidated summary
    expect(exported.claims).toEqual([])
    expect(exported.review).toBe('unavailable')
    expect(exported.manualReview).toBe('summary-invalidated')

    // Crucial: bundle.evidence preserves original TopicEvidence fields!
    expect(exported.evidence).toHaveLength(2)
    expect(exported.evidence[0]).toMatchObject({
      id: 'E1',
      messageId: 'msg-1',
      sender: '阿杰',
      timestamp: 1789001000,
      text: '我们周六准备上线新功能',
      type: '文本',
      selected: false // Updated selection reflected
    })
    expect(exported.evidence[1]).toMatchObject({
      id: 'E2',
      messageId: 'msg-2',
      sender: 'luna',
      timestamp: 1789002000,
      text: '界面非常干净好用',
      type: '文本',
      selected: true
    })

    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })

  it('Defect 3: invalidates prior source message and in-flight source requests upon new generation', async () => {
    const user = userEvent.setup()
    const onOpenChat = vi.fn()

    // Mock locateTopicSource with a delayed response
    let resolveSource: (val: unknown) => void = () => {}
    ;(window.api.locateTopicSource as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSource = resolve
        })
    )

    render(<TopicsHomePage contacts={fixtureContacts} active={true} onOpenChat={onOpenChat} />)

    // Generate package
    await user.click(screen.getByRole('button', { name: '生成话题包' }))
    const results = await screen.findAllByText('周六上线新功能')
    expect(results.length).toBeGreaterThan(0)

    // Click to fetch source (in-flight)
    await user.click(screen.getByRole('button', { name: '查看原文 E1' }))
    expect(screen.getByRole('status')).toHaveTextContent('正在从本地数据库定位原始消息')

    // Now start a new generation immediately (before source returns)
    ;(window.api.generateTopicPackage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      package: { ...samplePackage, topicId: 'bundle-2' },
      bundle: { ...sampleBundle, id: 'bundle-2' },
      fromCache: false
    })
    await user.click(screen.getByRole('button', { name: '重新生成' }))

    // Resolve the delayed previous source request
    resolveSource({
      success: true,
      message: {
        id: 'msg-1',
        groupId: 'group1-md5',
        senderId: 'wxid-ajie',
        senderName: '阿杰',
        sentAt: 1789001000,
        content: '这是旧的延迟返回消息',
        type: '文本'
      }
    })

    // The delayed source message should NOT be displayed!
    await waitFor(() => {
      expect(screen.queryByText('这是旧的延迟返回消息')).not.toBeInTheDocument()
    })
  })

  it('Defect 4: shows a visible alert when date range is reversed (start > end)', async () => {
    const user = userEvent.setup()
    const onOpenChat = vi.fn()

    render(<TopicsHomePage contacts={fixtureContacts} active={true} onOpenChat={onOpenChat} />)

    // Select custom date range
    const presetSelect = screen.getByRole('combobox', { name: '时间跨度快捷选择' })
    fireEvent.change(presetSelect, { target: { value: 'custom' } })

    const startInput = screen.getByLabelText('开始时间')
    const endInput = screen.getByLabelText('结束时间')

    // Set reversed dates: start 2026-09-22, end 2026-09-20
    fireEvent.change(startInput, { target: { value: '2026-09-22T10:00:00' } })
    fireEvent.change(endInput, { target: { value: '2026-09-20T10:00:00' } })

    // Click Generate
    await user.click(screen.getByRole('button', { name: '生成话题包' }))

    // Visible error alert must be present
    const alert = screen.getByRole('alert')
    expect(alert).toBeVisible()
    expect(alert).toHaveTextContent('开始时间不能晚于结束时间')

    // API should not have been called with reversed dates
    expect(window.api.generateTopicPackage).not.toHaveBeenCalled()
  })

  it('calls onOpenSource with exact locator parameters when clicking 在聊天中定位 →', async () => {
    const user = userEvent.setup()
    const onOpenChat = vi.fn()
    const onOpenSource = vi.fn()

    ;(window.api.generateTopicPackage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      package: samplePackage,
      bundle: sampleBundle,
      fromCache: false
    })

    render(
      <TopicsHomePage
        contacts={fixtureContacts}
        active={true}
        onOpenChat={onOpenChat}
        onOpenSource={onOpenSource}
      />
    )

    await user.click(screen.getByRole('button', { name: '生成话题包' }))
    const results = await screen.findAllByText('周六上线新功能')
    expect(results.length).toBeGreaterThan(0)

    // E1 is selected by default
    const enterChatBtn = screen.getByRole('button', { name: '在聊天中定位 →' })
    await user.click(enterChatBtn)

    expect(onOpenSource).toHaveBeenCalledWith({
      groupId: 'group1-md5',
      messageId: 'msg-1',
      timestamp: 1789001000
    })
    expect(onOpenChat).not.toHaveBeenCalled()
  })
  it('preserves subscription history and only runs subscriptions in the selected group', async () => {
    const user = userEvent.setup()
    const center = {
      subscriptions: [
        {
          id: 'sub-current',
          query: { ...sampleBundle.query },
          enabled: true,
          deliveryClock: '08:00'
        },
        {
          id: 'sub-other',
          query: { ...sampleBundle.query, groupId: 'group2-md5' },
          enabled: true,
          deliveryClock: '08:00'
        }
      ],
      runs: [
        {
          id: 'run-1',
          subscriptionId: 'sub-current',
          query: sampleBundle.query,
          startedAt: sampleBundle.createdAt,
          status: 'completed',
          bundle: sampleBundle
        }
      ],
      nativeForward: { supported: false }
    }
    vi.mocked(window.api.getTopicCenter).mockResolvedValue(center as never)
    window.api.runTopicSubscription = vi.fn().mockResolvedValue(center)
    render(<TopicsHomePage contacts={fixtureContacts} active={true} onOpenChat={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '打开每日订阅管理' }))
    await screen.findByText('历史运行记录 (1)')
    await user.click(screen.getByRole('button', { name: '立即运行全部' }))
    await waitFor(() =>
      expect(window.api.runTopicSubscription).toHaveBeenCalledExactlyOnceWith('sub-current')
    )
    await user.click(screen.getByRole('button', { name: '载入此包到当前视图' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('周六上线新功能')).toBeVisible()
    expect(window.api.generateTopicPackage).not.toHaveBeenCalled()
  })
})
