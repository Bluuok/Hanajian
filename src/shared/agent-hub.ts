import type { TopicQuery, TopicBundle } from './topic-digest'
import type { AgentMemoryDraft, AgentMemoryExtractionOptions } from './agent-memory'

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
  memoryExtraction?: AgentMemoryExtractionOptions
}

export interface AgentHubLocalAskResult {
  success: boolean
  answer?: string
  toolCallCount?: number
  bundle?: TopicBundle
  memoryDraft?: AgentMemoryDraft
  error?: string
}

export type AgentHubLogSource = 'agent-hub' | 'system'
export type AgentHubLogLevel = 'info' | 'warn' | 'error'

export interface AgentHubLogEntry {
  id: number
  timestamp: number
  source: AgentHubLogSource
  level: AgentHubLogLevel
  message: string
}
