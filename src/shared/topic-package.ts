import type { TopicBundle, TopicClaim, TopicDiagnostic, TopicQuery } from './topic-digest'

export type TopicErrorCode =
  | 'INVALID_INPUT'
  | 'DATA_UNAVAILABLE'
  | 'DEPENDENCY_FAILED'
  | 'AI_FAILED'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_AMBIGUOUS'
  | 'SOURCE_RANGE_TOO_LARGE'

export interface TopicError {
  code: TopicErrorCode
  message: string
  retryable: boolean
}

export interface TopicSourceLocator {
  groupId: string
  messageId?: string
  /** Unix seconds, not a local wall-clock string. */
  timestamp?: number
}

export interface TopicSourceMessage {
  id: string
  groupId: string
  senderId?: string
  senderName: string
  sentAt: number
  content: string
  type: string
}

export interface TopicPackage {
  topicId: string
  topic: string
  groupId: string
  groupName: string
  createdAt: number
  dateRange: { start: number; end: number; timezone: string; inclusive: true }
  summary: {
    title: string
    abstract: string
    category?: string
    tags: string[]
    evidenceCount: number
    claims: TopicClaim[]
  }
  evidences: Array<{
    id: string
    senderId?: string
    senderName: string
    senderAvatarUrl?: string
    sentAt: number
    excerpt: string
    selected: boolean
    reason: string
    sourceLocator: TopicSourceLocator
  }>
  relatedTopics: Array<{
    id: string
    title: string
    evidenceCount: number
    relationReason?: string
  }>
  capabilities: { relatedTopics: false; categories: false; tags: false }
  review: TopicBundle['review']
  scannedCount: number
  complete: boolean
  warnings: string[]
  diagnostics?: TopicDiagnostic[]
  notices: TopicError[]
}

export type TopicPackageResult =
  | { success: true; package: TopicPackage; bundle: TopicBundle; fromCache: boolean }
  | { success: false; error: TopicError }

export type TopicSourceResult =
  | { success: true; message: TopicSourceMessage }
  | { success: false; error: TopicError }

export interface TopicPackageRequest {
  query: TopicQuery
  forceRefresh?: boolean
}

/** Only the backend projects verified claims. Missing metadata stays explicitly unavailable. */
export function projectTopicPackage(bundle: TopicBundle): TopicPackage {
  const claims = bundle.review === 'verified' ? bundle.claims : []
  return {
    topicId: bundle.id,
    topic: bundle.query.topic,
    groupId: bundle.query.groupId,
    groupName: bundle.groupName,
    createdAt: bundle.createdAt,
    dateRange: {
      start: bundle.query.startTime,
      end: bundle.query.endTime,
      timezone: bundle.query.timezone,
      inclusive: true
    },
    summary: {
      title: bundle.query.topic,
      abstract: claims.map((claim) => claim.text).join('\n'),
      tags: [],
      evidenceCount: bundle.evidence.filter((item) => item.selected).length,
      claims
    },
    evidences: bundle.evidence.map((item) => ({
      id: item.id,
      senderId: item.senderId,
      senderName: item.sender,
      sentAt: item.timestamp,
      excerpt: item.text,
      selected: item.selected,
      reason: item.reason,
      sourceLocator: {
        groupId: bundle.query.groupId,
        messageId: item.messageId,
        timestamp: item.timestamp
      }
    })),
    relatedTopics: [],
    capabilities: { relatedTopics: false, categories: false, tags: false },
    review: bundle.review,
    scannedCount: bundle.scannedCount,
    complete: bundle.complete,
    warnings: [...bundle.warnings],
    diagnostics: (bundle.diagnostics || []).map((item) => ({ ...item })),
    notices:
      bundle.review === 'unavailable'
        ? [
            {
              code: 'AI_FAILED',
              message: '摘要尚未通过 AI 核对，以下仅为候选原文。',
              retryable: true
            }
          ]
        : []
  }
}
