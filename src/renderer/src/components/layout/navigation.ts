export type AppPage =
  | 'topics'
  | 'ask-ai'
  | 'report'
  | 'ai-assistant-settings'
  | 'platform-integration'
  | 'export'
  | 'settings'

export interface NavigationItem {
  id: AppPage
  label: string
}

export const PRIMARY_NAV_ITEMS: NavigationItem[] = [
  { id: 'topics', label: '话题整理' },
  { id: 'ask-ai', label: '问问 AI' },
  { id: 'platform-integration', label: '内容收藏' },
  { id: 'report', label: '日报' },
  { id: 'ai-assistant-settings', label: '助手设置' },
  { id: 'export', label: '导出' },
  { id: 'settings', label: '设置' }
]
