import React from 'react'
import type { TopicPackage } from '../../../../../shared/topic-package'

interface TopicRelatedStripProps {
  relatedTopics: TopicPackage['relatedTopics']
  capabilities?: TopicPackage['capabilities']
  onSelectTopic?: (topicTitle: string) => void
  onExplore?: () => void
}

export function TopicRelatedStrip({
  relatedTopics,
  capabilities,
  onSelectTopic,
  onExplore
}: TopicRelatedStripProps): React.ReactElement {
  const getTopicIcon = (index: number): React.ReactElement => {
    switch (index % 4) {
      case 0:
        return (
          <span className="related-icon icon-bulb" aria-hidden="true">
            💡
          </span>
        )
      case 1:
        return (
          <span className="related-icon icon-scale" aria-hidden="true">
            ⚖️
          </span>
        )
      case 2:
        return (
          <span className="related-icon icon-mountain" aria-hidden="true">
            🏔️
          </span>
        )
      case 3:
      default:
        return (
          <span className="related-icon icon-coins" aria-hidden="true">
            🪙
          </span>
        )
    }
  }

  return (
    <section className="topic-related-strip" aria-label="相关话题区域">
      <header className="topic-related-header">
        <div className="topic-related-title-wrap">
          <span className="topic-related-icon" aria-hidden="true">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <h4>相关话题</h4>
        </div>
        <span className="topic-related-side-quote" aria-hidden="true">
          记录每一次有趣的讨论 ♡
        </span>
      </header>

      {!capabilities?.relatedTopics || relatedTopics.length === 0 ? (
        <div className="topic-related-empty">
          <span className="empty-sparkle" aria-hidden="true">
            ✧
          </span>
          <span>暂无可靠的关联话题</span>
          {onExplore && (
            <button type="button" onClick={onExplore}>
              继续探索新话题
            </button>
          )}
        </div>
      ) : (
        <div className="topic-related-cards-grid">
          {relatedTopics.map((topic, index) => (
            <button
              type="button"
              key={topic.id || `rel-${index}`}
              className="topic-related-card"
              onClick={() => onSelectTopic?.(topic.title)}
            >
              <div className="topic-related-card-left">{getTopicIcon(index)}</div>
              <div className="topic-related-card-content">
                <strong>{topic.title}</strong>
                <small>{topic.evidenceCount} 条证据</small>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
