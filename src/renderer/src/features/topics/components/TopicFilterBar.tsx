import React from 'react'
import type { TopicBundle } from '../../../../../shared/topic-digest'
import { previousTopicDay, topicDateTimeInput } from '../../../../../shared/topic-time'
import { TopicSubscriptionDrawer } from './TopicSubscriptionDrawer'

interface TopicFilterBarProps {
  topicInputRef?: React.Ref<HTMLInputElement>
  groupId: string
  topic: string
  setTopic: (v: string) => void
  start: string
  setStart: (v: string) => void
  end: string
  setEnd: (v: string) => void
  dateError?: string
  setDateError?: (v: string) => void
  aliases: string
  setAliases: (v: string) => void
  excludes: string
  setExcludes: (v: string) => void
  memberIds: string
  setMemberIds: (v: string) => void
  timezone: string
  busy: boolean
  canGenerate: boolean
  onGenerate: (forceRefresh?: boolean) => void
  showAdvanced: boolean
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>
  showSubscription: boolean
  setShowSubscription: React.Dispatch<React.SetStateAction<boolean>>
  active: boolean
  onLoadBundle?: (bundle: TopicBundle) => void
}

export function TopicFilterBar({
  topicInputRef,
  groupId,
  topic,
  setTopic,
  start,
  setStart,
  end,
  setEnd,
  dateError,
  setDateError,
  aliases,
  setAliases,
  excludes,
  setExcludes,
  memberIds,
  setMemberIds,
  timezone,
  busy,
  canGenerate,
  onGenerate,
  showAdvanced,
  setShowAdvanced,
  showSubscription,
  setShowSubscription,
  active,
  onLoadBundle
}: TopicFilterBarProps): React.ReactElement {
  const [datePreset, setDatePreset] = React.useState<'yesterday' | 'today' | '3days' | 'custom'>(
    'yesterday'
  )
  const [showDateCustom, setShowDateCustom] = React.useState(false)

  const handleDatePreset = (preset: 'yesterday' | 'today' | '3days' | 'custom'): void => {
    setDatePreset(preset)
    setDateError?.('')
    if (preset === 'yesterday') {
      const p = previousTopicDay()
      setStart(p.start)
      setEnd(p.end)
      setShowDateCustom(false)
    } else if (preset === 'today') {
      const now = Date.now()
      const offsetMs = 8 * 3600_000
      const todayStart = Math.floor((now + offsetMs) / 86400_000) * 86400_000 - offsetMs
      setStart(topicDateTimeInput(todayStart / 1000))
      setEnd(topicDateTimeInput(Math.floor(now / 1000)))
      setShowDateCustom(false)
    } else if (preset === '3days') {
      const now = Date.now()
      const offsetMs = 8 * 3600_000
      const todayStart = Math.floor((now + offsetMs) / 86400_000) * 86400_000 - offsetMs
      const threeDaysAgo = todayStart - 2 * 86400_000
      setStart(topicDateTimeInput(threeDaysAgo / 1000))
      setEnd(topicDateTimeInput(Math.floor(now / 1000)))
      setShowDateCustom(false)
    } else {
      setShowDateCustom(true)
    }
  }

  return (
    <section className="topic-filter-bar" aria-label="话题筛选与控制">
      {/* Compact Primary Filter Row */}
      <div className="topic-filter-compact-row">
        {/* Topic Search Input */}
        <div className="topic-search-box">
          <span className="topic-search-icon" aria-hidden="true">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={topicInputRef}
            type="search"
            aria-label="话题"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="搜索或输入话题名称…"
            disabled={busy}
          />
          {topic && (
            <button
              type="button"
              className="topic-search-clear"
              aria-label="清空话题"
              onClick={() => setTopic('')}
            >
              ✕
            </button>
          )}
        </div>

        {/* Quick Date Selector */}
        <div className="topic-date-quick-wrap">
          <span className="topic-date-icon" aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <select
            aria-label="时间跨度快捷选择"
            value={datePreset}
            onChange={(e) =>
              handleDatePreset(e.target.value as 'yesterday' | 'today' | '3days' | 'custom')
            }
            disabled={busy}
          >
            <option value="yesterday">昨天</option>
            <option value="today">今天</option>
            <option value="3days">近 3 天</option>
            <option value="custom">自定义时间范围…</option>
          </select>
        </div>

        {/* Generate Button (Deep Pink/Berry Pill) */}
        <button
          type="button"
          className="topic-btn-generate"
          aria-label="生成话题包"
          disabled={!canGenerate || busy}
          onClick={() => onGenerate(false)}
        >
          <span className="sparkle-icon" aria-hidden="true">
            ✦
          </span>
          <span>{busy ? '整理中…' : '生成话题包'}</span>
        </button>

        {/* Force Refresh Button (Compact control) */}
        <button
          type="button"
          className="topic-btn-refresh"
          title="跳过缓存重新整理"
          aria-label="重新生成"
          disabled={!canGenerate || busy}
          onClick={() => onGenerate(true)}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          <span className="topic-btn-refresh-text">重整</span>
        </button>

        {/* Subscription Drawer Trigger */}
        <button
          type="button"
          className="topic-btn-sub-launcher"
          aria-label="打开每日订阅管理"
          onClick={() => setShowSubscription(true)}
        >
          每日订阅
        </button>
      </div>

      {/* Date Validation Alert (Defect 4) */}
      {dateError && (
        <div className="topic-date-error-alert" role="alert">
          <span className="alert-icon" aria-hidden="true">
            ⚠
          </span>
          <span>{dateError}</span>
        </div>
      )}

      {/* Custom Date Range Popover/Drawer */}
      {showDateCustom && (
        <div className="topic-custom-date-drawer">
          <div className="topic-date-inputs-group">
            <label className="topic-field-date">
              <span>开始时间（北京时间）</span>
              <input
                type="datetime-local"
                step="1"
                aria-label="开始时间"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value)
                  setDateError?.('')
                }}
                disabled={busy}
              />
            </label>
            <span className="topic-date-separator">至</span>
            <label className="topic-field-date">
              <span>结束时间（北京时间）</span>
              <input
                type="datetime-local"
                step="1"
                aria-label="结束时间"
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value)
                  setDateError?.('')
                }}
                disabled={busy}
              />
            </label>
          </div>
          <p className="topic-date-time-hint">时间按北京时间（{timezone}）解释，包含起止时刻。</p>
        </div>
      )}

      {/* Advanced Expandable Affordance */}
      <div className="topic-filter-expandable-section">
        <details
          className="topic-filter-advanced"
          open={showAdvanced}
          onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
        >
          <summary>高级筛选 · 别名、排除与成员</summary>
          <div className="topic-advanced-inputs">
            <label>
              别名
              <input
                aria-label="别名"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                placeholder="逗号或换行分隔"
                disabled={busy}
              />
            </label>
            <label>
              排除
              <input
                aria-label="排除"
                value={excludes}
                onChange={(e) => setExcludes(e.target.value)}
                placeholder="逗号或换行分隔"
                disabled={busy}
              />
            </label>
            <label>
              成员 ID
              <input
                aria-label="成员 ID"
                value={memberIds}
                onChange={(e) => setMemberIds(e.target.value)}
                placeholder="逗号或换行分隔"
                disabled={busy}
              />
            </label>
          </div>
        </details>
      </div>

      {/* Subscription Drawer Outside Main Result Flow */}
      <TopicSubscriptionDrawer
        groupId={groupId}
        topic={topic}
        aliases={aliases}
        excludes={excludes}
        memberIds={memberIds}
        active={active}
        open={showSubscription}
        onClose={() => setShowSubscription(false)}
        onLoadBundle={onLoadBundle}
      />
    </section>
  )
}
