import { describe, expect, it, vi } from 'vitest'
vi.mock('../../src/main/services/chat-service', () => ({
  getChatDb: vi.fn(),
  listContacts: vi.fn(),
  listMessagesAsync: vi.fn()
}))
vi.mock('../../src/main/services/ai-provider-service', () => ({ AIProviderService: class {} }))
import {
  buildTopicBundle,
  collectTopicEvidence,
  validateTopicAnalysis,
  type TopicAdapter
} from '../../src/main/services/topic-digest-service'
import { validateTopicQuery, type TopicQuery } from '../../src/shared/topic-digest'
import type { FormattedMessage } from '../../src/main/services/chat-service'

const query: TopicQuery = {
  groupId: 'group-a',
  topic: 'craft',
  aliases: ['上线'],
  excludes: ['招聘'],
  memberIds: [],
  startTime: 100,
  endTime: 1000,
  timezone: 'Asia/Shanghai'
}
const message = (
  id: string,
  text: string,
  timestamp: number,
  senderId = 'alice'
): FormattedMessage => ({
  id,
  content: text,
  createTime: timestamp,
  senderId,
  name: '成员',
  type: '文本',
  from: 'group-a',
  datetime: '',
  isSender: false
})
const source = [
  message('before', 'craft 的前情', 99),
  message('a', 'craft 周五上线', 100),
  message('b', '不行，支付还有问题', 101, 'bob'),
  message('c', '那改成周六，先修复', 102),
  message('ad', '招聘广告 craft', 103),
  message('after', 'craft 后续', 1001)
]
const sourceIds = collectTopicEvidence(query, source).map((e) => e.id)
const answer = JSON.stringify({
  selectedIds: sourceIds,
  claims: [{ kind: '决定', text: '由周五改成周六', evidenceIds: sourceIds }]
})
const adapter = (
  chat = vi.fn().mockResolvedValue({ success: true, data: answer })
): TopicAdapter => ({
  groupName: (id) => (id === 'group-a' ? '测试群' : undefined),
  read: vi.fn().mockResolvedValue(source),
  chat
})

describe('topic retrieval and evidence checks', () => {
  it('keeps objections and corrections without keywords while enforcing inclusive time and exclusions', () => {
    const evidence = collectTopicEvidence(query, source)
    expect(evidence.map((e) => e.messageId)).toEqual(['a', 'b', 'c'])
    expect(evidence[1].reason).toBe('邻近上下文')
    expect(evidence[2].text).toBe('那改成周六，先修复')
  })
  it('uses sender IDs, deduplicates messages, and preserves long-message tails', () => {
    const long = message('long', 'craft ' + '字'.repeat(3000) + '：取消上线', 200, 'bob')
    const evidence = collectTopicEvidence({ ...query, memberIds: ['bob'] }, [...source, long, long])
    expect(evidence.map((e) => e.messageId)).toEqual(['b', 'long'])
    expect(evidence.at(-1)?.text).toContain('取消上线')
  })
  it('rejects malformed ranges, invalid timezone, oversized filters and unknown groups before model invocation', async () => {
    expect(() => validateTopicQuery({ ...query, startTime: 2000 })).toThrow()
    expect(() => validateTopicQuery({ ...query, timezone: 'Nowhere' })).toThrow()
    expect(() => validateTopicQuery({ ...query, aliases: Array(21).fill('a') })).toThrow()
    const dep = adapter()
    await expect(buildTopicBundle({ ...query, groupId: 'other' }, dep)).rejects.toThrow(
      '群聊不存在'
    )
    expect(dep.read).not.toHaveBeenCalled()
  })
  it('requires valid evidence references and a second model check', async () => {
    const dep = adapter()
    const bundle = await buildTopicBundle(query, dep)
    expect(dep.chat).toHaveBeenCalledTimes(2)
    expect(bundle.review).toBe('verified')
    expect(bundle.claims[0].evidenceIds).toEqual(sourceIds)
    expect(() =>
      validateTopicAnalysis(JSON.stringify({ selectedIds: ['E999'], claims: [] }), bundle.evidence)
    ).toThrow()
    expect(() =>
      validateTopicAnalysis(
        JSON.stringify({
          selectedIds: [sourceIds[0]],
          claims: [{ kind: '决定', text: '无依据', evidenceIds: [] }]
        }),
        bundle.evidence
      )
    ).toThrow()
  })
  it('does not expose an unchecked draft if review fails', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: answer })
      .mockResolvedValueOnce({ success: false })
    const bundle = await buildTopicBundle(query, adapter(chat))
    expect(bundle.claims).toEqual([])
    expect(bundle.review).toBe('unavailable')
    expect(bundle.evidence).toHaveLength(3)
  })
  it('marks incomplete scans and does not invent answers on empty retrieval', async () => {
    const dep = adapter()
    dep.read = vi
      .fn()
      .mockResolvedValue(Array.from({ length: 10001 }, (_, i) => message(String(i), '无关', 500)))
    const bundle = await buildTopicBundle(query, dep)
    expect(bundle.complete).toBe(false)
    expect(bundle.scannedCount).toBe(10000)
    expect(bundle.review).toBe('empty')
    expect(dep.chat).not.toHaveBeenCalled()
  })
  it('refuses to silently truncate oversized model context', async () => {
    const dep = adapter()
    dep.read = vi
      .fn()
      .mockResolvedValue([message('long', 'craft ' + '字'.repeat(100001) + '撤销', 200)])
    const bundle = await buildTopicBundle(query, dep)
    expect(bundle.complete).toBe(false)
    expect(bundle.evidence[0].text.endsWith('撤销')).toBe(true)
    expect(dep.chat).not.toHaveBeenCalled()
  })
  it('discards results and does not send a second model request after an account switch', async () => {
    let identity = 'account-a'
    const dep = adapter(
      vi.fn().mockImplementation(async () => {
        identity = 'account-b'
        return { success: true, data: answer }
      })
    )
    dep.identity = () => identity
    await expect(buildTopicBundle(query, dep)).rejects.toThrow('账号已切换')
    expect(dep.chat).toHaveBeenCalledTimes(1)
  })
})
