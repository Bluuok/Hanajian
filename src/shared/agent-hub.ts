import type { TopicQuery, TopicBundle } from './topic-digest'
export type AgentHubRuntimeStatus = 'starting' | 'online' | 'offline' | 'error'
export type WechatConnectorStatus =
  | 'checking'
  | 'disconnected'
  | 'starting'
  | 'waiting_scan'
  | 'scanned'
  | 'online'
  | 'error'

export interface AgentHubStatus {
  hub: AgentHubRuntimeStatus
  connector: WechatConnectorStatus
  qrCodeDataUrl?: string
  accountId?: string
  wechatUserId?: string
  error?: string
  updatedAt: number
  dataApi?: 'checking' | 'online' | 'offline'
  databaseReady?: boolean
}

export interface AgentHubActionResult {
  success: boolean
  status: AgentHubStatus
  error?: string
}

export const AGENT_HUB_CUSTOM_INSTRUCTIONS_MAX_LENGTH = 4000

export interface AgentHubPromptSettings {
  customInstructions: string
  maxLength: number
}

export interface AgentHubPromptSettingsResult {
  success: boolean
  settings: AgentHubPromptSettings
  error?: string
}

export interface AgentHubLocalChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentHubLocalAskRequest {
  question: string
  groupId: string
  groupName: string
  history?: AgentHubLocalChatMessage[]
  topicQuery?: TopicQuery
}

export interface AgentHubLocalAskResult {
  success: boolean
  answer?: string
  toolCallCount?: number
  error?: string
  bundle?: TopicBundle
}

export type AgentHubLogSource = 'agent-hub' | 'wechat-connector' | 'system'
export type AgentHubLogLevel = 'info' | 'warn' | 'error'

export interface AgentHubLogEntry {
  id: number
  timestamp: number
  source: AgentHubLogSource
  level: AgentHubLogLevel
  message: string
}
