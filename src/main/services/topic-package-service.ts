import { validateTopicQuery, type TopicBundle, type TopicQuery } from '../../shared/topic-digest'
import {
  projectTopicPackage,
  type TopicError,
  type TopicErrorCode,
  type TopicPackageRequest,
  type TopicPackageResult,
  type TopicSourceLocator,
  type TopicSourceResult
} from '../../shared/topic-package'
import { buildTopicBundle } from './topic-digest-service'
import { getChatDb, listContacts, listMessagesAsync, type FormattedMessage } from './chat-service'

class TopicFailure extends Error {
  constructor(readonly detail: TopicError) {
    super(detail.message)
  }
}
const fail = (code: TopicErrorCode, message: string, retryable = false): never => {
  throw new TopicFailure({ code, message, retryable })
}
const errorOf = (error: unknown): TopicError =>
  error instanceof TopicFailure
    ? error.detail
    : {
        code: 'DEPENDENCY_FAILED',
        message: '本机数据服务暂时不可用，请稍后重试。',
        retryable: true
      }

export interface TopicPackageAdapter {
  identity(): unknown
  groupExists(id: string): boolean
  build(query: TopicQuery): Promise<TopicBundle>
  read(groupId: string, start?: number, end?: number, limit?: number): Promise<FormattedMessage[]>
  now?(): number
}

/** Short-lived account-scoped snapshot cache. Force refresh bypasses results, never active requests. */
export class TopicPackageService {
  private identity: unknown
  private cache = new Map<string, { expires: number; bundle: TopicBundle }>()
  private pending = new Map<string, Promise<TopicBundle>>()
  constructor(private adapter: TopicPackageAdapter) {}

  private scope(groupId: string): unknown {
    const identity = this.adapter.identity()
    if (identity !== this.identity) {
      this.identity = identity
      this.cache.clear()
      this.pending.clear()
    }
    if (!identity || !this.adapter.groupExists(groupId)) {
      fail('DATA_UNAVAILABLE', '当前账号无法读取此群聊，请检查数据库连接或重新选择群聊。')
    }
    return identity
  }

  private check(identity: unknown): void {
    if (!identity || this.adapter.identity() !== identity) {
      fail('DATA_UNAVAILABLE', '数据库或账号已切换，请重新查询。')
    }
  }

  async generate(request: TopicPackageRequest): Promise<TopicPackageResult> {
    try {
      let query: TopicQuery
      try {
        query = validateTopicQuery(request?.query)
        if (request.forceRefresh !== undefined && typeof request.forceRefresh !== 'boolean') {
          throw new Error('强制刷新选项无效')
        }
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: error instanceof Error ? error.message : '条件无效',
            retryable: false
          }
        }
      }
      const identity = this.scope(query.groupId)
      const key = JSON.stringify({
        ...query,
        aliases: [...query.aliases].sort(),
        excludes: [...query.excludes].sort(),
        memberIds: [...query.memberIds].sort()
      })
      const now = this.adapter.now?.() ?? Date.now()
      const cached = this.cache.get(key)
      if (!request.forceRefresh && cached && cached.expires > now) {
        const bundle = structuredClone(cached.bundle)
        return { success: true, bundle, package: projectTopicPackage(bundle), fromCache: true }
      }
      let pending = this.pending.get(key)
      if (!pending) {
        pending = Promise.resolve().then(() => this.adapter.build(query))
        this.pending.set(key, pending)
      }
      let bundle: TopicBundle
      try {
        bundle = await pending
      } catch (error) {
        this.check(identity)
        throw error
      } finally {
        if (this.pending.get(key) === pending) this.pending.delete(key)
      }
      this.check(identity)
      if (bundle.review === 'verified') {
        this.cache.delete(key)
        this.cache.set(key, {
          expires: (this.adapter.now?.() ?? Date.now()) + 30_000,
          bundle: structuredClone(bundle)
        })
        while (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value!)
      }
      bundle = structuredClone(bundle)
      return { success: true, bundle, package: projectTopicPackage(bundle), fromCache: false }
    } catch (error) {
      return { success: false, error: errorOf(error) }
    }
  }

  async locate(input: TopicSourceLocator): Promise<TopicSourceResult> {
    try {
      if (
        !input ||
        typeof input.groupId !== 'string' ||
        !input.groupId.trim() ||
        input.groupId.length > 200 ||
        (input.messageId !== undefined &&
          (typeof input.messageId !== 'string' ||
            !input.messageId.trim() ||
            input.messageId.length > 500)) ||
        !Number.isSafeInteger(input.timestamp) ||
        input.timestamp! < 0 ||
        input.timestamp! > 8640000000000
      )
        fail('INVALID_INPUT', '原文定位需要有效群聊和消息时间；优先提供消息 ID。')
      const identity = this.scope(input.groupId)
      // Read from the database even when the renderer has never loaded this historical range.
      const messages = await this.adapter.read(
        input.groupId,
        input.timestamp,
        input.timestamp,
        1001
      )
      this.check(identity)
      if (messages.length > 1000)
        fail('SOURCE_RANGE_TOO_LARGE', '同一时刻消息过多，无法可靠定位原文。')
      const candidates = messages.filter(
        (message) =>
          message.createTime === input.timestamp &&
          (!input.messageId || message.id === input.messageId)
      )
      if (!candidates.length)
        fail('SOURCE_NOT_FOUND', '本机未找到这条原始消息，可能已删除或当前数据库未包含它。')
      if (candidates.length !== 1)
        fail('SOURCE_AMBIGUOUS', '此时间对应多条消息，请使用完整消息 ID 定位。')
      const message = candidates[0]
      return {
        success: true,
        message: {
          id: message.id,
          groupId: input.groupId,
          senderId: message.senderId,
          senderName: message.name || message.senderId || (message.isSender ? '我' : '未知成员'),
          sentAt: message.createTime!,
          content: message.voiceTranscript
            ? `[语音转写] ${message.voiceTranscript}`
            : message.content,
          type: message.type
        }
      }
    } catch (error) {
      return { success: false, error: errorOf(error) }
    }
  }
}

export const topicPackageService = new TopicPackageService({
  identity: getChatDb,
  groupExists: (id) =>
    listContacts().some((contact) => contact.type === 'group' && contact.md5 === id),
  build: buildTopicBundle,
  read: (id, start, end, limit) => listMessagesAsync(id, start, end, { limit }, 'TOPIC_SOURCE')
})

export async function generateTopicBundle(query: TopicQuery): Promise<TopicBundle> {
  const result = await topicPackageService.generate({ query })
  if (!result.success) throw new TopicFailure(result.error)
  return result.bundle
}
