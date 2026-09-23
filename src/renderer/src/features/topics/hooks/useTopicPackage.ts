import React from 'react'
import { projectTopicPackage } from '../../../../../shared/topic-package'
import type { TopicQuery, TopicBundle } from '../../../../../shared/topic-digest'
import type {
  TopicPackage,
  TopicError,
  TopicSourceLocator,
  TopicSourceMessage
} from '../../../../../shared/topic-package'

export type TopicStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'ai_failed'

export function useTopicPackage(groupId: string): {
  status: TopicStatus
  pkg: TopicPackage | null
  bundle: TopicBundle | null
  fromCache: boolean
  error: TopicError | null
  sourceLoading: boolean
  sourceMessage: TopicSourceMessage | null
  sourceError: TopicError | null
  activeLocator: TopicSourceLocator | null
  generate: (query: TopicQuery, forceRefresh?: boolean) => Promise<boolean>
  fetchSource: (locator: TopicSourceLocator) => Promise<void>
  loadBundle: (bundle: TopicBundle) => void
  clearSource: () => void
  reset: () => void
} {
  const [status, setStatus] = React.useState<TopicStatus>('idle')
  const [pkg, setPkg] = React.useState<TopicPackage | null>(null)
  const [bundle, setBundle] = React.useState<TopicBundle | null>(null)
  const [fromCache, setFromCache] = React.useState(false)
  const [error, setError] = React.useState<TopicError | null>(null)

  const [sourceLoading, setSourceLoading] = React.useState(false)
  const [sourceMessage, setSourceMessage] = React.useState<TopicSourceMessage | null>(null)
  const [sourceError, setSourceError] = React.useState<TopicError | null>(null)
  const [activeLocator, setActiveLocator] = React.useState<TopicSourceLocator | null>(null)

  // Request sequencing refs to prevent race conditions & stale responses
  const generateSeqRef = React.useRef(0)
  const sourceSeqRef = React.useRef(0)
  const currentGroupRef = React.useRef(groupId)

  const clearSource = React.useCallback(() => {
    sourceSeqRef.current += 1
    setActiveLocator(null)
    setSourceMessage(null)
    setSourceError(null)
    setSourceLoading(false)
  }, [])

  // When group changes, invalidate any in-flight requests and clear group-specific state
  React.useEffect(() => {
    if (currentGroupRef.current !== groupId) {
      currentGroupRef.current = groupId
      generateSeqRef.current += 1
      sourceSeqRef.current += 1
      setStatus('idle')
      setPkg(null)
      setBundle(null)
      setError(null)
      setSourceMessage(null)
      setSourceError(null)
      setActiveLocator(null)
      setSourceLoading(false)
    }
  }, [groupId])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      generateSeqRef.current += 1
      sourceSeqRef.current += 1
    }
  }, [])

  const generate = React.useCallback(
    async (query: TopicQuery, forceRefresh = false): Promise<boolean> => {
      const seq = ++generateSeqRef.current
      // Invalidate any in-flight source requests and reset source display on generation start
      sourceSeqRef.current += 1
      setSourceMessage(null)
      setSourceError(null)
      setSourceLoading(false)
      setActiveLocator(null)

      setStatus('loading')
      setError(null)

      try {
        const result = await window.api.generateTopicPackage({ query, forceRefresh })

        // Check if request is still current and group hasn't changed
        if (seq !== generateSeqRef.current || currentGroupRef.current !== query.groupId) {
          return false
        }

        if (!result.success) {
          setError(result.error)
          setStatus('error')
          return false
        }

        setPkg(result.package)
        setBundle(result.bundle)
        setFromCache(result.fromCache)

        // Check for empty or AI failed states
        if (
          result.package.notices.some((n) => n.code === 'AI_FAILED') ||
          result.package.review === 'unavailable'
        ) {
          setStatus('ai_failed')
        } else if (result.package.evidences.length === 0) {
          setStatus('empty')
        } else {
          setStatus('success')
        }
        return true
      } catch (cause) {
        if (seq !== generateSeqRef.current) return false
        setError({
          code: 'DEPENDENCY_FAILED',
          message: cause instanceof Error ? cause.message : '话题生成失败，请重试',
          retryable: true
        })
        setStatus('error')
        return false
      }
    },
    []
  )

  const fetchSource = React.useCallback(async (locator: TopicSourceLocator): Promise<void> => {
    const seq = ++sourceSeqRef.current
    setActiveLocator(locator)
    setSourceLoading(true)
    setSourceError(null)

    try {
      const result = await window.api.locateTopicSource(locator)

      if (seq !== sourceSeqRef.current || currentGroupRef.current !== locator.groupId) {
        return
      }

      if (result.success) {
        setSourceMessage(result.message)
      } else {
        setSourceError(result.error)
        setSourceMessage(null)
      }
    } catch (cause) {
      if (seq !== sourceSeqRef.current) return
      setSourceError({
        code: 'DEPENDENCY_FAILED',
        message: cause instanceof Error ? cause.message : '原文加载失败',
        retryable: true
      })
      setSourceMessage(null)
    } finally {
      if (seq === sourceSeqRef.current) {
        setSourceLoading(false)
      }
    }
  }, [])

  const loadBundle = React.useCallback(
    (loadedBundle: TopicBundle): void => {
      if (loadedBundle.query.groupId !== currentGroupRef.current) return
      generateSeqRef.current += 1
      sourceSeqRef.current += 1
      setBundle(loadedBundle)
      const isAiFailed = loadedBundle.review === 'unavailable'
      setPkg(projectTopicPackage(loadedBundle))
      setFromCache(true)
      clearSource()
      if (isAiFailed) {
        setStatus('ai_failed')
      } else if (loadedBundle.evidence.length === 0) {
        setStatus('empty')
      } else {
        setStatus('success')
      }
    },
    [clearSource]
  )

  const reset = React.useCallback(() => {
    generateSeqRef.current += 1
    sourceSeqRef.current += 1
    setStatus('idle')
    setPkg(null)
    setBundle(null)
    setError(null)
    clearSource()
  }, [clearSource])

  return {
    status,
    pkg,
    bundle,
    fromCache,
    error,
    sourceLoading,
    sourceMessage,
    sourceError,
    activeLocator,
    generate,
    fetchSource,
    loadBundle,
    clearSource,
    reset
  }
}
