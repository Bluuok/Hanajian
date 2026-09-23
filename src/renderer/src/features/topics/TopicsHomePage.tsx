import React from 'react'
import type { Contact } from '../../../../shared/types'
import type { TopicQuery } from '../../../../shared/topic-digest'
import { parseTopicDateTime } from '../../../../shared/topic-time'
import { useTopicsHomeState, splitList } from './hooks/useTopicsHomeState'
import { useTopicPackage } from './hooks/useTopicPackage'
import { TopicHero } from './components/TopicHero'
import { TopicFilterBar } from './components/TopicFilterBar'
import { TopicSummaryCard } from './components/TopicSummaryCard'
import { TopicEvidenceList } from './components/TopicEvidenceList'
import { TopicSourceMessageCard } from './components/TopicSourceMessageCard'
import { TopicRelatedStrip } from './components/TopicRelatedStrip'
import { TopicEmptyState } from './components/TopicEmptyState'
import { TopicLoadingState } from './components/TopicLoadingState'
import type { TopicSourceLocator } from '../../../../shared/topic-package'
import './styles/topics-home.scss'

export interface TopicsHomePageProps {
  contacts: Contact[]
  onCancelSource?: () => void
  active: boolean
  onOpenChat: (contact: Contact) => Promise<void>
  onOpenSource?: (locator: TopicSourceLocator) => Promise<void> | void
}

export function TopicsHomePage({
  contacts,
  active,
  onOpenChat,
  onOpenSource,
  onCancelSource
}: TopicsHomePageProps): React.ReactElement {
  const [opening, setOpening] = React.useState(false)
  const [chatError, setChatError] = React.useState('')

  const state = useTopicsHomeState(contacts)
  const {
    query,
    setQuery,
    groupId,
    setGroupId,
    selectedGroup,
    groups,
    visibleGroups,
    topic,
    setTopic,
    aliases,
    setAliases,
    excludes,
    setExcludes,
    memberIds,
    setMemberIds,
    start,
    setStart,
    end,
    setEnd,
    dateError,
    setDateError,
    timezone,
    selectedEvidenceId,
    setSelectedEvidenceId,
    evidence,
    setEvidence,
    summaryInvalid,
    setSummaryInvalid,
    toggleEvidence,
    showAdvanced,
    setShowAdvanced,
    showSubscription,
    setShowSubscription,
    name
  } = state

  const pkgManager = useTopicPackage(groupId)
  const {
    status,
    pkg,
    bundle,
    error: pkgError,
    sourceLoading,
    sourceMessage,
    sourceError,
    generate,
    fetchSource,
    loadBundle
  } = pkgManager

  // Sync evidence list ONLY when a new package identity arrives (Defect 1)
  const lastSyncedPackageKeyRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    const pkgKey = pkg ? `${pkg.groupId}:${pkg.topicId}:${pkg.createdAt}` : null
    if (pkg && pkgKey !== lastSyncedPackageKeyRef.current) {
      lastSyncedPackageKeyRef.current = pkgKey
      setEvidence(pkg.evidences)
      setSummaryInvalid(false)
      if (pkg.evidences.length > 0) {
        setSelectedEvidenceId(pkg.evidences[0].id)
      } else {
        setSelectedEvidenceId('')
      }
    } else if (!pkg) {
      lastSyncedPackageKeyRef.current = null
      setEvidence([])
      setSelectedEvidenceId('')
    }
  }, [pkg, setEvidence, setSummaryInvalid, setSelectedEvidenceId])

  const openChat = async (): Promise<void> => {
    if (!selectedGroup || opening) return
    setOpening(true)
    setChatError('')
    try {
      await onOpenChat(selectedGroup)
    } catch {
      setChatError('打开聊天失败，请重试。')
    } finally {
      setOpening(false)
    }
  }

  const handleGenerate = async (forceRefresh = false): Promise<void> => {
    if (!groupId || !topic.trim()) return

    // Date validation (Defect 4)
    const startEpoch = parseTopicDateTime(start)
    const endEpoch = parseTopicDateTime(end)
    if (!Number.isSafeInteger(startEpoch) || !Number.isSafeInteger(endEpoch)) {
      setDateError('请输入有效的开始与结束时间（格式如 2026-09-20 00:00:00）')
      return
    }
    if (startEpoch > endEpoch) {
      setDateError('开始时间不能晚于结束时间，请重新调整时间范围。')
      return
    }
    setDateError('')

    const topicQuery: TopicQuery = {
      groupId,
      topic: topic.trim(),
      aliases: splitList(aliases),
      excludes: splitList(excludes),
      memberIds: splitList(memberIds),
      startTime: startEpoch,
      endTime: endEpoch,
      timezone
    }

    onCancelSource?.()
    await generate(topicQuery, forceRefresh)
  }

  const handleLocateEvidence = (evidenceId: string): void => {
    onCancelSource?.()
    setSelectedEvidenceId(evidenceId)
    const target = evidence.find((e) => e.id === evidenceId)
    if (target) {
      void fetchSource(target.sourceLocator)
    }
  }

  const handleSelectEvidence = (evidenceId: string): void => {
    setSelectedEvidenceId(evidenceId)
    const target = evidence.find((e) => e.id === evidenceId)
    if (target) {
      void fetchSource(target.sourceLocator)
    }
  }

  // Export preserving TopicEvidence schema and dropping claims after edit (Defect 2)
  const handleExport = (): void => {
    if (!bundle) return
    const updatedBundleEvidence = bundle.evidence.map((item) => {
      const matched = evidence.find((e) => e.id === item.id)
      return {
        ...item,
        selected: matched ? matched.selected : item.selected
      }
    })

    const exportBundleData = {
      ...bundle,
      evidence: updatedBundleEvidence,
      claims: summaryInvalid ? [] : bundle.claims,
      review: summaryInvalid ? ('unavailable' as const) : bundle.review,
      warnings: summaryInvalid
        ? [...bundle.warnings, '人工调整了候选消息，原 AI 结论已失效，需重新整理。']
        : bundle.warnings,
      manualReview: summaryInvalid ? 'summary-invalidated' : 'unchanged'
    }

    const blob = new Blob([JSON.stringify(exportBundleData, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `topic-${bundle.query.topic}-${bundle.id}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const selectedEvidence = evidence.find((e) => e.id === selectedEvidenceId)
  const selectedEvidenceIndex = evidence.findIndex((e) => e.id === selectedEvidenceId) + 1
  const canGenerate = Boolean(groupId && topic.trim())

  return (
    <div className="topics-workspace" hidden={!active}>
      {/* Sidebar Groups List */}
      <aside className="topics-groups" aria-label="话题群组">
        <header>
          <div className="topics-groups-header-left">
            <h2>群组</h2>
            <span className="topics-groups-count">{groups.length}</span>
          </div>
        </header>

        <div className="topics-groups-search-box">
          <input
            type="search"
            aria-label="搜索话题群组"
            placeholder="搜索群聊…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="topics-group-list">
          {visibleGroups.map((group) => {
            const isSelected = selectedGroup?.md5 === group.md5
            return (
              <button
                type="button"
                key={group.md5}
                className={`topics-group-item ${isSelected ? 'is-selected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => {
                  onCancelSource?.()
                  setGroupId(group.md5)
                }}
              >
                <span className="topics-avatar">
                  {group.avatar ? <img src={group.avatar} alt="" /> : name(group).slice(0, 1)}
                </span>
                <span className="topics-group-info">
                  <strong>{name(group)}</strong>
                  <small>本机群聊</small>
                </span>
              </button>
            )
          })}

          {visibleGroups.length === 0 && (
            <p className="topics-empty">
              {groups.length ? '没有匹配的群聊' : '连接聊天数据库后，这里会显示你的群聊。'}
            </p>
          )}
        </div>
      </aside>

      {/* Main Topics Content */}
      <section className="topics-main" aria-label="话题首页">
        <TopicHero
          canOpenChat={Boolean(selectedGroup)}
          opening={opening}
          onOpenChat={() => void openChat()}
          error={chatError}
        />

        {selectedGroup ? (
          <>
            <TopicFilterBar
              groupId={selectedGroup.md5}
              topic={topic}
              setTopic={setTopic}
              start={start}
              setStart={setStart}
              end={end}
              setEnd={setEnd}
              dateError={dateError}
              setDateError={setDateError}
              aliases={aliases}
              setAliases={setAliases}
              excludes={excludes}
              setExcludes={setExcludes}
              memberIds={memberIds}
              setMemberIds={setMemberIds}
              timezone={timezone}
              busy={status === 'loading'}
              canGenerate={canGenerate}
              onGenerate={(force) => void handleGenerate(force)}
              showAdvanced={showAdvanced}
              setShowAdvanced={setShowAdvanced}
              showSubscription={showSubscription}
              setShowSubscription={setShowSubscription}
              active={active}
              onLoadBundle={loadBundle}
            />

            {status === 'loading' && <TopicLoadingState topic={topic} />}

            {status === 'error' && (
              <div className="topics-state-container" role="alert">
                <h3>整理失败（{pkgError?.code || 'UNKNOWN'}）</h3>
                <p>{pkgError?.message || '未能成功获取话题数据，请检查网络或重试。'}</p>
                {pkgError?.retryable && (
                  <button
                    type="button"
                    className="topic-retry-button"
                    onClick={() => void handleGenerate(false)}
                  >
                    重试
                  </button>
                )}
              </div>
            )}

            {status === 'empty' && (
              <TopicEmptyState
                variant="no_results"
                topic={topic}
                onRetry={() => void handleGenerate(true)}
              />
            )}

            {status === 'idle' && <TopicEmptyState variant="initial" />}

            {(status === 'success' || status === 'ai_failed') && pkg && (
              <>
                <TopicSummaryCard
                  pkg={pkg}
                  summaryInvalid={summaryInvalid}
                  selectedCount={evidence.filter((item) => item.selected).length}
                  onLocateEvidence={handleLocateEvidence}
                  onExport={handleExport}
                />

                <div className="topic-evidence-grid">
                  <TopicEvidenceList
                    evidence={evidence}
                    selectedEvidenceId={selectedEvidenceId}
                    summaryInvalid={summaryInvalid}
                    review={pkg.review}
                    onToggleEvidence={toggleEvidence}
                    onSelectEvidence={handleSelectEvidence}
                  />

                  <TopicSourceMessageCard
                    selectedEvidence={selectedEvidence}
                    evidenceIndex={selectedEvidenceIndex}
                    sourceMessage={sourceMessage}
                    sourceLoading={sourceLoading}
                    sourceError={sourceError}
                    onFetchSource={() => {
                      if (selectedEvidence) {
                        void fetchSource(selectedEvidence.sourceLocator)
                      }
                    }}
                    onOpenChat={() => void openChat()}
                    onOpenSource={onOpenSource}
                    groupName={name(selectedGroup)}
                  />
                </div>

                <TopicRelatedStrip
                  relatedTopics={pkg.relatedTopics}
                  capabilities={pkg.capabilities}
                  onSelectTopic={(newTopic) => {
                    setTopic(newTopic)
                    void handleGenerate(false)
                  }}
                />
              </>
            )}
          </>
        ) : (
          <TopicEmptyState variant="no_group" />
        )}
      </section>
    </div>
  )
}
