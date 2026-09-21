import React from 'react'
import type { AgentHubStatus } from '../../../../shared/agent-hub'
import type {
  TopicBundle,
  TopicCenterState,
  TopicEvidence,
  TopicQuery,
  TopicSubscription
} from '../../../../shared/topic-digest'
import './TopicPanel.scss'

interface TopicPanelProps {
  groupId: string
  groupName: string
  onClose: () => void
  variant?: 'panel' | 'workspace'
  active?: boolean
}

const splitList = (value: string): string[] => [
  ...new Set(
    value
      .split(/[，,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  )
]

const localDateTime = (date: Date): string => {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 19)
}

const previousDayRange = (): { start: string; end: string } => {
  const previous = new Date()
  previous.setDate(previous.getDate() - 1)
  previous.setHours(0, 0, 0, 0)
  const end = new Date(previous)
  end.setHours(23, 59, 59, 999)
  return { start: localDateTime(previous), end: localDateTime(end) }
}

const formatTime = (epochSeconds: number): string =>
  new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(epochSeconds * 1000)

const subscriptionName = (subscription: TopicSubscription): string =>
  `${subscription.query.topic} · ${subscription.query.groupId}`

export function TopicPanel({
  groupId,
  groupName,
  onClose,
  variant = 'panel',
  active = true
}: TopicPanelProps): React.ReactElement {
  const initialRange = React.useMemo(previousDayRange, [])
  const [topic, setTopic] = React.useState('craft')
  const [aliases, setAliases] = React.useState('')
  const [excludes, setExcludes] = React.useState('')
  const [memberIds, setMemberIds] = React.useState('')
  const [start, setStart] = React.useState(initialRange.start)
  const [end, setEnd] = React.useState(initialRange.end)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const [bundle, setBundle] = React.useState<TopicBundle | null>(null)
  const [evidence, setEvidence] = React.useState<TopicEvidence[]>([])
  const [summaryInvalid, setSummaryInvalid] = React.useState(false)
  const [selectedEvidenceId, setSelectedEvidenceId] = React.useState('')
  const selectedEvidence = evidence.find((item) => item.id === selectedEvidenceId)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [center, setCenter] = React.useState<TopicCenterState | null>(null)
  const [hubStatus, setHubStatus] = React.useState<AgentHubStatus | null>(null)
  const [subscriptionTopic, setSubscriptionTopic] = React.useState('craft')
  const [centerBusy, setCenterBusy] = React.useState(false)
  const evidenceRefs = React.useRef(new Map<string, HTMLElement>())

  React.useEffect(() => {
    setSelectedEvidenceId('')
    setBundle(null)
    setEvidence([])
    setSummaryInvalid(false)
    setError('')
    setSubscriptionTopic('craft')
  }, [groupId])

  React.useEffect(() => {
    if (!active) return
    let current = true
    const refresh = (): void => {
      void Promise.all([window.api.getTopicCenter(), window.api.getAgentHubStatus()])
        .then(([topicCenter, status]) => {
          if (!current) return
          setCenter(topicCenter)
          setHubStatus(status)
        })
        .catch(
          (cause) =>
            current && setError(cause instanceof Error ? cause.message : '无法读取订阅中心')
        )
    }
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [active])

  const startEpoch = Math.floor(new Date(start).getTime() / 1000)
  const endEpoch = Math.floor(new Date(end).getTime() / 1000)
  const resolvedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

  const makeQuery = (): TopicQuery => ({
    groupId,
    topic: topic.trim(),
    aliases: splitList(aliases),
    excludes: splitList(excludes),
    memberIds: splitList(memberIds),
    startTime: startEpoch,
    endTime: endEpoch,
    timezone: resolvedTimezone
  })

  const generate = async (): Promise<void> => {
    if (
      !groupId ||
      !topic.trim() ||
      !Number.isSafeInteger(startEpoch) ||
      !Number.isSafeInteger(endEpoch)
    )
      return
    setBusy(true)
    setError('')
    try {
      const topicQuery = makeQuery()
      const result = await window.api.askAgentHubLocal({
        question: `整理话题：${topicQuery.topic}`,
        groupId,
        groupName,
        topicQuery
      })
      if (!result.success || !result.bundle) throw new Error(result.error || '没有返回话题包')
      setBundle(result.bundle)
      setEvidence(result.bundle.evidence)
      setSummaryInvalid(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '话题整理失败')
    } finally {
      setBusy(false)
    }
  }

  const toggleEvidence = (id: string): void => {
    setEvidence((current) =>
      current.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    )
    setSummaryInvalid(true)
  }

  const locateEvidence = (id: string): void => {
    setSelectedEvidenceId(id)
    evidenceRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const exportBundle = (): void => {
    if (!bundle) return
    const payload = {
      ...bundle,
      evidence,
      claims: summaryInvalid ? [] : bundle.claims,
      review: summaryInvalid ? 'unavailable' : bundle.review,
      warnings: summaryInvalid
        ? [...bundle.warnings, '人工调整了候选消息，原 AI 结论已失效，需重新整理。']
        : bundle.warnings,
      manualReview: summaryInvalid ? 'summary-invalidated' : 'unchanged'
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `topic-${bundle.query.topic}-${bundle.id}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const saveSubscription = async (): Promise<void> => {
    const recipient = hubStatus?.wechatUserId
    if (!recipient || !groupId || !subscriptionTopic.trim()) return
    setCenterBusy(true)
    setError('')
    try {
      setCenter(
        await window.api.saveTopicSubscription({
          query: {
            groupId,
            topic: subscriptionTopic.trim(),
            aliases: splitList(aliases),
            excludes: splitList(excludes),
            memberIds: splitList(memberIds),
            timezone: 'Asia/Shanghai'
          },
          startClock: '00:00',
          endClock: '23:59',
          deliveryClock: '08:00',
          recipient,
          enabled: true
        })
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存订阅失败')
    } finally {
      setCenterBusy(false)
    }
  }

  const updateSubscription = async (
    subscription: TopicSubscription,
    patch: Partial<TopicSubscription>
  ): Promise<void> => {
    setCenterBusy(true)
    setError('')
    try {
      setCenter(await window.api.saveTopicSubscription({ ...subscription, ...patch }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新订阅失败')
    } finally {
      setCenterBusy(false)
    }
  }

  const runSubscription = async (id: string): Promise<void> => {
    setCenterBusy(true)
    setError('')
    try {
      setCenter(await window.api.runTopicSubscription(id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '立即运行失败')
    } finally {
      setCenterBusy(false)
    }
  }

  return (
    <section className={`topic-panel topic-panel--${variant}`} aria-label="话题整理面板">
      <header className="topic-panel-heading" hidden={variant === 'workspace'}>
        <div>
          <span>本机话题包</span>
          <h3>话题整理</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="收起话题面板">
          收起
        </button>
      </header>

      <div className="topic-panel-scroll">
        <fieldset className="topic-form" disabled={busy}>
          <legend>筛选条件</legend>
          <label>
            话题
            <input
              aria-label="话题"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>
          <details className="topic-advanced">
            <summary>高级筛选 · 别名、排除与成员</summary>
            <div>
              <label>
                别名
                <input
                  aria-label="别名"
                  value={aliases}
                  onChange={(event) => setAliases(event.target.value)}
                  placeholder="逗号或换行分隔"
                />
              </label>
              <label>
                排除
                <input
                  aria-label="排除"
                  value={excludes}
                  onChange={(event) => setExcludes(event.target.value)}
                  placeholder="逗号或换行分隔"
                />
              </label>
              <label>
                成员 ID
                <input
                  aria-label="成员 ID"
                  value={memberIds}
                  onChange={(event) => setMemberIds(event.target.value)}
                  placeholder="逗号或换行分隔"
                />
              </label>
            </div>
          </details>
          <div className="topic-time-row">
            <label>
              开始时间
              <input
                aria-label="开始时间"
                type="datetime-local"
                step="1"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              结束时间
              <input
                aria-label="结束时间"
                type="datetime-local"
                step="1"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </div>
          <div className="topic-timezone">
            <label>
              时区
              <input aria-label="时区" value={timezone} readOnly />
            </label>
          </div>
          <p className="topic-epoch">
            时间按本机时区解释，包含开始和结束时刻。仅检索本机可读的聊天记录。
          </p>
          <button
            className="topic-primary"
            type="button"
            disabled={!groupId || !topic.trim() || busy}
            onClick={() => void generate()}
          >
            {busy ? '整理中…' : '生成话题包'}
          </button>
        </fieldset>

        {error ? (
          <p className="topic-error" role="alert">
            {error}
          </p>
        ) : null}

        {bundle ? (
          <section className="topic-preview" aria-label="话题包预览">
            <div className="topic-preview-title">
              <div>
                <h4>{bundle.query.topic}</h4>
                <p>
                  {bundle.groupName} · 扫描 {bundle.scannedCount} 条
                </p>
              </div>
              <button type="button" onClick={exportBundle}>
                导出本地 JSON
              </button>
            </div>
            {bundle.warnings.length ? (
              <div className="topic-warnings" role="status">
                {bundle.warnings.map((warning) => (
                  <p key={warning}>质量提示：{warning}</p>
                ))}
              </div>
            ) : null}
            {summaryInvalid ? (
              <p className="topic-invalid" role="alert">
                候选消息已人工修改，原 AI 结论已失效。请重新生成话题包。
              </p>
            ) : (
              <div className="topic-claims">
                {bundle.claims.map((claim, index) => (
                  <article key={`${claim.kind}-${index}`}>
                    <strong>{claim.kind}</strong>
                    <p>{claim.text}</p>
                    <div>
                      {claim.evidenceIds.map((id) => (
                        <button
                          type="button"
                          key={id}
                          aria-label={`定位证据 ${id}`}
                          onClick={() => locateEvidence(id)}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="topic-evidence-grid">
              {selectedEvidence && (
                <aside className="topic-source" aria-label="消息来源摘录">
                  <h4>消息来源摘录</h4>
                  <strong>{selectedEvidence.sender}</strong>
                  <time>{formatTime(selectedEvidence.timestamp)}</time>
                  <p>{selectedEvidence.text}</p>
                  <small>
                    {groupName} · 消息 ID：{selectedEvidence.messageId}
                  </small>
                </aside>
              )}
              <div className="topic-evidence-list">
                {evidence.map((item) => (
                  <article
                    key={item.id}
                    ref={(node) => {
                      if (node) evidenceRefs.current.set(item.id, node)
                      else evidenceRefs.current.delete(item.id)
                    }}
                    data-evidence-id={item.id}
                  >
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`选择候选消息 ${item.id}`}
                        checked={item.selected}
                        onChange={() => toggleEvidence(item.id)}
                      />
                      <span>
                        {summaryInvalid
                          ? item.selected
                            ? '人工保留'
                            : '人工排除'
                          : bundle.review === 'verified'
                            ? item.selected
                              ? 'AI 选中'
                              : 'AI 排除'
                            : '待核对候选'}
                      </span>
                    </label>
                    <time dateTime={new Date(item.timestamp * 1000).toISOString()}>
                      {formatTime(item.timestamp)}
                    </time>
                    <strong>
                      {item.sender}
                      {item.senderId ? ` (${item.senderId})` : ''}
                    </strong>
                    <p>{item.text}</p>
                    <button type="button" onClick={() => setSelectedEvidenceId(item.id)}>
                      查看来源摘录
                    </button>
                    <small>
                      入选理由：{item.reason} · 消息 ID：{item.messageId}
                    </small>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!bundle && !busy && (
          <div className="topics-empty">
            <h4>每段讨论，都有值得留下的内容</h4>
            <p>输入话题与时间范围，生成后在这里核对摘要和消息来源。</p>
          </div>
        )}
        <section className="topic-center" aria-label="话题订阅中心">
          <h4>每天 08:00（北京时间）</h4>
          <p>
            整理当前群前一天 00:00–23:59。应用需保持运行；恢复后最多补跑近 7 天，每次最多 3
            个窗口。更早记录请用自定义查询补齐。
          </p>
          <label>
            订阅话题
            <input
              aria-label="订阅话题"
              value={subscriptionTopic}
              onChange={(event) => setSubscriptionTopic(event.target.value)}
            />
          </label>
          <p>固定收件人：{hubStatus?.wechatUserId || '需要连接 Clawbot 后获取'}</p>
          <button
            type="button"
            className="topic-primary"
            disabled={
              centerBusy || !hubStatus?.wechatUserId || !groupId || !subscriptionTopic.trim()
            }
            onClick={() => void saveSubscription()}
          >
            保存订阅
          </button>
          {center?.nativeForward.supported === false ? (
            <p className="topic-native-warning">{center.nativeForward.reason}</p>
          ) : null}
          <div className="topic-subscriptions">
            {center?.subscriptions.map((subscription) => (
              <article key={subscription.id}>
                <strong>{subscriptionName(subscription)}</strong>
                <p>
                  {subscription.enabled ? '运行中' : '已暂停'} · 收件人 {subscription.recipient}
                </p>
                <div>
                  <button
                    type="button"
                    disabled={centerBusy}
                    onClick={() =>
                      void updateSubscription(subscription, { enabled: !subscription.enabled })
                    }
                  >
                    {subscription.enabled ? '暂停' : '继续'}
                  </button>
                  <button
                    type="button"
                    disabled={centerBusy}
                    onClick={() => void runSubscription(subscription.id)}
                  >
                    立即运行
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="topic-runs">
            {center?.runs
              .slice()
              .reverse()
              .map((run) => (
                <article key={run.id}>
                  <strong>
                    {run.status === 'blocked'
                      ? '投递已阻塞'
                      : run.status === 'failed'
                        ? '运行失败'
                        : '正在运行'}
                  </strong>
                  <time>{formatTime(Math.floor(run.startedAt / 1000))}</time>
                  <p>{run.message}</p>
                  {run.bundle ? (
                    <div>
                      <small>
                        已持久化话题包：{run.bundle.query.topic}，{run.bundle.evidence.length}{' '}
                        条候选消息
                      </small>
                      <button
                        type="button"
                        onClick={() => {
                          setBundle(run.bundle!)
                          setEvidence(run.bundle!.evidence)
                          setSummaryInvalid(false)
                        }}
                      >
                        查看话题包
                      </button>
                    </div>
                  ) : null}
                  {run.query && run.status !== 'running' ? (
                    <button
                      type="button"
                      disabled={centerBusy}
                      onClick={() => void runSubscription(`run:${run.id}`)}
                    >
                      重新整理此时间段
                    </button>
                  ) : null}
                </article>
              ))}
          </div>
        </section>
      </div>
    </section>
  )
}
