/** Home queries and daily subscriptions both use Beijing civil time, independent of OS timezone. */
export const TOPIC_TIMEZONE = 'Asia/Shanghai'
const OFFSET_MS = 8 * 3600_000

export function topicDateTimeInput(epochSeconds: number): string {
  return new Date(epochSeconds * 1000 + OFFSET_MS).toISOString().slice(0, 19)
}

export function parseTopicDateTime(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return NaN
  const normalized = value.length === 16 ? `${value}:00` : value
  const epoch = Date.parse(`${normalized}+08:00`) / 1000
  if (!Number.isSafeInteger(epoch) || epoch < 0) return NaN
  return topicDateTimeInput(epoch) === normalized ? epoch : NaN
}

export function previousTopicDay(now = Date.now()): { start: string; end: string } {
  const today = Math.floor((now + OFFSET_MS) / 86400_000) * 86400_000 - OFFSET_MS
  return {
    start: topicDateTimeInput((today - 86400_000) / 1000),
    end: topicDateTimeInput(today / 1000 - 1)
  }
}

export function formatTopicTime(epochSeconds: number, timezone = TOPIC_TIMEZONE): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: timezone
  }).format(epochSeconds * 1000)
}
