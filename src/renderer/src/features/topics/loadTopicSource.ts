import type { Message } from '../../../../shared/types'
import type { TopicSourceLocator, TopicSourceResult } from '../../../../shared/topic-package'

interface SourceApi {
  locateTopicSource: (locator: TopicSourceLocator) => Promise<TopicSourceResult>
  getMessages: (
    groupId: string,
    start: number,
    end: number,
    options: { limit: number }
  ) => Promise<Message[]>
}

/** A locator is evidence, not a replacement for the actual chat record. */
export async function loadTopicSource(
  api: SourceApi,
  locator: TopicSourceLocator,
  isCurrent: () => boolean
): Promise<{ messages: Message[]; targetMessageId: string; targetTimestamp: number } | null> {
  try {
    const result = await api.locateTopicSource(locator)
    if (!isCurrent()) return null
    if (!result.success) throw new Error(result.error.message)
    const target = result.message
    if (target.groupId !== locator.groupId || !Number.isFinite(target.sentAt)) {
      throw new Error('原文归属或时间无效，请重新整理话题。')
    }
    const messages = await api.getMessages(locator.groupId, target.sentAt, target.sentAt, {
      limit: 1001
    })
    if (!isCurrent()) return null
    if (
      messages.length > 1000 ||
      messages.filter((message) => message.id === target.id).length !== 1
    ) {
      throw new Error('无法唯一定位这条原始消息，请重新整理话题后重试。')
    }
    return { messages, targetMessageId: target.id, targetTimestamp: target.sentAt }
  } catch (error) {
    if (!isCurrent()) return null
    throw error
  }
}
