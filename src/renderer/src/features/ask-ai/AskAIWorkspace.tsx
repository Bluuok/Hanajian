import type { TopicSourceLocator } from '../../../../shared/topic-package'
import { TopicPanel } from './TopicPanel'
import React from 'react'
import type { AgentHubLocalChatMessage } from '../../../../shared/agent-hub'
import type { AgentMemoryDraft } from '../../../../shared/agent-memory'
import {
  renderAgentMemoryExport,
  AGENT_MEMORY_FORMAT_OPTIONS
} from '../../../../shared/agent-memory-format'
import type { Contact, Message } from '../../../../shared/types'
import ChatWindow from '../../components/ChatWindow'
import { Button, Textarea } from '../../components/ui'

interface AskAIWorkspaceProps {
  accountScope?: string
  contacts: Contact[]
  selectedContact: Contact | null
  messages: Message[]
  isLoadingMessages: boolean
  messageHistoryStatus: 'idle' | 'end' | 'error'
  contentFilter: string
  onContentFilterChange: (value: string) => void
  onSelectGroup: (contact: Contact, forceLive?: boolean) => Promise<void>
  onRefreshGroups: (keyword: string) => Promise<void>
  onRefreshData: () => Promise<void>
  onReloadAvatars: () => Promise<void>
  onLoadOlderMessages: () => Promise<void>
  onCreateGroupReport: () => void
  onOpenTextToSpeechSettings: () => void
  isAiReportLoading: boolean
  jumpToMessageId?: string | null
  jumpToTime?: number | null
  isSourceSnapshot?: boolean
  onReturnToLatest?: () => void
  onOpenSource?: (locator: TopicSourceLocator) => Promise<void> | void
}

interface AskMessage extends AgentHubLocalChatMessage {
  id: string
  timestamp: number
  failed?: boolean
  memoryDraft?: AgentMemoryDraft
  memoryWrittenPath?: string
  memoryWriteError?: string
}

type HistoryRetention = '1d' | '7d' | '30d' | 'never'

const HISTORY_STORAGE_KEY = 'tracedigest_ask_ai_histories_v1'
const HISTORY_RETENTION_KEY = 'tracedigest_ask_ai_retention'
const LEFT_WIDTH_KEY = 'tracedigest_ask_ai_left_width'
const RIGHT_WIDTH_KEY = 'tracedigest_ask_ai_right_width'
const MEMORY_OUTPUT_DIRECTORY_KEY = 'tracedigest_ask_ai_memory_output_directory'
const DEFAULT_LEFT_WIDTH = 250
const DEFAULT_RIGHT_WIDTH = 390
const MIN_LEFT_WIDTH = 180
const MIN_RIGHT_WIDTH = 300
const MIN_MESSAGE_WIDTH = 320
const MAX_LEFT_WIDTH = 460
const MAX_RIGHT_WIDTH = 720
const MAX_GROUP_HISTORIES = 24
const MAX_MESSAGES_PER_GROUP = 60

const RETENTION_OPTIONS: Array<{ value: HistoryRetention; label: string; days?: number }> = [
  { value: '1d', label: '保留 1 天', days: 1 },
  { value: '7d', label: '保留 7 天', days: 7 },
  { value: '30d', label: '保留 30 天', days: 30 },
  { value: 'never', label: '永久保留' }
]

const EXAMPLES = [
  '总结这个群最近 100 条消息',
  '总结这个群今天下午的消息',
  '这个群最近有哪些重要决定和待办？'
]

const MEMORY_EXAMPLE = '例如：只保留 AI Agent、产品设计和工程实践相关的可复用讨论，不要泛泛而谈。'

const displayName = (contact: Contact): string =>
  contact.m_nsNickName || contact.remark || contact.m_nsUsrName || '未命名群聊'

const loadRetention = (): HistoryRetention => {
  const saved = localStorage.getItem(HISTORY_RETENTION_KEY)
  return RETENTION_OPTIONS.some((option) => option.value === saved)
    ? (saved as HistoryRetention)
    : '30d'
}

const pruneHistories = (
  source: Record<string, AskMessage[]>,
  retention: HistoryRetention
): Record<string, AskMessage[]> => {
  const days = RETENTION_OPTIONS.find((option) => option.value === retention)?.days
  const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0
  return Object.fromEntries(
    Object.entries(source)
      .map(([groupId, entries]) => [
        groupId,
        entries
          .filter(
            (entry) =>
              entry &&
              (entry.role === 'user' || entry.role === 'assistant') &&
              typeof entry.content === 'string' &&
              (!cutoff || Number(entry.timestamp || 0) >= cutoff)
          )
          .slice(-MAX_MESSAGES_PER_GROUP)
      ])
      .filter((entry): entry is [string, AskMessage[]] => entry[1].length > 0)
      .sort(
        (left, right) =>
          Number(right[1].at(-1)?.timestamp || 0) - Number(left[1].at(-1)?.timestamp || 0)
      )
      .slice(0, MAX_GROUP_HISTORIES)
  )
}

const loadHistories = (
  retention: HistoryRetention,
  storageKey: string
): Record<string, AskMessage[]> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}') as {
      groups?: Record<string, AskMessage[]>
    }
    return pruneHistories(parsed.groups || {}, retention)
  } catch {
    return {}
  }
}

const saveHistories = (histories: Record<string, AskMessage[]>, storageKey: string): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, groups: histories }))
  } catch {
    // A full localStorage should not interrupt the current conversation.
  }
}

const loadPanelWidth = (key: string, fallback: number): number => {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const previewHistory = (message?: AskMessage): string => {
  if (!message) return '点击查看并提问'
  const prefix = message.role === 'assistant' ? 'AI：' : '你：'
  const text = message.content.replace(/\s+/g, ' ').trim()
  return `${prefix}${text.length > 24 ? `${text.slice(0, 24)}…` : text}`
}

export function AskAIWorkspace({
  accountScope,
  contacts,
  selectedContact,
  messages,
  isLoadingMessages,
  messageHistoryStatus,
  contentFilter,
  onContentFilterChange,
  onSelectGroup,
  onRefreshGroups,
  onRefreshData,
  onReloadAvatars,
  onLoadOlderMessages,
  onCreateGroupReport,
  onOpenTextToSpeechSettings,
  isAiReportLoading,
  jumpToMessageId,
  jumpToTime,
  isSourceSnapshot,
  onReturnToLatest,
  onOpenSource
}: AskAIWorkspaceProps): React.ReactElement {
  const storageKey = accountScope
    ? `${HISTORY_STORAGE_KEY}:${encodeURIComponent(accountScope)}`
    : HISTORY_STORAGE_KEY
  const [query, setQuery] = React.useState('')
  const [question, setQuestion] = React.useState('')
  const [memoryEnabled, setMemoryEnabled] = React.useState(false)
  const [memoryConfigOpen, setMemoryConfigOpen] = React.useState(true)
  const [memoryFormat, setMemoryFormat] = React.useState('professional-memory-v1')
  const [memoryStyle, setMemoryStyle] = React.useState('')
  const [memoryFocus, setMemoryFocus] = React.useState(
    '保留可复用的结论、方法、关键依据、待验证问题和资源；排除闲聊与个人联系方式。'
  )
  const [memoryOutputDirectory, setMemoryOutputDirectory] = React.useState(
    () => localStorage.getItem(MEMORY_OUTPUT_DIRECTORY_KEY) || ''
  )
  const [busyGroupId, setBusyGroupId] = React.useState('')
  const [writingMemoryId, setWritingMemoryId] = React.useState('')
  const [retention, setRetention] = React.useState<HistoryRetention>(loadRetention)
  const [histories, setHistories] = React.useState<Record<string, AskMessage[]>>(() =>
    loadHistories(loadRetention(), storageKey)
  )
  const [leftWidth, setLeftWidth] = React.useState(() =>
    loadPanelWidth(LEFT_WIDTH_KEY, DEFAULT_LEFT_WIDTH)
  )
  const [rightWidth, setRightWidth] = React.useState(() =>
    loadPanelWidth(RIGHT_WIDTH_KEY, DEFAULT_RIGHT_WIDTH)
  )
  const [topicPanelOpen, setTopicPanelOpen] = React.useState(false)
  const answerEndRef = React.useRef<HTMLDivElement>(null)
  const workspaceRef = React.useRef<HTMLDivElement>(null)
  const historiesRef = React.useRef(histories)
  const retentionRef = React.useRef(retention)
  const mountedRef = React.useRef(true)
  const resizeCleanupRef = React.useRef<(() => void) | null>(null)

  const commitHistories = React.useCallback(
    (update: (current: Record<string, AskMessage[]>) => Record<string, AskMessage[]>): void => {
      const next = pruneHistories(update(historiesRef.current), retentionRef.current)
      historiesRef.current = next
      saveHistories(next, storageKey)
      if (mountedRef.current) setHistories(next)
    },
    [storageKey]
  )

  const groups = React.useMemo(
    () =>
      contacts.filter(
        (contact) => contact.type === 'group' || contact.m_nsUsrName.endsWith('@chatroom')
      ),
    [contacts]
  )
  const visibleGroups = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return groups
    return groups.filter((contact) =>
      [contact.m_nsNickName, contact.remark, contact.m_nsUsrName].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword)
      )
    )
  }, [groups, query])
  const selectedGroup =
    selectedContact &&
    (selectedContact.type === 'group' || selectedContact.m_nsUsrName.endsWith('@chatroom'))
      ? selectedContact
      : null
  const selectedGroupId = selectedGroup?.md5 || ''
  const chat = histories[selectedGroupId] || []
  const isBusy = Boolean(busyGroupId)
  const isAsking = Boolean(selectedGroupId && busyGroupId === selectedGroupId)
  React.useEffect(() => {
    setTopicPanelOpen(false)
  }, [selectedGroupId])

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      resizeCleanupRef.current?.()
    }
  }, [])

  React.useEffect(() => {
    localStorage.setItem(LEFT_WIDTH_KEY, String(Math.round(leftWidth)))
  }, [leftWidth])

  React.useEffect(() => {
    localStorage.setItem(RIGHT_WIDTH_KEY, String(Math.round(rightWidth)))
  }, [rightWidth])

  React.useEffect(() => {
    if (memoryOutputDirectory) {
      localStorage.setItem(MEMORY_OUTPUT_DIRECTORY_KEY, memoryOutputDirectory)
    } else {
      localStorage.removeItem(MEMORY_OUTPUT_DIRECTORY_KEY)
    }
  }, [memoryOutputDirectory])

  React.useEffect(() => {
    if (selectedGroup || groups.length === 0) return
    void onSelectGroup(groups[0])
  }, [groups, onSelectGroup, selectedGroup])

  React.useEffect(() => {
    answerEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.length, isAsking])

  const clampPanelWidth = React.useCallback(
    (side: 'left' | 'right', value: number): number => {
      const workspaceWidth = workspaceRef.current?.clientWidth || window.innerWidth
      const otherWidth = side === 'left' ? rightWidth : leftWidth
      const minimum = side === 'left' ? MIN_LEFT_WIDTH : MIN_RIGHT_WIDTH
      const absoluteMaximum = side === 'left' ? MAX_LEFT_WIDTH : MAX_RIGHT_WIDTH
      const availableMaximum = workspaceWidth - otherWidth - MIN_MESSAGE_WIDTH - 12
      return Math.max(minimum, Math.min(absoluteMaximum, availableMaximum, value))
    },
    [leftWidth, rightWidth]
  )

  const beginResize = (side: 'left' | 'right', event: React.MouseEvent): void => {
    event.preventDefault()
    resizeCleanupRef.current?.()
    const startX = event.clientX
    const startWidth = side === 'left' ? leftWidth : rightWidth
    document.body.classList.add('ask-ai-is-resizing')
    const move = (moveEvent: MouseEvent): void => {
      const delta = moveEvent.clientX - startX
      const next = clampPanelWidth(side, startWidth + (side === 'left' ? delta : -delta))
      if (side === 'left') setLeftWidth(next)
      else setRightWidth(next)
    }
    const cleanup = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', cleanup)
      document.body.classList.remove('ask-ai-is-resizing')
      resizeCleanupRef.current = null
    }
    resizeCleanupRef.current = cleanup
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', cleanup)
  }

  const resizeWithKeyboard = (side: 'left' | 'right', delta: number): void => {
    const current = side === 'left' ? leftWidth : rightWidth
    const next = clampPanelWidth(side, current + (side === 'left' ? delta : -delta))
    if (side === 'left') setLeftWidth(next)
    else setRightWidth(next)
  }

  const changeRetention = (value: HistoryRetention): void => {
    retentionRef.current = value
    setRetention(value)
    localStorage.setItem(HISTORY_RETENTION_KEY, value)
    commitHistories((current) => current)
  }

  const ask = async (): Promise<void> => {
    const text = question.trim()
    const group = selectedGroup
    if (!text || !group || isBusy) return
    if (memoryEnabled && !memoryOutputDirectory) return
    const groupId = group.md5
    const previous = historiesRef.current[groupId] || []
    const timestamp = Date.now()
    const userMessage: AskMessage = {
      id: `${timestamp}-user`,
      role: 'user',
      content: text,
      timestamp
    }
    setQuestion('')
    setMemoryConfigOpen(false)
    setBusyGroupId(groupId)
    commitHistories((current) => ({
      ...current,
      [groupId]: [...(current[groupId] || []), userMessage]
    }))
    try {
      const result = await window.api.askAgentHubLocal({
        question: text,
        groupId,
        groupName: displayName(group),
        history: previous.map(({ role, content }) => ({ role, content })),
        memoryExtraction: memoryEnabled
          ? {
              enabled: true,
              focus: memoryFocus.trim(),
              formatId: memoryFormat,
              writingStyle: memoryStyle.trim()
            }
          : undefined
      })
      const assistantMessage: AskMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: result.success ? result.answer || 'AI 没有返回内容' : result.error || '提问失败',
        timestamp: Date.now(),
        failed: !result.success,
        memoryDraft: result.memoryDraft
      }
      commitHistories((current) => ({
        ...current,
        [groupId]: [...(current[groupId] || []), assistantMessage]
      }))
    } catch (error) {
      commitHistories((current) => ({
        ...current,
        [groupId]: [
          ...(current[groupId] || []),
          {
            id: `${Date.now()}-error`,
            role: 'assistant',
            content: error instanceof Error ? error.message : '提问失败',
            timestamp: Date.now(),
            failed: true
          }
        ]
      }))
    } finally {
      setBusyGroupId('')
    }
  }

  const selectMemoryOutputDirectory = (): void => {
    void window.api.selectExportDirectory().then((result) => {
      if (!result.canceled && result.path) setMemoryOutputDirectory(result.path)
    })
  }

  const updateMessage = (messageId: string, update: (message: AskMessage) => AskMessage): void => {
    if (!selectedGroupId) return
    commitHistories((current) => ({
      ...current,
      [selectedGroupId]: (current[selectedGroupId] || []).map((message) =>
        message.id === messageId ? update(message) : message
      )
    }))
  }

  const writeMemoryDraft = async (message: AskMessage): Promise<void> => {
    if (!message.memoryDraft || !memoryOutputDirectory || writingMemoryId) return
    setWritingMemoryId(message.id)
    try {
      const result = await window.api.writeAgentHubMemoryDraft({
        draft: message.memoryDraft,
        outputDirectory: memoryOutputDirectory
      })
      updateMessage(message.id, (current) => ({
        ...current,
        memoryWrittenPath: result.success ? result.path : undefined,
        memoryWriteError: result.success ? undefined : result.error || '写入失败'
      }))
    } catch (error) {
      updateMessage(message.id, (current) => ({
        ...current,
        memoryWriteError: error instanceof Error ? error.message : '写入失败'
      }))
    } finally {
      setWritingMemoryId('')
    }
  }

  const discardMemoryDraft = (messageId: string): void => {
    updateMessage(messageId, (current) => ({ ...current, memoryDraft: undefined }))
  }

  return (
    <div
      className="ask-ai-workspace"
      ref={workspaceRef}
      style={
        {
          '--ask-ai-left-width': `${leftWidth}px`,
          '--ask-ai-right-width': `${rightWidth}px`
        } as React.CSSProperties
      }
    >
      <aside className="ask-ai-group-panel">
        <header>
          <div>
            <span>本机群聊</span>
            <h1>问问 AI</h1>
          </div>
          <button
            type="button"
            className="ask-ai-refresh"
            aria-label="刷新群聊列表"
            title="刷新群聊列表"
            onClick={() => void onRefreshGroups(query)}
          >
            ↻
          </button>
        </header>
        <label className="ask-ai-group-search">
          <span className="sr-only">搜索群聊</span>
          <input
            type="search"
            aria-label="搜索群聊"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索群聊"
          />
        </label>
        <div className="ask-ai-group-count">{visibleGroups.length} 个群聊</div>
        <div className="ask-ai-group-list">
          {visibleGroups.length ? (
            visibleGroups.map((group) => {
              const name = displayName(group)
              return (
                <button
                  type="button"
                  key={group.md5}
                  className={group.md5 === selectedGroupId ? 'active' : ''}
                  aria-pressed={group.md5 === selectedGroupId}
                  onClick={() => void onSelectGroup(group)}
                >
                  <span className="ask-ai-group-avatar">
                    {group.avatar ? <img src={group.avatar} alt="" /> : name.charAt(0)}
                  </span>
                  <span>
                    <strong>{name}</strong>
                    <small>{previewHistory(histories[group.md5]?.at(-1))}</small>
                  </span>
                </button>
              )
            })
          ) : (
            <div className="ask-ai-group-empty">没有找到匹配的群聊</div>
          )}
        </div>
      </aside>

      <div
        className="ask-ai-resizer left"
        role="separator"
        aria-label="调整群聊列表宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_LEFT_WIDTH}
        aria-valuemax={MAX_LEFT_WIDTH}
        aria-valuenow={Math.round(leftWidth)}
        tabIndex={0}
        onMouseDown={(event) => beginResize('left', event)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            resizeWithKeyboard('left', event.key === 'ArrowRight' ? 12 : -12)
          }
        }}
      />

      <section className="ask-ai-message-panel" aria-label="群聊消息">
        <ChatWindow
          key={selectedGroup?.md5}
          contact={selectedGroup}
          messages={messages}
          isLoadingMessages={isLoadingMessages}
          messageHistoryStatus={messageHistoryStatus}
          contentFilter={contentFilter}
          onContentFilterChange={onContentFilterChange}
          onRefresh={() => selectedGroup && onSelectGroup(selectedGroup, true)}
          onRefreshData={onRefreshData}
          onReloadAvatars={onReloadAvatars}
          onLoadOlderMessages={onLoadOlderMessages}
          onCreateGroupReport={onCreateGroupReport}
          onOpenTextToSpeechSettings={onOpenTextToSpeechSettings}
          isAiLoading={isAiReportLoading}
          jumpToMessageId={jumpToMessageId}
          jumpToTime={jumpToTime}
          isSourceSnapshot={isSourceSnapshot}
          onReturnToLatest={onReturnToLatest}
        />
      </section>

      <div
        className="ask-ai-resizer right"
        role="separator"
        aria-label="调整 AI 对话框宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_RIGHT_WIDTH}
        aria-valuemax={MAX_RIGHT_WIDTH}
        aria-valuenow={Math.round(rightWidth)}
        tabIndex={0}
        onMouseDown={(event) => beginResize('right', event)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            resizeWithKeyboard('right', event.key === 'ArrowRight' ? 12 : -12)
          }
        }}
      />

      <aside className="ask-ai-chat-panel" aria-label="AI 对话">
        {topicPanelOpen && selectedGroup ? (
          <TopicPanel
            key={selectedGroupId}
            groupId={selectedGroupId}
            groupName={displayName(selectedGroup)}
            onClose={() => setTopicPanelOpen(false)}
            onOpenSource={onOpenSource}
          />
        ) : null}
        <header>
          <div className="ask-ai-bot-mark" aria-hidden>
            AI
          </div>
          <div>
            <h2>群聊助手</h2>
            <p>{selectedGroup ? `正在查看：${displayName(selectedGroup)}` : '请先选择群聊'}</p>
          </div>
          <label className="ask-ai-retention">
            <span className="sr-only">自动清空历史时间</span>
            <select
              aria-label="自动清空历史时间"
              value={retention}
              onChange={(event) => changeRetention(event.target.value as HistoryRetention)}
            >
              {RETENTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ask-ai-topic-toggle"
            aria-expanded={topicPanelOpen}
            disabled={!selectedGroup}
            onClick={() => setTopicPanelOpen((open) => !open)}
          >
            话题
          </button>
          {chat.length > 0 ? (
            <button
              type="button"
              className="ask-ai-clear"
              onClick={() => commitHistories((current) => ({ ...current, [selectedGroupId]: [] }))}
            >
              立即清空
            </button>
          ) : null}
        </header>
        <div className="ask-ai-answer-list">
          {chat.length === 0 ? (
            <div className="ask-ai-welcome">
              <h3>边看群聊，边让 AI 总结</h3>
              <p>AI 只会按需读取本机群聊，不能删除、修改或发送微信消息。</p>
              <div>
                {EXAMPLES.map((example) => (
                  <button key={example} type="button" onClick={() => setQuestion(example)}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chat.map((message) => (
              <React.Fragment key={message.id}>
                <article className={`${message.role} ${message.failed ? 'failed' : ''}`}>
                  <span>{message.role === 'user' ? '你' : 'AI'}</span>
                  <p>{message.content}</p>
                </article>
                {message.memoryDraft ? (
                  <section className="ask-ai-memory-draft" aria-label="记忆草稿预览">
                    <div className="ask-ai-memory-draft-header">
                      <div>
                        <span>记忆草稿</span>
                        <strong>{message.memoryDraft.title}</strong>
                      </div>
                      <em>{message.memoryWrittenPath ? '已写入' : '未写入'}</em>
                    </div>
                    {message.memoryDraft.success ? (
                      <>
                        <p className="ask-ai-memory-stats">
                          本次读取 {message.memoryDraft.sourceMessageCount} 条，沉淀内容引用{' '}
                          {message.memoryDraft.selectedMessageCount ??
                            message.memoryDraft.professionalMessageCount}{' '}
                          条消息。
                        </p>
                        <pre>{renderAgentMemoryExport(message.memoryDraft)}</pre>
                        {message.memoryDraft.warning ? (
                          <p className="ask-ai-memory-warning">{message.memoryDraft.warning}</p>
                        ) : null}
                        {message.memoryWrittenPath ? (
                          <p className="ask-ai-memory-written">
                            已写入：{message.memoryWrittenPath}
                          </p>
                        ) : (
                          <div className="ask-ai-memory-actions">
                            <Button
                              disabled={!memoryOutputDirectory || Boolean(writingMemoryId)}
                              onClick={() => void writeMemoryDraft(message)}
                            >
                              {writingMemoryId === message.id ? '正在写入…' : '写入记忆库'}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => discardMemoryDraft(message.id)}
                            >
                              不写入
                            </Button>
                          </div>
                        )}
                        {message.memoryWriteError ? (
                          <p className="ask-ai-memory-error">{message.memoryWriteError}</p>
                        ) : null}
                      </>
                    ) : (
                      <p className="ask-ai-memory-error">
                        {message.memoryDraft.error || '未能生成记忆草稿'}
                      </p>
                    )}
                  </section>
                ) : null}
              </React.Fragment>
            ))
          )}
          {isAsking ? (
            <div className="ask-ai-thinking" role="status">
              <i />
              正在读取群聊并整理答案…
            </div>
          ) : null}
          <div ref={answerEndRef} />
        </div>
        <div className="ask-ai-composer">
          <label className="ask-ai-memory-toggle">
            <input
              type="checkbox"
              checked={memoryEnabled}
              disabled={isBusy}
              onChange={(event) => setMemoryEnabled(event.target.checked)}
            />
            <span>
              <strong>提取专业记忆</strong>
              <small>仅预览；确认后才写入指定目录</small>
            </span>
          </label>
          {memoryEnabled ? (
            <details
              className="ask-ai-memory-config"
              open={memoryConfigOpen}
              onToggle={(event) => setMemoryConfigOpen(event.currentTarget.open)}
            >
              <summary>记忆提取设置</summary>
              <label>
                <span>笔记格式</span>
                <select
                  aria-label="笔记格式"
                  value={memoryFormat}
                  disabled={isBusy}
                  onChange={(event) => setMemoryFormat(event.target.value)}
                >
                  {AGENT_MEMORY_FORMAT_OPTIONS.map((format) => (
                    <option key={format.id} value={format.id}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>想沉淀什么</span>
                <Textarea
                  aria-label="记忆提取提示词"
                  placeholder={MEMORY_EXAMPLE}
                  maxLength={1600}
                  value={memoryFocus}
                  disabled={isBusy}
                  onChange={(event) => setMemoryFocus(event.target.value)}
                />
              </label>
              <label>
                <span>表达风格（可选）</span>
                <Textarea
                  aria-label="记忆表达风格"
                  value={memoryStyle}
                  maxLength={800}
                  placeholder="例如：简短条目、解释术语、保留操作步骤"
                  disabled={isBusy}
                  onChange={(event) => setMemoryStyle(event.target.value)}
                />
              </label>
              <div className="ask-ai-memory-directory">
                <span>{memoryOutputDirectory || '尚未选择记忆库目录'}</span>
                <Button variant="outline" disabled={isBusy} onClick={selectMemoryOutputDirectory}>
                  选择保存路径
                </Button>
              </div>
            </details>
          ) : null}
          <Textarea
            aria-label="向 AI 提问"
            value={question}
            disabled={!selectedGroup || isBusy}
            placeholder={selectedGroup ? '例如：总结最近 100 条消息…' : '请先选择一个群聊'}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229
              ) {
                event.preventDefault()
                void ask()
              }
            }}
          />
          <div className="ask-ai-composer-actions">
            <span>Enter 发送，Shift + Enter 换行</span>
            <Button
              disabled={
                !question.trim() ||
                !selectedGroup ||
                isBusy ||
                (memoryEnabled && !memoryOutputDirectory)
              }
              onClick={() => void ask()}
            >
              {isBusy ? '处理中…' : '发送'}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  )
}
