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
import recorderScene from '../../assets/hanajian/hero/topic-recorder-scene.png'
import booksCorner from '../../assets/hanajian/decor/books-corner.png'
import starsSvg from '../../assets/decor/stars.svg'
import paperclipSvg from '../../assets/decor/paperclip.svg'
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
  const topicInputRef = React.useRef<HTMLInputElement>(null)
  const mainScrollRef = React.useRef<HTMLElement>(null)
  const groupPositionsRef = React.useRef(
    new Map<string, { main: number; evidence: number; hadResult: boolean }>()
  )
  const pendingPositionGroupRef = React.useRef<string | null>(null)

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
  const lastSyncedPackageKeyRef = React.useRef(new Map<string, string>())
  React.useEffect(() => {
    const pkgKey = pkg ? `${pkg.groupId}:${pkg.topicId}:${pkg.createdAt}` : null
    if (pkg && pkg.groupId === groupId && pkgKey !== lastSyncedPackageKeyRef.current.get(groupId)) {
      lastSyncedPackageKeyRef.current.set(groupId, pkgKey!)
      setEvidence(pkg.evidences)
      setSummaryInvalid(false)
      if (pkg.evidences.length > 0) {
        setSelectedEvidenceId(pkg.evidences[0].id)
      } else {
        setSelectedEvidenceId('')
      }
    }
  }, [groupId, pkg, setEvidence, setSummaryInvalid, setSelectedEvidenceId])

  React.useLayoutEffect(() => {
    if (pendingPositionGroupRef.current !== groupId) return
    if (pkg && pkg.groupId !== groupId) return
    const saved = groupPositionsRef.current.get(groupId)
    if (saved?.hadResult && !pkg) return
    const main = mainScrollRef.current
    if (!main) return
    main.scrollTop = saved?.main ?? 0
    const evidenceList = main.querySelector<HTMLElement>('.topic-evidence-items')
    if (evidenceList) evidenceList.scrollTop = saved?.evidence ?? 0
    pendingPositionGroupRef.current = null
  }, [groupId, pkg, status])

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

  const handleGenerate = async (forceRefresh = false, topicOverride?: string): Promise<void> => {
    const nextTopic = (topicOverride ?? topic).trim()
    if (!groupId || !nextTopic) return

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
      topic: nextTopic,
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
                  if (group.md5 === groupId) return
                  const main = mainScrollRef.current
                  if (main && groupId) {
                    groupPositionsRef.current.set(groupId, {
                      main: main.scrollTop,
                      evidence:
                        main.querySelector<HTMLElement>('.topic-evidence-items')?.scrollTop ?? 0,
                      hadResult: pkg?.groupId === groupId
                    })
                  }
                  pendingPositionGroupRef.current = group.md5
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
        <img className="topics-groups-books" src={booksCorner} alt="" aria-hidden="true" />
      </aside>

      {/* Main Topics Content */}
      <section ref={mainScrollRef} className="topics-main" aria-label="话题首页">
        <div
          className={`topic-intro-stage ${
            (status === 'success' || status === 'ai_failed') && pkg ? 'has-result' : 'is-pending'
          }`}
        >
          <TopicHero error={chatError} />
          {selectedGroup && (
            <TopicFilterBar
              topicInputRef={topicInputRef}
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
          )}
          {(status === 'success' || status === 'ai_failed') && pkg && (
            <TopicSummaryCard
              pkg={pkg}
              summaryInvalid={summaryInvalid}
              selectedCount={evidence.filter((item) => item.selected).length}
              onLocateEvidence={handleLocateEvidence}
              onExport={handleExport}
            />
          )}
          <img className="topic-intro-artwork" src={recorderScene} alt="" aria-hidden="true" />
          <span className="topic-intro-stamp" aria-hidden="true">
            把讨论
            <br />
            轻轻收好
          </span>
          <img className="topic-intro-star" src={starsSvg} alt="" aria-hidden="true" />
          <img className="topic-intro-paperclip" src={paperclipSvg} alt="" aria-hidden="true" />
        </div>

        {selectedGroup ? (
          <>
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
                  onExplore={() => {
                    topicInputRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
                    topicInputRef.current?.focus()
                  }}
                  onSelectTopic={(newTopic) => {
                    setTopic(newTopic)
                    void handleGenerate(false, newTopic)
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
