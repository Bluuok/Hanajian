import React from 'react'
import type {
  TopicPackage,
  TopicError,
  TopicSourceMessage,
  TopicSourceLocator
} from '../../../../../shared/topic-package'
import { formatTopicTime, TOPIC_TIMEZONE } from '../../../../../shared/topic-time'

interface TopicSourceMessageCardProps {
  selectedEvidence?: TopicPackage['evidences'][number]
  evidenceIndex?: number
  sourceMessage: TopicSourceMessage | null
  sourceLoading: boolean
  sourceError: TopicError | null
  onFetchSource: () => void
  onOpenChat: () => void
  onOpenSource?: (locator: TopicSourceLocator) => Promise<void> | void
  groupName: string
}

export function TopicSourceMessageCard({
  selectedEvidence,
  evidenceIndex = 1,
  sourceMessage,
  sourceLoading,
  sourceError,
  onFetchSource,
  onOpenChat,
  onOpenSource,
  groupName
}: TopicSourceMessageCardProps): React.ReactElement {
  const [navigationError, setNavigationError] = React.useState('')
  const [opening, setOpening] = React.useState(false)
  React.useEffect(() => {
    setNavigationError('')
  }, [selectedEvidence?.id])
  const handleOpenSourceChat = async (): Promise<void> => {
    if (opening) return
    setOpening(true)
    setNavigationError('')
    try {
      if (onOpenSource && selectedEvidence?.sourceLocator) {
        await onOpenSource(selectedEvidence.sourceLocator)
      } else {
        onOpenChat()
      }
    } catch (error) {
      setNavigationError(error instanceof Error ? error.message : '定位原始消息失败，请重试。')
    } finally {
      setOpening(false)
    }
  }
  return (
    <aside className="topic-source-card" aria-label="消息来源摘录">
      {navigationError && <p role="alert">{navigationError}</p>}
      <header className="topic-source-header">
        <div className="topic-source-header-title">
          <span className="topic-source-chat-icon" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <h4>原始消息</h4>
        </div>
        {selectedEvidence && <span className="topic-source-index-tag">#{evidenceIndex}</span>}
      </header>

      {sourceLoading && (
        <div className="topic-source-loading" role="status">
          <div className="topic-source-spinner" aria-hidden="true" />
          <p>正在从本地数据库定位原始消息…</p>
        </div>
      )}

      {sourceError && !sourceLoading && (
        <div className="topic-source-error" role="alert">
          <strong>定位失败（{sourceError.code}）</strong>
          <p>{sourceError.message}</p>
          {sourceError.retryable && (
            <button type="button" className="topic-source-retry-btn" onClick={onFetchSource}>
              重试加载
            </button>
          )}
        </div>
      )}

      {!sourceLoading && sourceMessage && (
        <div className="topic-source-content">
          <div className="topic-source-author-row">
            <div className="topic-source-author-info">
              <span className="topic-source-avatar" aria-hidden="true">
                {sourceMessage.senderName.slice(0, 1)}
              </span>
              <strong>{sourceMessage.senderName}</strong>
              <time dateTime={new Date(sourceMessage.sentAt * 1000).toISOString()}>
                {formatTopicTime(sourceMessage.sentAt, TOPIC_TIMEZONE)}
              </time>
            </div>
            <span className="topic-source-more-dots" aria-hidden="true">
              ···
            </span>
          </div>

          <div className="topic-source-bubble">{sourceMessage.content}</div>

          <div className="topic-source-meta">
            {groupName} · 消息 ID：{sourceMessage.id} · 类型：{sourceMessage.type}
          </div>

          <div className="topic-source-action">
            <button type="button" disabled={opening} onClick={() => void handleOpenSourceChat()}>
              在聊天中定位 →
            </button>
          </div>
        </div>
      )}

      {!sourceLoading && !sourceMessage && selectedEvidence && (
        <div className="topic-source-content">
          <div className="topic-source-author-row">
            <div className="topic-source-author-info">
              <span className="topic-source-avatar" aria-hidden="true">
                {selectedEvidence.senderName.slice(0, 1)}
              </span>
              <strong>{selectedEvidence.senderName}</strong>
              <time dateTime={new Date(selectedEvidence.sentAt * 1000).toISOString()}>
                {formatTopicTime(selectedEvidence.sentAt, TOPIC_TIMEZONE)}
              </time>
            </div>
          </div>

          <div className="topic-source-bubble is-preview">{selectedEvidence.excerpt}</div>

          <div className="topic-source-meta">
            {groupName} · 消息 ID：{selectedEvidence.sourceLocator.messageId || '待定位'} ·
            （候选摘录，尚未读取数据库全文）
          </div>

          <div className="topic-source-action flex flex-col gap-2">
            <button type="button" className="topic-source-fetch-btn" onClick={onFetchSource}>
              从数据库加载完整原文
            </button>
            <button type="button" disabled={opening} onClick={() => void handleOpenSourceChat()}>
              在聊天中定位 →
            </button>
          </div>
        </div>
      )}

      {!sourceLoading && !sourceMessage && !selectedEvidence && (
        <div className="topic-source-placeholder">
          <p>点击左侧任意讨论的「查看原文」，即可在本地数据库中精确定位并验证原始消息。</p>
        </div>
      )}
    </aside>
  )
}
