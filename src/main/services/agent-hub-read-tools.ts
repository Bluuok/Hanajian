import type { AIToolCall, AIToolDefinition } from '../../shared/ai-provider'
import {
  getGroupSnapshotAsync,
  listContacts,
  listMessagesAsync,
  type FormattedContact,
  type FormattedMessage,
  type GroupSnapshot
} from './chat-service'

const MAX_MESSAGES_PER_CALL = 200
const MAX_MEMBER_SCAN_MESSAGES = 5000

export const AGENT_HUB_READ_TOOLS: AIToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'find_groups',
      description:
        '按群名关键词查找微信群聊。读取消息前先调用它确认群聊 ID；如果返回多个候选，应根据名称选择或向用户澄清。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '群聊名称或名称的一部分' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_group_messages',
      description:
        '只读方式获取一个群聊的消息。省略时间时返回最近消息；指定 start_time/end_time 可读取今天下午等时间段；使用 before_time 可继续向前分页。',
      parameters: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'find_groups 返回的群聊 MD5 ID' },
          start_time: {
            type: 'string',
            description: '可选，本机时间，格式 YYYY-MM-DD HH:mm:ss'
          },
          end_time: {
            type: 'string',
            description: '可选，本机时间，格式 YYYY-MM-DD HH:mm:ss'
          },
          before_time: {
            type: 'string',
            description: '可选，分页游标，只读取该时间之前的消息'
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: MAX_MESSAGES_PER_CALL,
            default: 100,
            description: '本次最多读取多少条；总结最近100条时设置为100'
          }
        },
        required: ['group_id'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_group_members',
      description: '只读方式查找指定群的成员，用于确认群成员昵称和微信 ID。',
      parameters: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'find_groups 返回的群聊 MD5 ID' },
          query: { type: 'string', description: '成员群昵称、微信昵称、备注或微信 ID' },
          limit: { type: 'integer', minimum: 1, maximum: 30, default: 10 }
        },
        required: ['group_id', 'query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_group_member_messages',
      description:
        '只读方式获取某位成员在指定群中的发言。支持最近发言、指定时间段和 before_time 分页。',
      parameters: {
        type: 'object',
        properties: {
          group_id: { type: 'string', description: 'find_groups 返回的群聊 MD5 ID' },
          member_query: {
            type: 'string',
            description: '成员群昵称、微信昵称、备注或微信 ID'
          },
          start_time: {
            type: 'string',
            description: '可选，本机时间，格式 YYYY-MM-DD HH:mm:ss'
          },
          end_time: {
            type: 'string',
            description: '可选，本机时间，格式 YYYY-MM-DD HH:mm:ss'
          },
          before_time: {
            type: 'string',
            description: '可选，分页游标，只扫描该时间之前的消息'
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: MAX_MESSAGES_PER_CALL,
            default: 100
          }
        },
        required: ['group_id', 'member_query'],
        additionalProperties: false
      }
    }
  }
]

export interface AgentHubReadAdapter {
  listGroups(): FormattedContact[]
  listMessages(
    groupId: string,
    startTime?: number,
    endTime?: number,
    options?: { limit?: number }
  ): Promise<FormattedMessage[]>
  getGroupSnapshot(groupId: string): Promise<GroupSnapshot | null>
}

const defaultAdapter: AgentHubReadAdapter = {
  listGroups: () => listContacts().filter((contact) => contact.type === 'group'),
  listMessages: (groupId, startTime, endTime, options) =>
    listMessagesAsync(groupId, startTime, endTime, options, 'AGENT-HUB'),
  getGroupSnapshot: (groupId) => getGroupSnapshotAsync(groupId)
}

export async function executeAgentHubReadTool(
  call: AIToolCall,
  adapter: AgentHubReadAdapter = defaultAdapter
): Promise<Record<string, unknown>> {
  let args: Record<string, unknown>
  try {
    const parsed = JSON.parse(call.function.arguments || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return failure('工具参数必须是 JSON 对象')
    }
    args = parsed as Record<string, unknown>
  } catch {
    return failure('工具参数不是有效 JSON')
  }

  try {
    switch (call.function.name) {
      case 'find_groups':
        return findGroups(args, adapter)
      case 'read_group_messages':
        return readGroupMessages(args, adapter)
      case 'find_group_members':
        return findGroupMembers(args, adapter)
      case 'read_group_member_messages':
        return readGroupMemberMessages(args, adapter)
      default:
        return failure(`不允许调用工具“${call.function.name}”`)
    }
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

function findGroups(
  args: Record<string, unknown>,
  adapter: AgentHubReadAdapter
): Record<string, unknown> {
  const query = requiredString(args, 'query')
  const normalizedQuery = normalizeName(query)
  const limit = boundedInteger(args['limit'], 10, 1, 20)
  const groups = adapter
    .listGroups()
    .map((group) => ({
      group,
      searchable: [group.m_nsNickName, group.remark, group.m_nsUsrName]
        .map((value) => normalizeName(value || ''))
        .filter(Boolean)
    }))
    .filter((entry) => entry.searchable.some((value) => value.includes(normalizedQuery)))
    .sort(
      (left, right) =>
        matchScore(right.searchable, normalizedQuery) - matchScore(left.searchable, normalizedQuery)
    )
    .slice(0, limit)
    .map(({ group }) => ({
      id: group.md5,
      name: group.m_nsNickName,
      username: group.m_nsUsrName,
      remark: group.remark || ''
    }))
  return { ok: true, query, count: groups.length, groups }
}

async function readGroupMessages(
  args: Record<string, unknown>,
  adapter: AgentHubReadAdapter
): Promise<Record<string, unknown>> {
  const group = requireGroup(args, adapter)
  const range = parseRange(args)
  if ('error' in range) return failure(range.error)
  const limit = boundedInteger(args['limit'], 100, 1, MAX_MESSAGES_PER_CALL)
  const messages = sortMessages(
    await adapter.listMessages(group.md5, range.startTime, range.endTime, { limit })
  ).slice(-limit)
  return {
    ok: true,
    group: groupSummary(group),
    query: rangeSummary(range),
    count: messages.length,
    messages: messages.map(toAgentMessage),
    has_more: messages.length === limit,
    next_before_time: messages[0]?.createTime ? formatLocalTime(messages[0].createTime) : undefined
  }
}

async function findGroupMembers(
  args: Record<string, unknown>,
  adapter: AgentHubReadAdapter
): Promise<Record<string, unknown>> {
  const group = requireGroup(args, adapter)
  const query = requiredString(args, 'query')
  const limit = boundedInteger(args['limit'], 10, 1, 30)
  const snapshot = await adapter.getGroupSnapshot(group.md5)
  if (!snapshot) return failure(`无法读取群聊“${group.m_nsNickName}”的成员`)
  const normalizedQuery = normalizeName(query)
  const members = snapshot.members
    .map((member) => ({ member, names: memberNames(member).map(normalizeName).filter(Boolean) }))
    .filter((entry) => entry.names.some((name) => name.includes(normalizedQuery)))
    .sort(
      (left, right) =>
        matchScore(right.names, normalizedQuery) - matchScore(left.names, normalizedQuery)
    )
    .slice(0, limit)
    .map(({ member }) => memberSummary(member))
  return { ok: true, group: groupSummary(group), query, count: members.length, members }
}

async function readGroupMemberMessages(
  args: Record<string, unknown>,
  adapter: AgentHubReadAdapter
): Promise<Record<string, unknown>> {
  const group = requireGroup(args, adapter)
  const memberQuery = requiredString(args, 'member_query')
  const snapshot = await adapter.getGroupSnapshot(group.md5)
  if (!snapshot) return failure(`无法读取群聊“${group.m_nsNickName}”的成员`)
  const memberMatch = resolveMember(snapshot, memberQuery)
  if (!memberMatch.member) {
    return {
      ok: false,
      error: memberMatch.error,
      candidates: memberMatch.candidates
    }
  }
  const range = parseRange(args)
  if ('error' in range) return failure(range.error)
  const limit = boundedInteger(args['limit'], 100, 1, MAX_MESSAGES_PER_CALL)
  const sourceMessages = sortMessages(
    await adapter.listMessages(group.md5, range.startTime, range.endTime, {
      limit: MAX_MEMBER_SCAN_MESSAGES
    })
  )
  const aliases = new Set(memberNames(memberMatch.member).map(normalizeName).filter(Boolean))
  const messages = sourceMessages
    .filter(
      (message) =>
        String(message.senderId || '').trim() === memberMatch.member?.wxid ||
        aliases.has(normalizeName(String(message.name || '')))
    )
    .slice(-limit)
  return {
    ok: true,
    group: groupSummary(group),
    member: memberSummary(memberMatch.member),
    query: rangeSummary(range),
    scanned_message_count: sourceMessages.length,
    count: messages.length,
    messages: messages.map(toAgentMessage),
    has_more: sourceMessages.length === MAX_MEMBER_SCAN_MESSAGES,
    next_before_time: sourceMessages[0]?.createTime
      ? formatLocalTime(sourceMessages[0].createTime)
      : undefined
  }
}

function requireGroup(
  args: Record<string, unknown>,
  adapter: AgentHubReadAdapter
): FormattedContact {
  const groupId = requiredString(args, 'group_id')
  const group = adapter.listGroups().find((item) => item.md5 === groupId)
  if (!group) throw new Error('群聊 ID 无效，请先调用 find_groups')
  return group
}

function parseRange(
  args: Record<string, unknown>
): { startTime?: number; endTime?: number; beforeTime?: number } | { error: string } {
  const startTime = parseTime(args['start_time'])
  const requestedEndTime = parseTime(args['end_time'])
  const beforeTime = parseTime(args['before_time'])
  if (startTime === null || requestedEndTime === null || beforeTime === null) {
    return { error: '时间格式无效，请使用 YYYY-MM-DD HH:mm:ss' }
  }
  const endTime = beforeTime
    ? Math.min(requestedEndTime || Number.MAX_SAFE_INTEGER, beforeTime - 1)
    : requestedEndTime
  if (startTime && endTime && startTime > endTime) return { error: '开始时间不能晚于结束时间' }
  return {
    startTime: startTime || undefined,
    endTime: endTime && endTime !== Number.MAX_SAFE_INTEGER ? endTime : undefined,
    beforeTime: beforeTime || undefined
  }
}

function parseTime(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  const raw = String(value).trim()
  if (/^\d{10}$/.test(raw)) return Number(raw)
  const timestamp = new Date(raw.replace(' ', 'T')).getTime()
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null
}

function rangeSummary(range: {
  startTime?: number
  endTime?: number
  beforeTime?: number
}): Record<string, unknown> {
  return {
    start_time: range.startTime ? formatLocalTime(range.startTime) : undefined,
    end_time: range.endTime ? formatLocalTime(range.endTime) : undefined,
    before_time: range.beforeTime ? formatLocalTime(range.beforeTime) : undefined
  }
}

function toAgentMessage(message: FormattedMessage): Record<string, unknown> {
  const voiceTranscript = String(message.voiceTranscript || '').trim()
  const text = String(message.content || '').trim()
  return {
    id: message.id,
    unix_time: message.createTime,
    time: message.datetime,
    sender: message.isSender ? '我' : String(message.name || message.senderId || '未知成员'),
    sender_id: message.senderId || undefined,
    is_self: message.isSender,
    type: message.type,
    text: truncateText(
      voiceTranscript ? `[语音转写] ${voiceTranscript}` : text || `[${message.type}]`
    ),
    details: compactValue(message.contentData)
  }
}

function compactValue(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') {
    if (/^data:/i.test(value)) return '[本地二进制数据已省略]'
    return truncateText(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (depth >= 4) return '[嵌套内容已省略]'
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compactValue(item, depth + 1))
  if (typeof value !== 'object') return String(value)
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/(?:raw|buffer|base64|dataUrl|thumbDataUrl|avatar|imageData)/i.test(key)) continue
    const compacted = compactValue(item, depth + 1)
    if (compacted !== undefined && compacted !== '') result[key] = compacted
  }
  return Object.keys(result).length ? result : undefined
}

function resolveMember(
  snapshot: GroupSnapshot,
  query: string
): {
  member?: GroupSnapshot['members'][number]
  error?: string
  candidates?: Record<string, unknown>[]
} {
  const normalizedQuery = normalizeName(query)
  const entries = snapshot.members.map((member) => ({
    member,
    names: memberNames(member).map(normalizeName).filter(Boolean)
  }))
  const exact = entries.filter((entry) => entry.names.includes(normalizedQuery))
  if (exact.length === 1) return { member: exact[0].member }
  const partial = entries.filter((entry) =>
    entry.names.some((name) => name.includes(normalizedQuery) || normalizedQuery.includes(name))
  )
  if (partial.length === 1) return { member: partial[0].member }
  const candidates = (exact.length ? exact : partial)
    .slice(0, 10)
    .map((entry) => memberSummary(entry.member))
  return {
    error: candidates.length ? '匹配到多个群成员，需要用户确认' : `没有找到群成员“${query}”`,
    candidates
  }
}

function memberNames(member: GroupSnapshot['members'][number]): string[] {
  return [member.groupNickname, member.wechatNickname, member.remark, member.nickname, member.wxid]
}

function memberSummary(member: GroupSnapshot['members'][number]): Record<string, unknown> {
  return {
    wxid: member.wxid,
    group_nickname: member.groupNickname,
    wechat_nickname: member.wechatNickname,
    remark: member.remark,
    nickname: member.nickname
  }
}

function groupSummary(group: FormattedContact): Record<string, unknown> {
  return { id: group.md5, name: group.m_nsNickName, username: group.m_nsUsrName }
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = String(args[key] || '').trim()
  if (!value) throw new Error(`缺少参数 ${key}`)
  return value
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function normalizeName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s，,。！？?：:、“”'‘’]/g, '')
    .replace(/(?:群聊|群)+$/g, '')
}

function matchScore(values: string[], query: string): number {
  if (values.includes(query)) return 3
  if (values.some((value) => value.startsWith(query))) return 2
  return 1
}

function sortMessages(messages: FormattedMessage[]): FormattedMessage[] {
  return [...messages].sort(
    (left, right) => Number(left.createTime || 0) - Number(right.createTime || 0)
  )
}

function formatLocalTime(unixTime: number): string {
  const date = new Date(unixTime * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function truncateText(value: string, maxLength = 2000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function failure(error: string): Record<string, unknown> {
  return { ok: false, error }
}
