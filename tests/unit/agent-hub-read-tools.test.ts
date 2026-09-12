import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/services/chat-service', () => ({
  listContacts: vi.fn(() => []),
  listMessagesAsync: vi.fn(async () => []),
  getGroupSnapshotAsync: vi.fn(async () => null)
}))

import type { AIToolCall } from '../../src/shared/ai-provider'
import {
  AGENT_HUB_READ_TOOLS,
  executeAgentHubReadTool,
  type AgentHubReadAdapter
} from '../../src/main/services/agent-hub-read-tools'
import type {
  FormattedContact,
  FormattedMessage,
  GroupSnapshot
} from '../../src/main/services/chat-service'

const group: FormattedContact = {
  m_nsUsrName: 'product@chatroom',
  m_nsNickName: '产品交流群',
  md5: 'group-md5',
  type: 'group'
}

const snapshot: GroupSnapshot = {
  roomId: 'product@chatroom',
  memberCount: 2,
  members: [
    {
      wxid: 'wxid_zhangsan',
      nickname: '张三',
      groupNickname: '研发张三',
      wechatNickname: '张三',
      remark: '',
      avatar: ''
    },
    {
      wxid: 'wxid_lisi',
      nickname: '李四',
      groupNickname: '产品李四',
      wechatNickname: '李四',
      remark: '',
      avatar: ''
    }
  ]
}

function message(
  id: string,
  createTime: number,
  senderId: string,
  name: string,
  content: string
): FormattedMessage {
  return {
    id,
    from: 'user',
    type: '普通文本',
    datetime: new Date(createTime * 1000).toLocaleString('zh-CN', { hour12: false }),
    content,
    isSender: false,
    senderId,
    name,
    createTime
  }
}

function toolCall(name: string, args: Record<string, unknown>): AIToolCall {
  return {
    id: `call-${name}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) }
  }
}

function adapter(messages: FormattedMessage[] = []): AgentHubReadAdapter {
  return {
    listGroups: () => [group],
    listMessages: vi.fn(async (_groupId, startTime, endTime, options) => {
      const filtered = messages.filter(
        (item) =>
          (!startTime || Number(item.createTime) >= startTime) &&
          (!endTime || Number(item.createTime) <= endTime)
      )
      return options?.limit ? filtered.slice(-options.limit) : filtered
    }),
    getGroupSnapshot: vi.fn().mockResolvedValue(snapshot)
  }
}

describe('Agent Hub read-only tools', () => {
  it('only exposes group lookup and message-reading tools', () => {
    const names = AGENT_HUB_READ_TOOLS.map((tool) => tool.function.name)
    expect(names).toEqual([
      'find_groups',
      'read_group_messages',
      'find_group_members',
      'read_group_member_messages'
    ])
    expect(names.join(' ')).not.toMatch(/send|delete|write|update|remove/i)
  })

  it('finds a group and reads the requested recent message count', async () => {
    const fake = adapter([
      message('1', 100, 'wxid_zhangsan', '张三', '第一条'),
      message('2', 200, 'wxid_lisi', '李四', '第二条')
    ])
    const found = await executeAgentHubReadTool(
      toolCall('find_groups', { query: '产品交流' }),
      fake
    )
    expect(found).toMatchObject({ ok: true, count: 1 })

    const read = await executeAgentHubReadTool(
      toolCall('read_group_messages', { group_id: group.md5, limit: 100 }),
      fake
    )
    expect(read).toMatchObject({ ok: true, count: 2 })
    expect(fake.listMessages).toHaveBeenCalledWith(group.md5, undefined, undefined, { limit: 101 })
  })

  it('continues within a second without dropping messages', async () => {
    const fake = adapter([
      message('older', 99, 'wxid_zhangsan', '张三', '更早'),
      message('same-1', 100, 'wxid_zhangsan', '张三', '同秒一'),
      message('same-2', 100, 'wxid_lisi', '李四', '同秒二'),
      message('same-3', 100, 'wxid_lisi', '李四', '同秒三')
    ])
    const first = await executeAgentHubReadTool(
      toolCall('read_group_messages', { group_id: group.md5, limit: 2 }),
      fake
    )
    expect(first).toMatchObject({ ok: true, count: 2, has_more: true })
    expect((first['messages'] as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'same-2',
      'same-3'
    ])

    const second = await executeAgentHubReadTool(
      toolCall('read_group_messages', {
        group_id: group.md5,
        limit: 2,
        before_cursor: first['next_cursor']
      }),
      fake
    )
    expect(second).toMatchObject({ ok: true, count: 2, has_more: false })
    expect((second['messages'] as Array<{ id: string }>).map((item) => item.id)).toEqual([
      'older',
      'same-1'
    ])
  })

  it('filters messages to the requested group member', async () => {
    const fake = adapter([
      message('1', 100, 'wxid_zhangsan', '研发张三', '修复支付问题'),
      message('2', 200, 'wxid_lisi', '产品李四', '确认需求'),
      message('3', 300, 'wxid_zhangsan', '研发张三', '已经上线')
    ])
    const result = await executeAgentHubReadTool(
      toolCall('read_group_member_messages', {
        group_id: group.md5,
        member_query: '张三',
        limit: 100
      }),
      fake
    )
    expect(result).toMatchObject({ ok: true, count: 2 })
    expect(result['messages']).toEqual([
      expect.objectContaining({ sender_id: 'wxid_zhangsan', text: '修复支付问题' }),
      expect.objectContaining({ sender_id: 'wxid_zhangsan', text: '已经上线' })
    ])
  })

  it('trusts a present sender id before a matching display name', async () => {
    const fake = adapter([
      message('1', 100, 'wxid_lisi', '研发张三', '昵称碰巧相同'),
      message('2', 200, '', '研发张三', '旧数据只有昵称'),
      message('3', 300, 'wxid_zhangsan', '别名', '明确发送者')
    ])
    const result = await executeAgentHubReadTool(
      toolCall('read_group_member_messages', {
        group_id: group.md5,
        member_query: '张三',
        limit: 100
      }),
      fake
    )
    expect((result['messages'] as Array<{ id: string }>).map((item) => item.id)).toEqual(['2', '3'])
  })

  it('paginates member matches when the result limit truncates them', async () => {
    const fake = adapter([
      message('1', 100, 'wxid_zhangsan', '研发张三', '一'),
      message('2', 200, 'wxid_zhangsan', '研发张三', '二'),
      message('3', 300, 'wxid_zhangsan', '研发张三', '三')
    ])
    const first = await executeAgentHubReadTool(
      toolCall('read_group_member_messages', {
        group_id: group.md5,
        member_query: '张三',
        limit: 2
      }),
      fake
    )
    expect(first).toMatchObject({ ok: true, count: 2, has_more: true })

    const second = await executeAgentHubReadTool(
      toolCall('read_group_member_messages', {
        group_id: group.md5,
        member_query: '张三',
        limit: 2,
        before_cursor: first['next_cursor']
      }),
      fake
    )
    expect(second).toMatchObject({ ok: true, count: 1, has_more: false })
    expect((second['messages'] as Array<{ id: string }>).map((item) => item.id)).toEqual(['1'])
  })

  it('continues member scanning after the scan window contains no match', async () => {
    const messages = [message('target', 1, 'wxid_zhangsan', '研发张三', '较早发言')]
    for (let index = 0; index < 5000; index += 1) {
      messages.push(message(`other-${index}`, index + 2, 'wxid_lisi', '产品李四', '其他发言'))
    }
    const fake = adapter(messages)
    const first = await executeAgentHubReadTool(
      toolCall('read_group_member_messages', {
        group_id: group.md5,
        member_query: '张三',
        limit: 10
      }),
      fake
    )
    expect(first).toMatchObject({ ok: true, count: 0, has_more: true })

    const second = await executeAgentHubReadTool(
      toolCall('read_group_member_messages', {
        group_id: group.md5,
        member_query: '张三',
        limit: 10,
        before_cursor: first['next_cursor']
      }),
      fake
    )
    expect(second).toMatchObject({ ok: true, count: 1, has_more: false })
    expect((second['messages'] as Array<{ id: string }>)[0]).toMatchObject({ id: 'target' })
  })

  it('rejects every unknown or write-like tool name', async () => {
    const result = await executeAgentHubReadTool(
      toolCall('delete_messages', { group_id: group.md5 }),
      adapter()
    )
    expect(result).toEqual({ ok: false, error: '不允许调用工具“delete_messages”' })
  })
  it('completes the first boundary second before imposing cursor order', async () => {
    const fake = adapter(
      ['z', 'b', 'x', 'a', 'm', 'c'].map((id) => message(id, 100, 's', '成员', id))
    )
    const ids: string[] = []
    let cursor: unknown
    for (let page = 0; page < 5; page++) {
      const result = await executeAgentHubReadTool(
        toolCall('read_group_messages', { group_id: group.md5, limit: 2, before_cursor: cursor }),
        fake
      )
      ids.push(...(result.messages as Array<{ id: string }>).map((m) => m.id))
      if (!result.has_more) break
      cursor = result.next_cursor
    }
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'm', 'x', 'z'])
  })
  it('rejects cursors outside a hard range and prioritizes the compound cursor over legacy time', async () => {
    const fake = adapter(['a', 'b', 'c'].map((id) => message(id, 100, 's', '成员', id)))
    const invalid = await executeAgentHubReadTool(
      toolCall('read_group_messages', {
        group_id: group.md5,
        end_time: 99,
        before_cursor: 'v1:100:c'
      }),
      fake
    )
    expect(invalid.ok).toBe(false)
    const result = await executeAgentHubReadTool(
      toolCall('read_group_messages', {
        group_id: group.md5,
        before_time: 100,
        before_cursor: 'v1:100:c'
      }),
      fake
    )
    expect((result.messages as Array<{ id: string }>).map((m) => m.id)).toEqual(['a', 'b'])
  })
})
