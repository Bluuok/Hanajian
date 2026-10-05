export const AGENT_MEMORY_FOCUS_MAX_LENGTH = 1600
export const AGENT_MEMORY_STYLE_MAX_LENGTH = 800

export interface AgentMemoryExtractionOptions {
  enabled: boolean
  focus: string
  writingStyle?: string
  /** Uses the default template when omitted; reserved for additional formats. */
  formatId?: string
}

export interface AgentMemorySourceMessage {
  id: string
  unixTime?: number
  time: string
  sender: string
  type: string
  text: string
}

export interface AgentMemoryDraft {
  id: string
  success: boolean
  title: string
  markdown: string
  groupId: string
  groupName: string
  focus: string
  writingStyle?: string
  generatedAt: number
  sourceMessageCount: number
  formatId?: string
  /** Distinct source messages cited by retained content. */
  selectedMessageCount?: number
  /** Legacy history compatibility; new drafts mirror selectedMessageCount. */
  professionalMessageCount: number
  excludedMessageCount: number
  warning?: string
  error?: string
}

export interface AgentMemoryWriteRequest {
  draft: AgentMemoryDraft
  outputDirectory: string
}

export interface AgentMemoryWriteResult {
  success: boolean
  path?: string
  error?: string
}
