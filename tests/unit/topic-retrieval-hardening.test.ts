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
  type TopicAdapter
} from '../../src/main/services/topic-digest-service'
import type { TopicQuery } from '../../src/shared/topic-digest'
import type { FormattedMessage } from '../../src/main/services/chat-service'

const query: TopicQuery = {
  groupId: 'group',
  topic: 'craft',
  aliases: [],
  excludes: [],
  memberIds: [],
  startTime: 100,
  endTime: 1000,
  timezone: 'Asia/Shanghai'
}
const message = (id: string, content: string, createTime = 200): FormattedMessage => ({
  id,
  content,
  createTime,
  senderId: 'alice',
  name: '成员',
  type: '文本',
  from: 'group',
  datetime: '',
  isSender: false
})
const answer = (ids: string[], text = '已核对的讨论'): string =>
  JSON.stringify({
    selectedIds: ids,
    claims: ids.length ? [{ kind: '事实', text, evidenceIds: ids }] : []
  })
const setup = (source: FormattedMessage[]): TopicAdapter => ({
  groupName: () => '测试群',
  read: vi.fn().mockResolvedValue(source),
  chat: vi.fn(async (messages) => {
    const input = JSON.parse(messages[1].content)
    const evidence = input.evidence || input.source?.evidence
    return { success: true, data: answer(evidence.map((e: { id: string }) => e.id)) }
  })
})

describe('PR 3 retrieval reliability', () => {
  it('keeps evidence identity stable across ordering and unrelated earlier messages, but separates groups', () => {
    const target = message('same-id', 'craft 写作')
    const id = collectTopicEvidence(query, [target])[0].id
    const reordered = collectTopicEvidence(query, [target, message('earlier', 'craft 前情', 100)])
    expect(reordered.find((e) => e.messageId === target.id)?.id).toBe(id)
    expect(collectTopicEvidence({ ...query, groupId: 'other' }, [target])[0].id).not.toBe(id)
    expect(id).toMatch(/^E_[a-f0-9]{24}$/)
  })

  it('expands an empty lexical recall locally, sending only the query to expansion and checking candidates twice', async () => {
    const source = [
      message('tool', '这个写作工具的双向链接适合整理笔记'),
      message('noise', '明天去吃火锅', 950)
    ]
    const dep = setup(source)
    dep.expand = vi
      .fn()
      .mockResolvedValue({ success: true, data: JSON.stringify({ aliases: ['写作工具'] }) })
    const result = await buildTopicBundle(query, dep)
    expect(dep.expand).toHaveBeenCalledWith({ topic: 'craft', aliases: [] })
    expect(result.evidence.map((e) => e.messageId)).toEqual(['tool'])
    expect(result.evidence[0].reason).toBe('扩展关键词')
    expect(dep.chat).toHaveBeenCalledTimes(2)
    expect(result.review).toBe('verified')
    expect(JSON.stringify(vi.mocked(dep.chat).mock.calls)).not.toContain('火锅')
    expect(result.query.aliases).toEqual([])
  })

  it('keeps lexical matches on the existing two-pass path and refuses oversized expansion output', async () => {
    const dep = setup([message('literal', 'craft 笔记')])
    dep.expand = vi.fn()
    expect((await buildTopicBundle(query, dep)).review).toBe('verified')
    expect(dep.expand).not.toHaveBeenCalled()
    const empty = setup([message('noise', '完全无关')])
    empty.expand = vi.fn().mockResolvedValue({
      success: true,
      data: JSON.stringify({ aliases: Array(6).fill('无关') })
    })
    const result = await buildTopicBundle(query, empty)
    expect(result.evidence).toEqual([])
    expect(empty.chat).not.toHaveBeenCalled()
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid_model_output' })])
    )
  })

  it('rejects generic expansion terms rather than recalling unrelated tools', async () => {
    const dep = setup([message('noise', '修车工具准备好了')])
    dep.expand = vi
      .fn()
      .mockResolvedValue({ success: true, data: JSON.stringify({ aliases: ['工具'] }) })
    const result = await buildTopicBundle(query, dep)
    expect(result.evidence).toEqual([])
    expect(dep.chat).not.toHaveBeenCalled()
  })

  it.each([
    ['尚未配置 AI Provider', 'provider_unavailable'],
    ['AI 请求超时', 'provider_timeout'],
    ['upstream failed sk-do-not-expose', 'upstream_error']
  ])('reports %s without exposing provider details', async (error, code) => {
    const dep = setup([message('literal', 'craft 笔记')])
    dep.chat = vi.fn().mockResolvedValue({ success: false, error })
    const result = await buildTopicBundle(query, dep)
    expect(result.review).toBe('unavailable')
    expect(result.claims).toEqual([])
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code })]))
    expect(JSON.stringify(result)).not.toContain('sk-do-not-expose')
  })

  it.each([
    ['not JSON', 'invalid_model_output'],
    [answer(['unknown-id']), 'invalid_evidence_reference']
  ])('distinguishes malformed output from invented evidence references', async (data, code) => {
    const dep = setup([message('literal', 'craft 笔记')])
    dep.chat = vi.fn().mockResolvedValue({ success: true, data })
    const result = await buildTopicBundle(query, dep)
    expect(result.claims).toEqual([])
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code })]))
  })

  it('reviews more than 100k candidate characters in bounded batches then globally checks selected originals', async () => {
    const source = Array.from({ length: 4 }, (_, i) =>
      message(`long-${i}`, `craft ${'字'.repeat(30000)} ${i ? '闲谈' : '取消上线'}`, 200 + i)
    )
    const dep = setup(source)
    const targetId = collectTopicEvidence(query, source)[0].id
    let globalChecked = false
    dep.chat = vi.fn(async (messages) => {
      const input = JSON.parse(messages[1].content)
      expect(messages[1].content.length).toBeLessThanOrEqual(100000)
      const evidence = input.evidence || input.source?.evidence
      if (input.batchDrafts) globalChecked = true
      const selected = evidence.filter((e: { id: string }) => e.id === targetId)
      return {
        success: true,
        data: answer(
          selected.map((e: { id: string }) => e.id),
          '取消上线'
        )
      }
    })
    const result = await buildTopicBundle(query, dep)
    expect(result.review).toBe('verified')
    expect(result.evidence).toHaveLength(4)
    expect(result.evidence[0].text).toContain('取消上线')
    expect(result.claims[0].evidenceIds).toEqual([targetId])
    expect(globalChecked).toBe(true)
    expect(vi.mocked(dep.chat).mock.calls.length).toBeGreaterThan(2)
  })

  it('keeps oversized individual evidence intact and reports its budget limit', async () => {
    const dep = setup([message('huge', `craft ${'字'.repeat(100001)} 撤销`)])
    const result = await buildTopicBundle(query, dep)
    expect(result.claims).toEqual([])
    expect(result.evidence[0].text.endsWith('撤销')).toBe(true)
    expect(dep.chat).not.toHaveBeenCalled()
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'context_budget_exceeded' })])
    )
  })

  it('does not publish locally reviewed drafts when selected originals exceed the global budget', async () => {
    const source = Array.from({ length: 4 }, (_, i) =>
      message(`large-${i}`, `craft ${'字'.repeat(30000)} 撤销`, 200 + i)
    )
    const dep = setup(source)
    const result = await buildTopicBundle(query, dep)
    expect(result.evidence).toHaveLength(4)
    expect(result.claims).toEqual([])
    expect(result.review).toBe('unavailable')
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'context_budget_exceeded' })])
    )
    expect(vi.mocked(dep.chat).mock.calls.length).toBeGreaterThan(2)
  })

  it('stops immediately if the account changes during query expansion', async () => {
    let identity = 'account-a'
    const dep = setup([message('tool', '写作工具')])
    dep.identity = () => identity
    dep.expand = vi.fn(async () => {
      identity = 'account-b'
      return { success: true, data: JSON.stringify({ aliases: ['写作工具'] }) }
    })
    await expect(buildTopicBundle(query, dep)).rejects.toThrow('账号已切换')
    expect(dep.chat).not.toHaveBeenCalled()
  })
})
