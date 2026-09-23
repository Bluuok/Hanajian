import React from 'react'
import type { TopicPackage } from '../../../../../shared/topic-package'
import { TopicEvidenceItem } from './TopicEvidenceItem'

interface TopicEvidenceListProps {
  evidence: TopicPackage['evidences']
  selectedEvidenceId: string
  summaryInvalid: boolean
  review: TopicPackage['review']
  onToggleEvidence: (id: string) => void
  onSelectEvidence: (id: string) => void
}

export function TopicEvidenceList({
  evidence,
  selectedEvidenceId,
  summaryInvalid,
  review,
  onToggleEvidence,
  onSelectEvidence
}: TopicEvidenceListProps): React.ReactElement {
  return (
    <section className="topic-evidence-list-wrap" aria-label="关键证据列表">
      <header className="topic-evidence-header">
        <div className="topic-evidence-title">
          <span className="topic-evidence-clip-icon" aria-hidden="true">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </span>
          <h4>关键证据 ({evidence.length})</h4>
        </div>
      </header>

      <div className="topic-evidence-items">
        {evidence.map((item, idx) => (
          <TopicEvidenceItem
            key={item.id}
            item={item}
            index={idx}
            isSelectedEvidence={selectedEvidenceId === item.id}
            summaryInvalid={summaryInvalid}
            review={review}
            onToggle={() => onToggleEvidence(item.id)}
            onSelect={() => onSelectEvidence(item.id)}
          />
        ))}

        {evidence.length === 0 && (
          <div className="topic-evidence-empty">
            <p>未发现符合条件的讨论证据</p>
          </div>
        )}
      </div>
    </section>
  )
}
