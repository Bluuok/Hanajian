export interface TopicQuery {
  groupId: string
  topic: string
  aliases: string[]
  excludes: string[]
  memberIds: string[]
  startTime: number
  endTime: number
  timezone: string
}

export interface TopicEvidence {
  id: string
  messageId: string
  sender: string
  senderId?: string
  timestamp: number
  text: string
  type: string
  reason: '关键词' | '引用关联' | '邻近上下文'
  selected: boolean
}

export interface TopicClaim {
  kind: '事实' | '建议' | '决定' | '争议' | '待办' | '未解决'
  text: string
  evidenceIds: string[]
}

export interface TopicBundle {
  id: string
  query: TopicQuery
  groupName: string
  createdAt: number
  evidence: TopicEvidence[]
  claims: TopicClaim[]
  scannedCount: number
  complete: boolean
  warnings: string[]
  review: 'verified' | 'unavailable' | 'empty'
}

export interface TopicResult {
  success: boolean
  bundle?: TopicBundle
  error?: string
}

export interface TopicSubscription {
  id: string
  query: Omit<TopicQuery, 'startTime' | 'endTime'>
  startClock: string
  endClock: string
  deliveryClock: string
  recipient: string
  enabled: boolean
  createdAt: number
}

export interface TopicRun {
  id: string
  subscriptionId: string
  windowEnd: number
  query?: TopicQuery
  startedAt: number
  status: 'running' | 'blocked' | 'failed'
  message: string
  bundle?: TopicBundle
}

export interface TopicCenterState {
  subscriptions: TopicSubscription[]
  runs: TopicRun[]
  nativeForward: { supported: false; reason: string }
}

export const NATIVE_FORWARD_UNAVAILABLE =
  '当前微信连接器不支持原生合并聊天记录。话题包会保存在本机，投递已阻塞；不会自动改发文字、图片或公开链接。'

export function validateTopicQuery(input: TopicQuery): TopicQuery {
  if (!input || typeof input !== 'object') throw new Error('话题条件无效')
  const clean = (value: unknown, max: number): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) {
      throw new Error('话题、群或时区格式无效')
    }
    return value.trim()
  }
  const list = (value: unknown): string[] => {
    if (
      !Array.isArray(value) ||
      value.length > 20 ||
      value.some((v) => typeof v !== 'string' || !v.trim() || v.length > 100)
    ) {
      throw new Error('筛选条件最多 20 项，每项 1–100 字')
    }
    return [...new Set(value.map((v: string) => v.trim()))]
  }
  const timezone = clean(input.timezone, 100)
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format()
  } catch {
    throw new Error('时区无效')
  }
  if (
    ![input.startTime, input.endTime].every(
      (v) => Number.isSafeInteger(v) && v >= 0 && v <= 8640000000000
    )
  )
    throw new Error('开始和结束时间必须有效')
  if (input.startTime > input.endTime) throw new Error('开始时间不能晚于结束时间')
  if (input.endTime - input.startTime > 31 * 86400)
    throw new Error('单次话题查询最多 31 天，请分段查询')
  return {
    groupId: clean(input.groupId, 200),
    topic: clean(input.topic, 200),
    timezone,
    startTime: input.startTime,
    endTime: input.endTime,
    aliases: list(input.aliases),
    excludes: list(input.excludes),
    memberIds: list(input.memberIds)
  }
}

export function formatTopicBundle(bundle: TopicBundle): string {
  return [
    `话题：${bundle.query.topic}`,
    `群聊：${bundle.groupName}`,
    `扫描 ${bundle.scannedCount} 条，保留 ${bundle.evidence.filter((e) => e.selected).length} 条；${bundle.complete ? '已扫描本机可读范围' : '结果不完整'}`,
    ...bundle.warnings,
    ...bundle.claims.map((c) => `${c.kind}：${c.text} [${c.evidenceIds.join(', ')}]`)
  ].join('\n')
}
