import React from 'react'
import type { Contact } from '../../../../../shared/types'
import type { TopicPackage } from '../../../../../shared/topic-package'
import { previousTopicDay, TOPIC_TIMEZONE } from '../../../../../shared/topic-time'

interface GroupViewSnapshot {
  topic: string
  aliases: string
  excludes: string
  memberIds: string
  start: string
  end: string
  dateError: string
  selectedEvidenceId: string
  evidence: TopicPackage['evidences']
  summaryInvalid: boolean
  showAdvanced: boolean
}

export const splitList = (value: string): string[] => [
  ...new Set(
    value
      .split(/[，,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  )
]

export function useTopicsHomeState(
  contacts: Contact[],
  initialGroupId = ''
): {
  query: string
  setQuery: (q: string) => void
  groupId: string
  setGroupId: (id: string) => void
  selectedGroup: Contact | undefined
  groups: Contact[]
  visibleGroups: Contact[]
  topic: string
  setTopic: (t: string) => void
  aliases: string
  setAliases: (a: string) => void
  excludes: string
  setExcludes: (e: string) => void
  memberIds: string
  setMemberIds: (m: string) => void
  start: string
  setStart: (s: string) => void
  end: string
  setEnd: (e: string) => void
  dateError: string
  setDateError: (err: string) => void
  timezone: string
  selectedEvidenceId: string
  setSelectedEvidenceId: (id: string) => void
  evidence: TopicPackage['evidences']
  setEvidence: React.Dispatch<React.SetStateAction<TopicPackage['evidences']>>
  summaryInvalid: boolean
  setSummaryInvalid: (inv: boolean) => void
  toggleEvidence: (id: string) => void
  showAdvanced: boolean
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>
  showSubscription: boolean
  setShowSubscription: React.Dispatch<React.SetStateAction<boolean>>
  name: (c: Contact) => string
} {
  const initialRange = React.useMemo(() => previousTopicDay(), [])
  const [query, setQuery] = React.useState('')

  const groups = React.useMemo(
    () =>
      contacts.filter((item) => item.type === 'group' || item.m_nsUsrName.endsWith('@chatroom')),
    [contacts]
  )

  const [groupId, setGroupIdInternal] = React.useState(() => initialGroupId || groups[0]?.md5 || '')

  React.useEffect(() => {
    if (initialGroupId) {
      setGroupIdInternal(initialGroupId)
    } else if (!groupId && groups.length > 0) {
      setGroupIdInternal(groups[0].md5)
    }
  }, [initialGroupId, groups, groupId])

  const selectedGroup = React.useMemo(
    () => (groupId ? groups.find((item) => item.md5 === groupId) : undefined),
    [groups, groupId]
  )

  const [topic, setTopic] = React.useState('craft')
  const [aliases, setAliases] = React.useState('')
  const [excludes, setExcludes] = React.useState('')
  const [memberIds, setMemberIds] = React.useState('')
  const [start, setStartInternal] = React.useState(initialRange.start)
  const [end, setEndInternal] = React.useState(initialRange.end)
  const [dateError, setDateError] = React.useState('')
  const timezone = TOPIC_TIMEZONE

  const setStart = React.useCallback((val: string) => {
    setStartInternal(val)
    setDateError('')
  }, [])

  const setEnd = React.useCallback((val: string) => {
    setEndInternal(val)
    setDateError('')
  }, [])

  const [selectedEvidenceId, setSelectedEvidenceId] = React.useState('')
  const [evidence, setEvidence] = React.useState<TopicPackage['evidences']>([])
  const [summaryInvalid, setSummaryInvalid] = React.useState(false)
  const [showAdvanced, setShowAdvanced] = React.useState(false)
  const [showSubscription, setShowSubscription] = React.useState(false)
  const groupSnapshotsRef = React.useRef(new Map<string, GroupViewSnapshot>())

  const setGroupId = (nextGroupId: string): void => {
    if (nextGroupId === groupId) return
    if (groupId) {
      groupSnapshotsRef.current.set(groupId, {
        topic,
        aliases,
        excludes,
        memberIds,
        start,
        end,
        dateError,
        selectedEvidenceId,
        evidence,
        summaryInvalid,
        showAdvanced
      })
    }
    const restored = groupSnapshotsRef.current.get(nextGroupId)
    setTopic(restored?.topic ?? 'craft')
    setAliases(restored?.aliases ?? '')
    setExcludes(restored?.excludes ?? '')
    setMemberIds(restored?.memberIds ?? '')
    setStartInternal(restored?.start ?? initialRange.start)
    setEndInternal(restored?.end ?? initialRange.end)
    setDateError(restored?.dateError ?? '')
    setSelectedEvidenceId(restored?.selectedEvidenceId ?? '')
    setEvidence(restored?.evidence ?? [])
    setSummaryInvalid(restored?.summaryInvalid ?? false)
    setShowAdvanced(restored?.showAdvanced ?? false)
    setShowSubscription(false)
    setGroupIdInternal(nextGroupId)
  }

  const name = React.useCallback(
    (item: Contact): string => item.m_nsNickName || item.remark || item.m_nsUsrName,
    []
  )

  const visibleGroups = React.useMemo(
    () => groups.filter((item) => name(item).toLowerCase().includes(query.trim().toLowerCase())),
    [groups, query, name]
  )

  const toggleEvidence = React.useCallback((id: string) => {
    setEvidence((current) =>
      current.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    )
    setSummaryInvalid(true)
  }, [])

  return {
    query,
    setQuery,
    groupId: selectedGroup ? selectedGroup.md5 : '',
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
  }
}
