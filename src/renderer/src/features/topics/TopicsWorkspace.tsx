import React from 'react'
import type { Contact } from '../../../../shared/types'
import { TopicPanel } from '../ask-ai/TopicPanel'
import recorder from '../../assets/illustrations/recorder.png'
import './topics.scss'

interface TopicsWorkspaceProps {
  contacts: Contact[]
  active: boolean
  onOpenChat: (contact: Contact) => Promise<void>
}

export function TopicsWorkspace({
  contacts,
  active,
  onOpenChat
}: TopicsWorkspaceProps): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const [groupId, setGroupId] = React.useState('')
  const [opening, setOpening] = React.useState(false)
  const [error, setError] = React.useState('')
  const groups = contacts.filter(
    (item) => item.type === 'group' || item.m_nsUsrName.endsWith('@chatroom')
  )
  const selected = groups.find((item) => item.md5 === groupId) || groups[0]
  const name = (item: Contact): string => item.m_nsNickName || item.remark || item.m_nsUsrName
  const visible = groups.filter((item) =>
    name(item).toLowerCase().includes(query.trim().toLowerCase())
  )
  const openChat = async (): Promise<void> => {
    if (!selected || opening) return
    setOpening(true)
    setError('')
    try {
      await onOpenChat(selected)
    } catch {
      setError('打开聊天失败，请重试。')
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="topics-workspace" hidden={!active}>
      <aside className="topics-groups" aria-label="话题群组">
        <header>
          <h2>群组</h2>
          <span>{groups.length}</span>
        </header>
        <input
          type="search"
          aria-label="搜索话题群组"
          placeholder="寻找一个群聊…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="topics-group-list">
          {visible.map((group) => (
            <button
              type="button"
              key={group.md5}
              aria-pressed={selected?.md5 === group.md5}
              onClick={() => setGroupId(group.md5)}
            >
              <span className="topics-avatar">
                {group.avatar ? <img src={group.avatar} alt="" /> : name(group).slice(0, 1)}
              </span>
              <span>
                <strong>{name(group)}</strong>
                <small>整理群里的有趣讨论</small>
              </span>
            </button>
          ))}
          {!visible.length && (
            <p className="topics-empty">
              {groups.length ? '没有匹配的群聊' : '连接聊天数据库后，这里会显示你的群聊。'}
            </p>
          )}
        </div>
      </aside>
      <section className="topics-main" aria-label="话题首页">
        <header className="topics-hero">
          <div className="topics-hero-copy">
            <span className="topics-eyebrow">把聊天里的灵感，认真收藏</span>
            <h1>
              <span aria-hidden="true">▱</span> 话题整理
            </h1>
            <p>从群聊中捡起有价值的讨论，让重要信息不再被淹没。</p>
            <button type="button" disabled={!selected || opening} onClick={() => void openChat()}>
              {opening ? '正在打开…' : '进入聊天 →'}
            </button>
            {error && <p role="alert">{error}</p>}
          </div>
          <img className="topics-hero-art" src={recorder} alt="" aria-hidden="true" />
        </header>
        {selected ? (
          <TopicPanel
            key={selected.md5}
            groupId={selected.md5}
            groupName={name(selected)}
            active={active}
            variant="workspace"
            onClose={() => void openChat()}
          />
        ) : (
          <div className="topics-empty">
            <h2>从一个群聊开始</h2>
            <p>选好群聊与话题后，生成摘要并逐条核对来源。</p>
          </div>
        )}
      </section>
    </div>
  )
}
