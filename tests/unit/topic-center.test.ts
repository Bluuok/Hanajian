import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TopicCenterService,
  subscriptionWindow
} from '../../src/main/services/topic-center-service'
import type { TopicBundle, TopicSubscription } from '../../src/shared/topic-digest'

const roots: string[] = []
afterEach(() => {
  roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true }))
})
const rule: TopicSubscription = {
  id: 's',
  createdAt: 1,
  query: {
    groupId: 'g',
    topic: 'craft',
    aliases: [],
    excludes: [],
    memberIds: [],
    timezone: 'Asia/Shanghai'
  },
  startClock: '00:00',
  endClock: '23:59',
  deliveryClock: '08:00',
  recipient: 'me',
  enabled: true
}
const now = Date.parse('2026-09-12T08:00:00+08:00')
function setup(generate = vi.fn().mockResolvedValue({ id: 'bundle' } as TopicBundle)): {
  center: TopicCenterService
  root: string
} {
  const root = mkdtempSync(join(tmpdir(), 'tracedigest-topic-'))
  roots.push(root)
  return { root, center: new TopicCenterService(root, () => 'account-a', generate) }
}
describe('durable topic subscriptions', () => {
  it('runs at 08:00 Beijing for the exact previous calendar day regardless of host timezone', () => {
    expect(subscriptionWindow(rule, now - 1000)).toBeNull()
    expect(subscriptionWindow(rule, now)).toEqual({
      startTime: Date.parse('2026-09-11T00:00:00+08:00') / 1000,
      endTime: Date.parse('2026-09-11T23:59:59+08:00') / 1000
    })
  })
  it('persists blocked native delivery and does not duplicate after a restart', async () => {
    const generate = vi.fn().mockResolvedValue({ id: 'bundle' })
    const { center, root } = setup(generate)
    center.saveSubscription({ ...rule, id: undefined })
    await center.tick(now)
    const restarted = new TopicCenterService(root, () => 'account-a', generate)
    await restarted.tick(now + 60000)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(restarted.getState().runs[0].status).toBe('blocked')
    expect(restarted.getState().nativeForward.supported).toBe(false)
  })
  it('isolates accounts and pauses disabled subscriptions', async () => {
    const generate = vi.fn()
    const { center, root } = setup(generate)
    center.saveSubscription({ ...rule, id: undefined, enabled: false })
    await center.tick(now)
    expect(generate).not.toHaveBeenCalled()
    expect(
      new TopicCenterService(root, () => 'account-b', generate).getState().subscriptions
    ).toEqual([])
  })
  it('records failures once and supports explicit retry without automatic retry loops', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('模型离线'))
    const { center } = setup(generate)
    const saved = center.saveSubscription({ ...rule, id: undefined }).subscriptions[0]
    await center.tick(now)
    await center.tick(now + 60000)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(center.getState().runs[0].status).toBe('failed')
    await center.tick(now, saved.id)
    expect(generate).toHaveBeenCalledTimes(2)
  })
  it('serializes concurrent scheduler ticks', async () => {
    let resolve!: (value: TopicBundle) => void
    const generate = vi.fn().mockImplementation(
      () =>
        new Promise<TopicBundle>((r) => {
          resolve = r
        })
    )
    const { center } = setup(generate)
    center.saveSubscription({ ...rule, id: undefined })
    const first = center.tick(now)
    await center.tick(now)
    expect(generate).toHaveBeenCalledTimes(1)
    resolve({ id: 'bundle' } as TopicBundle)
    await first
  })
  it('catches up missed windows with a three-job bound and retries the original failed window', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('offline'))
    const { center } = setup(generate)
    vi.spyOn(Date, 'now').mockReturnValue(now - 4 * 86400000)
    center.saveSubscription({ ...rule, id: undefined })
    await center.tick(now)
    expect(generate).toHaveBeenCalledTimes(3)
    const oldest = center.getState().runs[0]
    const originalQuery = oldest.query
    await center.tick(now + 86400000, `run:${oldest.id}`)
    expect(generate).toHaveBeenLastCalledWith(originalQuery)
    vi.restoreAllMocks()
  })
  it('catches up historical due windows before todays delivery time', async () => {
    const generate = vi.fn().mockResolvedValue({ id: 'bundle' })
    const { center } = setup(generate)
    vi.spyOn(Date, 'now').mockReturnValue(now - 2 * 86400000)
    center.saveSubscription({ ...rule, id: undefined })
    await center.tick(now - 3600000)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(
      center
        .getState()
        .runs.every((r) => r.windowEnd < Date.parse('2026-09-11T00:00:00+08:00') / 1000)
    ).toBe(true)
    vi.restoreAllMocks()
  })
})
