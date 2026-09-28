import React from 'react'
import type { AgentHubLocalChatMessage } from '../../../../shared/agent-hub'
import type { Contact, Message } from '../../../../shared/types'
import ChatWindow from '../../components/ChatWindow'
import { Button, Textarea } from '../../components/ui'

interface AskAIWorkspaceProps {
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
}

interface AskMessage extends AgentHubLocalChatMessage {
  id: string
  timestamp: number
  failed?: boolean
}

type HistoryRetention = '1d' | '7d' | '30d' | 'never'

const HISTORY_STORAGE_KEY = 'tracedigest_ask_ai_histories_v1'
const HISTORY_RETENTION_KEY = 'tracedigest_ask_ai_retention'
const LEFT_WIDTH_KEY = 'tracedigest_ask_ai_left_width'
const RIGHT_WIDTH_KEY = 'tracedigest_ask_ai_right_width'
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

const loadHistories = (retention: HistoryRetention): Record<string, AskMessage[]> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '{}') as {
      groups?: Record<string, AskMessage[]>
    }
    return pruneHistories(parsed.groups || {}, retention)
  } catch {
    return {}
  }
}

const saveHistories = (histories: Record<string, AskMessage[]>): void => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, groups: histories }))
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
  isAiReportLoading
}: AskAIWorkspaceProps): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const [question, setQuestion] = React.useState('')
  const [busyGroupId, setBusyGroupId] = React.useState('')
  const [retention, setRetention] = React.useState<HistoryRetention>(loadRetention)
  const [histories, setHistories] = React.useState<Record<string, AskMessage[]>>(() =>
    loadHistories(loadRetention())
  )
  const [leftWidth, setLeftWidth] = React.useState(() =>
    loadPanelWidth(LEFT_WIDTH_KEY, DEFAULT_LEFT_WIDTH)
  )
  const [rightWidth, setRightWidth] = React.useState(() =>
    loadPanelWidth(RIGHT_WIDTH_KEY, DEFAULT_RIGHT_WIDTH)
  )
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
      saveHistories(next)
      if (mountedRef.current) setHistories(next)
    },
    []
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
        history: previous.map(({ role, content }) => ({ role, content }))
      })
      const assistantMessage: AskMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: result.success ? result.answer || 'AI 没有返回内容' : result.error || '提问失败',
        timestamp: Date.now(),
        failed: !result.success
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
              <article
                key={message.id}
                className={`${message.role} ${message.failed ? 'failed' : ''}`}
              >
                <span>{message.role === 'user' ? '你' : 'AI'}</span>
                <p>{message.content}</p>
              </article>
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
          <Textarea
            aria-label="向 AI 提问"
            value={question}
            disabled={!selectedGroup || isBusy}
            placeholder={selectedGroup ? '例如：总结最近 100 条消息…' : '请先选择一个群聊'}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void ask()
              }
            }}
          />
          <div>
            <span>Enter 发送，Shift + Enter 换行</span>
            <Button
              disabled={!question.trim() || !selectedGroup || isBusy}
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
