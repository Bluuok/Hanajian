import React from 'react'
import type { TopicPackage } from '../../../../../shared/topic-package'
import { formatTopicTime, TOPIC_TIMEZONE } from '../../../../../shared/topic-time'

interface TopicEvidenceItemProps {
  item: TopicPackage['evidences'][number]
  index: number
  isSelectedEvidence: boolean
  summaryInvalid: boolean
  review: TopicPackage['review']
  onToggle: () => void
  onSelect: () => void
}

export function TopicEvidenceItem({
  item,
  index,
  isSelectedEvidence,
  summaryInvalid,
  review,
  onToggle,
  onSelect
}: TopicEvidenceItemProps): React.ReactElement {
  const statusLabel = summaryInvalid
    ? item.selected
      ? '人工保留'
      : '人工排除'
    : review === 'verified'
      ? item.selected
        ? 'AI 选中'
        : 'AI 排除'
      : '待核对候选'

  return (
    <article
      className={`topic-evidence-item ${isSelectedEvidence ? 'is-selected-evidence' : ''}`}
      data-evidence-id={item.id}
    >
      <div className="topic-evidence-left-col">
        <span className="topic-evidence-number-badge" aria-hidden="true">
          {index + 1}
        </span>
      </div>

      <div className="topic-evidence-main-col">
        <div className="topic-evidence-author-line">
          <label className="topic-evidence-check-label">
            <input
              type="checkbox"
              aria-label={`选择候选消息 ${item.id}`}
              checked={item.selected}
              onChange={onToggle}
            />
            <span className="topic-status-tag">{statusLabel}</span>
          </label>

          <span className="topic-evidence-avatar" aria-hidden="true">
            {item.senderAvatarUrl ? (
              <img src={item.senderAvatarUrl} alt="" />
            ) : (
              item.senderName.slice(0, 1)
            )}
          </span>

          <strong className="topic-evidence-author-name">{item.senderName}</strong>

          <time
            className="topic-evidence-time"
            dateTime={new Date(item.sentAt * 1000).toISOString()}
          >
            {formatTopicTime(item.sentAt, TOPIC_TIMEZONE)}
          </time>
        </div>

        <p className="topic-evidence-excerpt">{item.excerpt}</p>

        <div className="topic-evidence-actions-row">
          <small className="topic-evidence-reason">理由：{item.reason || '关键词相关'}</small>

          <button
            type="button"
            className="topic-evidence-locate-btn"
            onClick={onSelect}
            aria-label={`查看原文 ${item.id}`}
          >
            查看原文 ↗
          </button>
        </div>
      </div>
    </article>
  )
}
