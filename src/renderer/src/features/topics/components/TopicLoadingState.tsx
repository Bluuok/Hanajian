import React from 'react'

interface TopicLoadingStateProps {
  topic: string
}

export function TopicLoadingState({ topic }: TopicLoadingStateProps): React.ReactElement {
  return (
    <div className="topics-state-container is-loading" aria-label="正在整理话题" role="status">
      <div className="state-spinner" aria-hidden="true" />
      <h3>正在整理「{topic}」…</h3>
      <p>正在读取本地消息记录、筛选关键候选讨论并生成结构化证据。</p>
    </div>
  )
}
