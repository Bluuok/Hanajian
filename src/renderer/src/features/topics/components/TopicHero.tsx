import React from 'react'
import recorderHero from '../../../assets/illustrations/recorder-hero.png'
import paperclipSvg from '../../../assets/decor/paperclip.svg'
import starsSvg from '../../../assets/decor/stars.svg'

interface TopicHeroProps {
  canOpenChat?: boolean
  opening?: boolean
  onOpenChat?: () => void
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
            <span className="topics-hero-sparkle-quote" aria-hidden="true">
              “好的讨论 会让灵感发光 ✧”
            </span>
          </div>
          <p className="topics-hero-subtitle">从群聊中提炼有价值的讨论，让重要信息不再被淹没。</p>
        </div>
      </div>

      {error ? (
        <p className="topics-hero-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* Large Normal-Proportion Character Layer Overlapping Hero & Mint Card */}
      <aside className="topics-hero-character-layer" aria-hidden="true">
        {/* Floating Speech Badge */}
        <div className="topics-character-bubble">
          <span>一起 把聊天变成</span>
          <strong>成长的素材! ♡</strong>
        </div>

        {/* Floating Decor Items */}
        <img className="decor-star-float" src={starsSvg} alt="" />
        <img className="decor-clip-float" src={paperclipSvg} alt="" />

        {/* Character Image */}
        <div className="topics-character-img-wrap">
          <img className="topics-character-img" src={recorderHero} alt="小助理插画" />
          {/* Badge on Folder/Notebook */}
          <div className="topics-character-tag">
            <span>Small Chats</span>
            <strong>Big Ideas ♡</strong>
          </div>
        </div>
      </aside>
    </header>
  )
}
