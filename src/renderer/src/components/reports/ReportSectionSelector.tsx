import React from 'react'

const SECTIONS = [
  '今日话题',
  '重要消息',
  '问题与解答',
  '实用资源',
  '精彩对话',
  '活跃成员',
  '活跃时间分布',
  '关键词'
]

export function ReportSectionSelector(): React.ReactElement {
  return (
    <section className="report-config-section">
      <div className="report-section-heading">
        <h3>日报内容</h3>
        <span>当前模板固定生成以下内容</span>
      </div>
      <div className="report-readonly-modules" aria-label="当前模板固定生成以下内容">
        {SECTIONS.map((label) => (
          <span key={label}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <rect x="7" y="10" width="10" height="8" rx="1.5" />
              <path d="M9 10V7.5a3 3 0 0 1 6 0V10" />
            </svg>
            {label}
          </span>
        ))}
      </div>
    </section>
  )
}
