import { describe, expect, it, vi, type Mock } from 'vitest'
import { loadTopicSource } from '../../src/renderer/src/features/topics/loadTopicSource'
import type { Message } from '../../src/shared/types'
import type { TopicSourceResult } from '../../src/shared/topic-package'

const locator = { groupId: 'group', messageId: 'target', timestamp: 10 }
const target = { id: 'target', createTime: 10, content: 'raw', isSender: true } as Message
const verified: TopicSourceResult = {
  success: true,
  message: {
    id: 'target',
    groupId: 'group',
    sentAt: 10,
    senderName: 'me',
    content: 'excerpt',
    type: '文本'
  }
}
const makeApi = (
  messages: Message[] = [target]
): {
  locateTopicSource: Mock<() => Promise<TopicSourceResult>>
  getMessages: Mock<() => Promise<Message[]>>
} => ({
  locateTopicSource: vi.fn(async (): Promise<TopicSourceResult> => verified),
  getMessages: vi.fn(async () => messages)
})

describe('source navigation reads exact raw records', () => {
  it('reads a bounded exact second and preserves raw ownership and content', async () => {
    const api = makeApi([{ ...target, id: 'other' }, target])
    const result = await loadTopicSource(api, locator, () => true)
    expect(api.getMessages).toHaveBeenCalledWith('group', 10, 10, { limit: 1001 })
    expect(result?.targetMessageId).toBe('target')
    expect(result?.messages[1]).toBe(target)
  })
  it.each(
    [
      [],
      [{ ...target, id: 'other', localId: 'target' }],
      [target, target],
      Array.from({ length: 1001 }, () => target)
    ].map((messages) => ({ messages }))
  )('rejects absent, aliased, ambiguous or truncated records', async ({ messages }) => {
    await expect(
      loadTopicSource(makeApi(messages as Message[]), locator, () => true)
    ).rejects.toThrow('无法唯一定位')
  })
  it('does not start a raw read if account/group changes during lookup', async () => {
    let current = true
    const api = makeApi()
    api.locateTopicSource.mockImplementation(async () => {
      current = false
      return verified
    })
    expect(await loadTopicSource(api, locator, () => current)).toBeNull()
    expect(api.getMessages).not.toHaveBeenCalled()
  })
  it.each([false, true])(
    'discards success or failure after scope changes during raw read (%s)',
    async (reject) => {
      let current = true
      const api = makeApi()
      api.getMessages.mockImplementation(async () => {
        current = false
        if (reject) throw new Error('old account')
        return [target]
      })
      expect(await loadTopicSource(api, locator, () => current)).toBeNull()
    }
  )
  it('shows lookup failure instead of creating a chat record', async () => {
    const api = makeApi()
    api.locateTopicSource.mockResolvedValue({
      success: false,
      error: { code: 'SOURCE_NOT_FOUND', message: '未找到原文', retryable: false }
    })
    await expect(loadTopicSource(api, locator, () => true)).rejects.toThrow('未找到原文')
    expect(api.getMessages).not.toHaveBeenCalled()
  })
})
