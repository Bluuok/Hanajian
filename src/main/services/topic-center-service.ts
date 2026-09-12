import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import {
  NATIVE_FORWARD_UNAVAILABLE,
  validateTopicQuery,
  type TopicBundle,
  type TopicCenterState,
  type TopicQuery,
  type TopicRun,
  type TopicSubscription
} from '../../shared/topic-digest'

// Subscription clocks are explicitly Beijing time; they do not drift with the OS timezone.
const OFFSET = 8 * 3600
const dayStart = (now: number): number => Math.floor((now + OFFSET) / 86400) * 86400 - OFFSET
const clockSeconds = (clock: string): number => {
  if (typeof clock !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))
    throw new Error('时间须为 HH:mm')
  const [hour, minute] = clock.split(':').map(Number)
  return hour * 3600 + minute * 60
}

export function subscriptionWindow(
  rule: TopicSubscription,
  nowMs: number
): { startTime: number; endTime: number } | null {
  const now = Math.floor(nowMs / 1000)
  const today = dayStart(now)
  if (now < today + clockSeconds(rule.deliveryClock)) return null
  const start = clockSeconds(rule.startClock)
  const end = clockSeconds(rule.endClock)
  return {
    startTime: today - 86400 + start,
    endTime: today - 86400 + end + 59 + (end < start ? 86400 : 0)
  }
}

type Stored = {
  version: 1
  subscriptions: TopicSubscription[]
  runs: TopicRun[]
  windows?: Record<string, number>
}
export class TopicCenterService {
  private busy = false
  constructor(
    private root: string,
    private account: () => string,
    private generate: (q: TopicQuery) => Promise<TopicBundle>
  ) {}

  private path(account = this.account()): string {
    if (!account) throw new Error('请先连接本机微信数据库')
    return join(
      this.root,
      `topics-${createHash('sha256').update(account).digest('hex').slice(0, 24)}.json`
    )
  }
  private load(path: string): Stored {
    if (!existsSync(path)) return { version: 1, subscriptions: [], runs: [] }
    const value = JSON.parse(readFileSync(path, 'utf8')) as Stored
    if (value.version !== 1 || !Array.isArray(value.subscriptions) || !Array.isArray(value.runs))
      throw new Error('订阅文件损坏，请保留文件并检查')
    value.windows ??= Object.fromEntries(
      value.runs.map((r) => [`${r.subscriptionId}:${r.windowEnd}`, r.windowEnd])
    )
    return value
  }
  private save(path: string, state: Stored): void {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(`${path}.tmp`, JSON.stringify(state), 'utf8')
    renameSync(`${path}.tmp`, path)
  }
  getState(): TopicCenterState {
    const data = this.account() ? this.load(this.path()) : { subscriptions: [], runs: [] }
    return {
      subscriptions: data.subscriptions,
      runs: data.runs.map((r) =>
        r.status === 'running' && !this.busy
          ? { ...r, status: 'failed', message: '上次运行中断，请手动重试；未发送。' }
          : r
      ),
      nativeForward: { supported: false, reason: NATIVE_FORWARD_UNAVAILABLE }
    }
  }
  saveSubscription(
    input: Omit<TopicSubscription, 'id' | 'createdAt'> & { id?: string }
  ): TopicCenterState {
    const query = validateTopicQuery({ ...input.query, startTime: 0, endTime: 0 })
    if (query.timezone !== 'Asia/Shanghai')
      throw new Error('每日订阅目前使用北京时间 Asia/Shanghai')
    clockSeconds(input.startClock)
    clockSeconds(input.endClock)
    clockSeconds(input.deliveryClock)
    if (
      typeof input.enabled !== 'boolean' ||
      typeof input.recipient !== 'string' ||
      !input.recipient.trim() ||
      input.recipient.length > 200
    )
      throw new Error('请确认固定收件人')
    const path = this.path()
    const data = this.load(path)
    const old = input.id ? data.subscriptions.find((s) => s.id === input.id) : undefined
    if (input.id && !old) throw new Error('订阅不存在')
    if (!old && data.subscriptions.length >= 20) throw new Error('最多保存 20 个订阅')
    const { startTime: _start, endTime: _end, ...template } = query
    void _start
    void _end
    const rule: TopicSubscription = {
      id: old?.id || randomUUID(),
      createdAt: old?.createdAt || Date.now(),
      query: template,
      startClock: input.startClock,
      endClock: input.endClock,
      deliveryClock: input.deliveryClock,
      recipient: input.recipient.trim(),
      enabled: input.enabled
    }
    data.subscriptions = [...data.subscriptions.filter((s) => s.id !== rule.id), rule]
    this.save(path, data)
    return this.getState()
  }
  async tick(now = Date.now(), manualId?: string): Promise<TopicCenterState> {
    if (this.busy || !this.account()) return this.getState()
    this.busy = true
    const account = this.account()
    const path = this.path(account)
    try {
      const initial = this.load(path)
      const rules = initial.subscriptions
      const retry = manualId?.startsWith('run:')
        ? initial.runs.find((r) => r.id === manualId.slice(4))
        : undefined
      if (manualId && !retry && !rules.some((s) => s.id === manualId))
        throw new Error('订阅或历史任务不存在')
      const jobs: Array<{ rule: TopicSubscription; query: TopicQuery }> = []
      if (retry) {
        const rule = rules.find((s) => s.id === retry.subscriptionId)
        if (!rule || !retry.query) throw new Error('该旧任务没有可重试的查询快照')
        jobs.push({ rule, query: retry.query })
      } else
        for (const rule of rules) {
          if (manualId ? rule.id !== manualId : !rule.enabled) continue
          for (let daysAgo = manualId ? 0 : 6; daysAgo >= 0; daysAgo--) {
            const dueDate = dayStart(Math.floor(now / 1000)) - daysAgo * 86400
            if (!manualId && dueDate < dayStart(Math.floor(rule.createdAt / 1000))) continue
            const range = subscriptionWindow(
              rule,
              manualId || daysAgo > 0 ? (dueDate + 86399) * 1000 : now
            )
            if (!range || range.endTime >= Math.floor(now / 1000)) continue
            if (!manualId && initial.windows?.[`${rule.id}:${range.endTime}`] !== undefined)
              continue
            jobs.push({ rule, query: { ...rule.query, ...range } })
          }
        }
      jobs.sort((a, b) => a.query.endTime - b.query.endTime)
      for (const { rule, query } of jobs.slice(0, 3)) {
        if (this.account() !== account) break
        let state = this.load(path)
        const currentRule = state.subscriptions.find((s) => s.id === rule.id)
        if (
          !currentRule ||
          (!manualId &&
            (!currentRule.enabled || JSON.stringify(currentRule) !== JSON.stringify(rule)))
        )
          continue
        // One durable record per daily window. Failed/interrupted jobs need explicit retry.
        if (!manualId && state.windows?.[`${rule.id}:${query.endTime}`] !== undefined) continue
        const run: TopicRun = {
          id: randomUUID(),
          subscriptionId: rule.id,
          query,
          windowEnd: query.endTime,
          startedAt: now,
          status: 'running',
          message: '正在整理本机消息，尚未投递'
        }
        // Receipts outlive display history: repeated manual retries cannot evict
        // the deduplication record and accidentally restart a completed window.
        state.windows = Object.fromEntries(
          Object.entries(state.windows || {}).filter(
            ([, end]) => end >= dayStart(Math.floor(now / 1000)) - 8 * 86400
          )
        )
        state.windows[`${rule.id}:${query.endTime}`] = query.endTime
        state.runs = [...state.runs, run].slice(-200)
        state.runs.slice(0, -20).forEach((r) => {
          delete r.bundle
        })
        this.save(path, state)
        try {
          run.bundle = await this.generate(query)
          if (this.account() !== account) {
            run.bundle = undefined
            throw new Error('微信账号已切换，本次结果已丢弃')
          }
          run.status = 'blocked'
          run.message = NATIVE_FORWARD_UNAVAILABLE
        } catch (error) {
          run.status = 'failed'
          run.message = error instanceof Error ? error.message : '整理失败'
        }
        state = this.load(path)
        state.runs = state.runs.map((r) => (r.id === run.id ? run : r))
        this.save(path, state)
      }
    } finally {
      this.busy = false
    }
    return this.getState()
  }
}
