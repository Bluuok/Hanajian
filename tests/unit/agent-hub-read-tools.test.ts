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
    listMessages: vi.fn().mockResolvedValue(messages),
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
    expect(fake.listMessages).toHaveBeenCalledWith(group.md5, undefined, undefined, { limit: 100 })
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

  it('rejects every unknown or write-like tool name', async () => {
    const result = await executeAgentHubReadTool(
      toolCall('delete_messages', { group_id: group.md5 }),
      adapter()
    )
    expect(result).toEqual({ ok: false, error: '不允许调用工具“delete_messages”' })
  })
})
