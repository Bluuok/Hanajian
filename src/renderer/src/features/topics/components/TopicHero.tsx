import React from 'react'

interface TopicHeroProps {
  error?: string
}

export function TopicHero({ error }: TopicHeroProps): React.ReactElement {
  return (
    <header className="topics-hero" aria-label="话题整理主横幅">
      {/* Left Title & Subtitle */}
      <div className="topics-hero-main-content">
        <div className="topics-hero-icon" aria-hidden="true">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              fill="#f87171"
              fillOpacity="0.25"
              stroke="#e05260"
            />
          </svg>
        </div>

        <div className="topics-hero-text">
          <div className="topics-hero-title-row">
            <h1>话题整理</h1>
          </div>
          <p className="topics-hero-subtitle">从群聊中提炼有价值的讨论，让重要信息不再被淹没。</p>
        </div>
      </div>

      {error ? (
        <p className="topics-hero-error" role="alert">
          {error}
        </p>
      ) : null}
    </header>
  )
}
