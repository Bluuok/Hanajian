import React from 'react'
import { createPortal } from 'react-dom'
import type {
  TopicCenterState,
  TopicSubscription,
  TopicBundle
} from '../../../../../shared/topic-digest'
import type { AgentHubStatus } from '../../../../../shared/agent-hub'
import { formatTopicTime, TOPIC_TIMEZONE } from '../../../../../shared/topic-time'

interface TopicSubscriptionDrawerProps {
  groupId: string
  topic: string
  aliases: string
  excludes: string
  memberIds: string
  active: boolean
  open: boolean
  onClose: () => void
  onLoadBundle?: (bundle: TopicBundle) => void
}

export function TopicSubscriptionDrawer({
  groupId,
  topic,
  aliases,
  excludes,
  memberIds,
  active,
  open,
  onClose,
  onLoadBundle
}: TopicSubscriptionDrawerProps): React.ReactElement | null {
  const [center, setCenter] = React.useState<TopicCenterState | null>(null)
  const [hubStatus, setHubStatus] = React.useState<AgentHubStatus | null>(null)
  const [subscriptionTopic, setSubscriptionTopic] = React.useState(topic || 'craft')
  const [deliveryClock, setDeliveryClock] = React.useState('08:00')
  const [centerBusy, setCenterBusy] = React.useState(false)
  const [centerError, setCenterError] = React.useState('')

  React.useEffect(() => {
    setSubscriptionTopic(topic || 'craft')
  }, [topic])

  const refreshCenter = React.useCallback(async () => {
    try {
      const [topicCenter, status] = await Promise.all([
        window.api.getTopicCenter(),
        window.api.getAgentHubStatus()
      ])
      setCenter(topicCenter)
      setHubStatus(status)
    } catch (cause) {
      setCenterError(cause instanceof Error ? cause.message : '无法读取订阅中心')
    }
  }, [])

  React.useEffect(() => {
    if (!active || !open) return
    void refreshCenter()
  }, [active, open, refreshCenter])

  const drawerRef = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const drawer = drawerRef.current
    const focusable = (): HTMLElement[] =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'
        ) || []
      )
    focusable()[0]?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0],
        last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const saveSubscription = async (): Promise<void> => {
    const recipient = hubStatus?.wechatUserId
    if (!recipient || !groupId || !subscriptionTopic.trim()) return
    setCenterBusy(true)
    setCenterError('')
    try {
      const updated = await window.api.saveTopicSubscription({
        query: {
          groupId,
          topic: subscriptionTopic.trim(),
          aliases: aliases
            .split(/[，,\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          excludes: excludes
            .split(/[，,\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          memberIds: memberIds
            .split(/[，,\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          timezone: TOPIC_TIMEZONE
        },
        startClock: '00:00',
        endClock: '23:59',
        deliveryClock,
        recipient,
        enabled: true
      })
      setCenter(updated)
    } catch (cause) {
      setCenterError(cause instanceof Error ? cause.message : '保存订阅失败')
    } finally {
      setCenterBusy(false)
    }
  }

  const updateSubscription = async (
    subscription: TopicSubscription,
    enabled: boolean
  ): Promise<void> => {
    setCenterBusy(true)
    setCenterError('')
    try {
      const updated = await window.api.saveTopicSubscription({
        ...subscription,
        enabled
      })
      setCenter(updated)
    } catch (cause) {
      setCenterError(cause instanceof Error ? cause.message : '更新订阅状态失败')
    } finally {
      setCenterBusy(false)
    }
  }

  const runNow = async (subscriptionId?: string): Promise<void> => {
    const ids = subscriptionId
      ? [subscriptionId]
      : (center?.subscriptions || [])
          .filter((item) => item.query.groupId === groupId && item.enabled)
          .map((item) => item.id)
    if (ids.length === 0) return
    setCenterBusy(true)
    setCenterError('')
    try {
      for (const id of ids) {
        const updated = await window.api.runTopicSubscription(id)
        setCenter(updated)
      }
    } catch (cause) {
      setCenterError(cause instanceof Error ? cause.message : '运行订阅失败')
    } finally {
      setCenterBusy(false)
    }
  }

  const groupSubscriptions =
    center?.subscriptions.filter((item) => item.query.groupId === groupId) || []
  const groupSubscriptionIds = new Set(groupSubscriptions.map((s) => s.id))
  const groupRuns =
    center?.runs.filter(
      (item) => item.query?.groupId === groupId || groupSubscriptionIds.has(item.subscriptionId)
    ) || []

  return createPortal(
    <div className="topic-subscription-drawer-overlay" onClick={onClose}>
      <aside
        ref={drawerRef}
        className="topic-subscription-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="每日订阅与运行历史"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="topic-sub-drawer-header">
          <div className="topic-sub-drawer-title">
            <span className="topic-sub-drawer-icon" aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </span>
            <h3>每日订阅管理</h3>
          </div>
          <button
            type="button"
            className="topic-sub-drawer-close"
            aria-label="关闭订阅管理"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="topic-sub-drawer-body">
          {centerError && (
            <div className="topic-sub-alert" role="alert">
              {centerError}
            </div>
          )}

          <div className="topic-sub-card">
            <h4>创建新订阅</h4>
            <label className="topic-sub-field">
              <span>话题关键词</span>
              <input
                type="text"
                value={subscriptionTopic}
                onChange={(e) => setSubscriptionTopic(e.target.value)}
                placeholder="例如：craft"
                disabled={centerBusy}
              />
            </label>

            <label className="topic-sub-field">
              <span>每日推送时间（北京时间）</span>
              <input
                type="time"
                value={deliveryClock}
                onChange={(e) => setDeliveryClock(e.target.value)}
                disabled={centerBusy}
              />
            </label>

            <div className="topic-subscription-recipient">
              固定推送收件人：{hubStatus?.wechatUserId || '未连接'}
            </div>

            <button
              type="button"
              className="topic-sub-primary-btn"
              disabled={
                centerBusy || !hubStatus?.wechatUserId || !groupId || !subscriptionTopic.trim()
              }
              onClick={() => void saveSubscription()}
            >
              {centerBusy ? '正在保存…' : '保存此群每日订阅'}
            </button>
          </div>

          <div className="topic-sub-card">
            <div className="topic-sub-card-header">
              <h4>当前群订阅 ({groupSubscriptions.length})</h4>
              {groupSubscriptions.length > 0 && (
                <button
                  type="button"
                  className="topic-sub-run-btn"
                  disabled={centerBusy}
                  onClick={() => void runNow()}
                >
                  立即运行全部
                </button>
              )}
            </div>

            {groupSubscriptions.length === 0 ? (
              <p className="topic-sub-empty">当前群暂未设置每日订阅。</p>
            ) : (
              <div className="topic-sub-list">
                {groupSubscriptions.map((sub) => (
                  <div key={sub.id} className="topic-subscription-item">
                    <div className="topic-sub-info">
                      <span
                        className={`topic-sub-status ${sub.enabled ? 'is-enabled' : 'is-disabled'}`}
                      >
                        {sub.enabled ? '启用中' : '已暂停'}
                      </span>
                      <strong>{sub.query.topic}</strong>
                      <small>每日 {sub.deliveryClock}</small>
                    </div>
                    <div className="topic-sub-actions">
                      <button
                        type="button"
                        onClick={() => void updateSubscription(sub, !sub.enabled)}
                        disabled={centerBusy}
                      >
                        {sub.enabled ? '暂停' : '继续'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runNow(sub.id)}
                        disabled={centerBusy}
                      >
                        立即运行
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="topic-sub-card">
            <h4>历史运行记录 ({groupRuns.length})</h4>
            {groupRuns.length === 0 ? (
              <p className="topic-sub-empty">暂无历史运行记录。</p>
            ) : (
              <div className="topic-sub-history-list">
                {groupRuns.map((run) => {
                  const isSuccess = Boolean(run.bundle)
                  const isFailed = run.status === 'failed'
                  const runTopic =
                    run.query?.topic ||
                    center?.subscriptions.find((s) => s.id === run.subscriptionId)?.query.topic ||
                    '话题'
                  const badgeText = isSuccess
                    ? '已生成'
                    : run.status === 'running'
                      ? '运行中'
                      : run.status === 'blocked'
                        ? '阻塞'
                        : '失败'
                  const badgeClass = isSuccess
                    ? 'badge-success'
                    : run.status === 'running'
                      ? 'badge-running'
                      : 'badge-failure'
                  return (
                    <div key={run.id} className="topic-run-history-item">
                      <div className="topic-run-meta">
                        <span className={`topic-run-badge ${badgeClass}`}>{badgeText}</span>
                        <span className="topic-run-topic">{runTopic}</span>
                        <time className="topic-run-time">
                          {formatTopicTime(run.startedAt, TOPIC_TIMEZONE)}
                        </time>
                      </div>

                      {run.message && <p className="topic-run-error">{run.message}</p>}

                      <div className="topic-run-actions">
                        {run.bundle && onLoadBundle && (
                          <button
                            type="button"
                            className="topic-run-view-btn"
                            onClick={() => {
                              onLoadBundle(run.bundle!)
                              onClose()
                            }}
                          >
                            载入此包到当前视图
                          </button>
                        )}
                        {isFailed && (
                          <button
                            type="button"
                            className="topic-run-retry-btn"
                            disabled={centerBusy}
                            onClick={() => void runNow(run.subscriptionId)}
                          >
                            重试运行
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body
  )
}
