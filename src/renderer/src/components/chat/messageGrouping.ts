import { Message } from '../../../../shared/types'

const GROUP_INTERVAL_SECONDS = 5 * 60
const TIME_SEPARATOR_INTERVAL_SECONDS = 10 * 60

export interface MessageGroupModel {
  id: string
  messages: Message[]
  isSystem: boolean
  isMine: boolean
  timeLabel?: string
}

const getMessageTime = (message: Message): number | null => {
  if (typeof message.createTime === 'number' && message.createTime > 0) return message.createTime
  const parsed = Date.parse(message.datetime)
  if (Number.isNaN(parsed)) return null
  return Math.floor(parsed / 1000)
}

const getSenderKey = (message: Message): string =>
  String(message.senderId || message.name || message.from || '').trim()

const formatClock = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

export const isSystemMessage = (message: Message): boolean =>
  message.from === 'system' || message.type === '系统消息'

export const isMineMessage = (message: Message): boolean => message.from === 'assistant'

export const formatMessageTime = (message: Message): string => {
  const timestamp = getMessageTime(message)
  if (!timestamp) return message.datetime
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDiff = Math.round((startOfToday - startOfMessageDay) / 86400000)
  const clock = formatClock(date)

  if (dayDiff === 0) return `今天 ${clock}`
  if (dayDiff === 1) return `昨天 ${clock}`
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${clock}`
  }
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 ${clock}`
}

export const buildMessageGroups = (messages: Message[]): MessageGroupModel[] => {
  const groups: MessageGroupModel[] = []
  let previousGroupStartTime: number | null = null

  messages.forEach((message) => {
    const isSystem = isSystemMessage(message)
    const isMine = isMineMessage(message)
    const timestamp = getMessageTime(message)
    const previousGroup = groups[groups.length - 1]
    const previousMessage = previousGroup?.messages[previousGroup.messages.length - 1]
    const previousTimestamp = previousMessage ? getMessageTime(previousMessage) : null
    const canJoinPrevious =
      previousGroup &&
      !isSystem &&
      !previousGroup.isSystem &&
      previousGroup.isMine === isMine &&
      getSenderKey(previousMessage) === getSenderKey(message) &&
      timestamp !== null &&
      previousTimestamp !== null &&
      timestamp - previousTimestamp >= 0 &&
      timestamp - previousTimestamp <= GROUP_INTERVAL_SECONDS

    if (canJoinPrevious) {
      previousGroup.messages.push(message)
      return
    }

    const needsTimeLabel =
      timestamp !== null &&
      (previousGroupStartTime === null ||
        Math.abs(timestamp - previousGroupStartTime) >= TIME_SEPARATOR_INTERVAL_SECONDS)
    const group: MessageGroupModel = {
      id: message.id || `${groups.length}-${message.datetime}`,
      messages: [message],
      isSystem,
      isMine,
      timeLabel: needsTimeLabel ? formatMessageTime(message) : undefined
    }
    groups.push(group)
    if (timestamp !== null && needsTimeLabel) previousGroupStartTime = timestamp
  })

  return groups
}
