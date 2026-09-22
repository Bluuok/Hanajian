import { describe, expect, it, vi } from 'vitest'
vi.mock('../../src/main/services/chat-service', () => ({
  getChatDb: vi.fn(),
  listContacts: vi.fn(),
  listMessagesAsync: vi.fn()
}))
vi.mock('../../src/main/services/ai-provider-service', () => ({ AIProviderService: class {} }))
import {
  TopicPackageService,
  type TopicPackageAdapter
} from '../../src/main/services/topic-package-service'
import { projectTopicPackage } from '../../src/shared/topic-package'
import {
  parseTopicDateTime,
  previousTopicDay,
  topicDateTimeInput
} from '../../src/shared/topic-time'
import type { TopicBundle, TopicQuery } from '../../src/shared/topic-digest'
import type { FormattedMessage } from '../../src/main/services/chat-service'

const query: TopicQuery = {
  groupId: 'g',
  topic: '发布',
  aliases: [],
  excludes: [],
  memberIds: [],
  startTime: 100,
  endTime: 200,
  timezone: 'Asia/Shanghai'
}
const bundle: TopicBundle = {
  id: 'b',
  query,
  groupName: '测试群',
  createdAt: 123,
  claims: [{ kind: '决定', text: '周六上线', evidenceIds: ['E1'] }],
  evidence: [
    {
      id: 'E1',
      messageId: 'm',
      sender: '小林',
      timestamp: 150,
      text: '周六上线',
      type: '文本',
      reason: '关键词',
      selected: true
    }
  ],
  scannedCount: 2,
  complete: true,
  warnings: [],
  review: 'verified'
}
const source = {
  id: 'm',
  createTime: 150,
  content: '数据库中的完整原文',
  name: '小林',
  type: '文本'
} as FormattedMessage
function setup(): {
  service: TopicPackageService
  adapter: TopicPackageAdapter
  setAccount: (value: unknown) => void
  advance: () => void
} {
  let account: unknown = {}
  let now = 1000
  const adapter: TopicPackageAdapter = {
    identity: () => account,
    groupExists: (id) => id === 'g',
    build: vi.fn().mockResolvedValue(bundle),
    read: vi.fn().mockResolvedValue([source]),
    now: () => now
  }
  return {
    service: new TopicPackageService(adapter),
    adapter,
    setAccount: (value) => {
      account = value
    },
    advance: () => {
      now += 31_000
    }
  }
}

describe('homepage topic contract', () => {
  it('evicts old entries at the cache bound and canonicalizes filter order', async () => {
    const { service, adapter } = setup()
    const filtered = { ...query, aliases: ['a', 'b'], excludes: ['c', 'd'] }
    await service.generate({ query: filtered })
    const reordered = await service.generate({
      query: { ...filtered, aliases: ['b', 'a'], excludes: ['d', 'c'] }
    })
    expect(reordered.success && reordered.fromCache).toBe(true)
    for (let i = 0; i < 12; i++)
      await service.generate({ query: { ...query, topic: `topic-${i}` } })
    expect(adapter.build).toHaveBeenCalledTimes(13)
    await service.generate({ query: filtered })
    expect(adapter.build).toHaveBeenCalledTimes(14)
  })
  it('coalesces forced in-flight requests and recovers after dependency failure', async () => {
    const { service, adapter } = setup()
    let finish!: (value: TopicBundle) => void
    adapter.build = vi.fn(
      () =>
        new Promise<TopicBundle>((resolve) => {
          finish = resolve
        })
    )
    const first = service.generate({ query })
    const forced = service.generate({ query, forceRefresh: true })
    await Promise.resolve()
    finish(bundle)
    expect((await Promise.all([first, forced])).every((result) => result.success)).toBe(true)
    expect(adapter.build).toHaveBeenCalledTimes(1)
    adapter.build = vi.fn().mockRejectedValue(new Error('private-path-or-token'))
    const failed = await service.generate({ query, forceRefresh: true })
    expect(failed).toMatchObject({ success: false, error: { code: 'DEPENDENCY_FAILED' } })
    expect(JSON.stringify(failed)).not.toContain('private-path-or-token')
    adapter.build = vi.fn().mockResolvedValue(bundle)
    expect((await service.generate({ query, forceRefresh: true })).success).toBe(true)
  })
  it('coalesces simultaneous generation and reuses only bounded unexpired snapshots', async () => {
    const { service, adapter, advance } = setup()
    const results = await Promise.all([service.generate({ query }), service.generate({ query })])
    expect(adapter.build).toHaveBeenCalledTimes(1)
    expect(results.every((result) => result.success)).toBe(true)
    const cached = await service.generate({ query })
    expect(cached.success && cached.fromCache).toBe(true)
    if (cached.success) cached.bundle.evidence[0].text = '人工篡改'
    const freshCopy = await service.generate({ query })
    expect(freshCopy.success && freshCopy.bundle.evidence[0].text).toBe('周六上线')
    await service.generate({ query, forceRefresh: true })
    expect(adapter.build).toHaveBeenCalledTimes(2)
    advance()
    await service.generate({ query })
    expect(adapter.build).toHaveBeenCalledTimes(3)
  })
  it('rejects invalid input and unavailable data before model calls, clears cache across accounts', async () => {
    const { service, adapter, setAccount } = setup()
    expect(await service.generate({ query: { ...query, endTime: 1 } })).toMatchObject({
      success: false,
      error: { code: 'INVALID_INPUT' }
    })
    expect(adapter.build).not.toHaveBeenCalled()
    await service.generate({ query })
    setAccount({})
    await service.generate({ query })
    expect(adapter.build).toHaveBeenCalledTimes(2)
    setAccount(null)
    expect(await service.generate({ query })).toMatchObject({
      success: false,
      error: { code: 'DATA_UNAVAILABLE' }
    })
  })
  it('does not publish an in-flight result after account switch or cache AI failures', async () => {
    const { service, adapter, setAccount } = setup()
    adapter.build = vi.fn(async () => {
      setAccount({})
      return bundle
    })
    expect(await service.generate({ query })).toMatchObject({
      success: false,
      error: { code: 'DATA_UNAVAILABLE' }
    })
    adapter.build = vi.fn().mockResolvedValue({ ...bundle, review: 'unavailable' })
    const result = await service.generate({ query })
    expect(result.success && result.package.notices[0].code).toBe('AI_FAILED')
    await service.generate({ query })
    expect(adapter.build).toHaveBeenCalledTimes(2)
  })
  it('classifies a rejected generation after account switch as unavailable data', async () => {
    const { service, adapter, setAccount } = setup()
    adapter.build = vi.fn(async () => {
      setAccount({})
      throw new Error('old-account-provider-error')
    })
    expect(await service.generate({ query })).toMatchObject({
      success: false,
      error: { code: 'DATA_UNAVAILABLE' }
    })
  })
  it('loads historical source independently of renderer history and never silently substitutes another ID', async () => {
    const { service, adapter } = setup()
    expect(await service.locate({ groupId: 'g', messageId: 'm', timestamp: 150 })).toMatchObject({
      success: true,
      message: { content: '数据库中的完整原文' }
    })
    expect(adapter.read).toHaveBeenCalledWith('g', 150, 150, 1001)
    expect(
      await service.locate({ groupId: 'g', messageId: 'missing', timestamp: 150 })
    ).toMatchObject({ success: false, error: { code: 'SOURCE_NOT_FOUND' } })
    expect(await service.locate({ groupId: 'g', timestamp: 150 })).toMatchObject({ success: true })
    adapter.read = vi.fn().mockResolvedValue([source, { ...source, id: 'other' }])
    expect(await service.locate({ groupId: 'g', timestamp: 150 })).toMatchObject({
      success: false,
      error: { code: 'SOURCE_AMBIGUOUS' }
    })
    expect(await service.locate({ groupId: 'g', messageId: 'm' })).toMatchObject({
      success: false,
      error: { code: 'INVALID_INPUT' }
    })
  })
  it('bounds source lookup and rejects data returned after an account switch', async () => {
    const { service, adapter, setAccount } = setup()
    adapter.read = vi.fn().mockResolvedValue(Array(1001).fill(source))
    expect(await service.locate({ groupId: 'g', timestamp: 150 })).toMatchObject({
      success: false,
      error: { code: 'SOURCE_RANGE_TOO_LARGE' }
    })
    adapter.read = vi.fn(async () => {
      setAccount({})
      return [source]
    })
    expect(await service.locate({ groupId: 'g', timestamp: 150 })).toMatchObject({
      success: false,
      error: { code: 'DATA_UNAVAILABLE' }
    })
  })
  it('preserves provenance and omits unsupported metadata and unverified conclusions', () => {
    const result = projectTopicPackage({ ...bundle, review: 'unavailable' })
    expect(result.summary.claims).toEqual([])
    expect(result.summary.abstract).toBe('')
    expect(result.relatedTopics).toEqual([])
    expect(result.summary.category).toBeUndefined()
    expect(result.evidences[0].sourceLocator).toEqual({
      groupId: 'g',
      messageId: 'm',
      timestamp: 150
    })
  })
})

describe('Beijing civil time contract', () => {
  it('uses the same inclusive previous-day range as subscriptions independently of OS timezone', () => {
    const range = previousTopicDay(Date.parse('2026-09-22T00:00:00Z'))
    expect(range).toEqual({ start: '2026-09-21T00:00:00', end: '2026-09-21T23:59:59' })
    expect(parseTopicDateTime(range.end) - parseTopicDateTime(range.start)).toBe(86399)
    expect(parseTopicDateTime(range.start)).toBe(Date.parse('2026-09-20T16:00:00Z') / 1000)
    expect(topicDateTimeInput(parseTopicDateTime(range.start))).toBe(range.start)
    expect(parseTopicDateTime('2026-02-30T12:00')).toBeNaN()
    expect(parseTopicDateTime('2026-09-21T24:00')).toBeNaN()
  })
})
