import React from 'react'

export function EmptyConversationState(): React.ReactElement {
  return (
    <div className="chat-window empty">
      <div className="empty-conversation-state">
        <h2>选择一条消息</h2>
        <p>从左侧选择群聊或联系人以浏览历史记录</p>
      </div>
    </div>
  )
}
