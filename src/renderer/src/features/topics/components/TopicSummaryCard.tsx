import React from 'react'
import type { TopicPackage } from '../../../../../shared/topic-package'

interface TopicSummaryCardProps {
  pkg: TopicPackage
  summaryInvalid: boolean
  selectedCount?: number
  onLocateEvidence: (id: string) => void
  onExport: () => void
}

export function TopicSummaryCard({
  pkg,
  summaryInvalid,
  selectedCount,
  onLocateEvidence,
  onExport
}: TopicSummaryCardProps): React.ReactElement {
  const isVerified = !summaryInvalid && pkg.review === 'verified'
  const isAiFailed = pkg.review === 'unavailable' || pkg.notices.some((n) => n.code === 'AI_FAILED')

  const categoryName = pkg.capabilities.categories ? pkg.summary.category : undefined
  const dateFormat = new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeZone: pkg.dateRange.timezone
  })
  const startDate = dateFormat.format(pkg.dateRange.start * 1000)
  const endDate = dateFormat.format(pkg.dateRange.end * 1000)
  const evidenceCountText = `${selectedCount ?? pkg.summary.evidenceCount} 条证据`

  return (
    <section className="topic-summary-card" aria-label="话题摘要主卡">
      <div className="topic-summary-top-row">
        <div className="topic-summary-icon" aria-hidden="true">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              fill="#34d399"
              fillOpacity="0.28"
              stroke="#10b981"
            />
          </svg>
        </div>

        <div className="topic-summary-meta-block">
          <div className="topic-summary-title-line">
            <h3>
              <span>{pkg.topic}</span>
            </h3>

            {/* Badges Line */}
            <div className="topic-summary-badges">
              {categoryName && <span className="topic-badge-category">{categoryName}</span>}
              <span className="topic-badge-count">{evidenceCountText}</span>
              <span className="topic-badge-date">
                {startDate === endDate ? startDate : `${startDate}–${endDate}`}
              </span>
              {isVerified ? (
                <span className="topic-badge-status status-verified">✓ AI 已核对</span>
              ) : summaryInvalid ? (
                <span className="topic-badge-status status-invalid">! 结论已失效</span>
              ) : (
                <span className="topic-badge-status status-pending">⚠ 待核对</span>
              )}
            </div>
          </div>
        </div>

        {/* Cursive right-hand note */}
        <div className="topic-summary-cute-note" aria-hidden="true">
          <span>好想法</span>
          <span>值得被好好记录 ☆</span>
        </div>

        <div className="topic-summary-actions">
          <button type="button" onClick={onExport} aria-label="导出本地 JSON">
            导出本地 JSON
          </button>
        </div>
      </div>

      {/* Abstract or summary text (omit duplicate if identical to claim text) */}
      {isVerified &&
        pkg.summary.abstract &&
        !pkg.summary.claims.some((c) => c.text.trim() === pkg.summary.abstract.trim()) && (
          <div className="topic-summary-body-text">
            <p>{pkg.summary.abstract}</p>
          </div>
        )}

      {pkg.warnings.length > 0 && (
        <div className="topic-summary-warnings" role="status">
          {pkg.warnings.map((warning, idx) => (
            <p key={idx} className="m-0">
              提示：{warning}
            </p>
          ))}
        </div>
      )}

      {summaryInvalid && (
        <p className="topic-summary-invalid-alert" role="alert">
          候选消息已人工修改，原 AI 结论已失效。请重新生成话题包。
        </p>
      )}

      {!summaryInvalid && isAiFailed && (
        <div className="topic-summary-notice" role="alert">
          摘要尚未通过 AI 核对，以下仅为候选原文。
        </div>
      )}

      {isVerified && pkg.summary.claims.length > 0 && (
        <div className="topic-summary-claims">
          {pkg.summary.claims.map((claim, index) => (
            <article key={`${claim.kind}-${index}`} className="topic-claim-item">
              <span className="topic-claim-kind">{claim.kind}</span>
              <span className="topic-claim-text">{claim.text}</span>
              {claim.evidenceIds.length > 0 && (
                <span className="topic-claim-citations">
                  <small>证据引用：</small>
                  {claim.evidenceIds.map((id) => (
                    <button
                      type="button"
                      key={id}
                      aria-label={`定位证据 ${id}`}
                      onClick={() => onLocateEvidence(id)}
                    >
                      {pkg.evidences.findIndex((item) => item.id === id) + 1}
                    </button>
                  ))}
                </span>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
