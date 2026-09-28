import React from 'react'
import { CheckCircleIcon, HomeIcon } from './icons'

interface DataTrustBarProps {
  messageCount: number
}

export function DataTrustBar({ messageCount }: DataTrustBarProps): React.ReactElement {
  return (
    <div className="data-trust-bar">
      <div className="data-trust-left">
        <HomeIcon />
        <span>聊天记录仅在本机读取</span>
      </div>
      <div className="data-trust-right">
        <span className="data-trust-item">
          <CheckCircleIcon />
          数据库已连接
        </span>
        <span className="data-trust-dot" aria-hidden />
        <span>已加载 {messageCount} 条消息</span>
      </div>
    </div>
  )
}
