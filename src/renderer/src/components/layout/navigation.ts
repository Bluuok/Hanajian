export type AppPage = 'ask-ai' | 'report' | 'agent-hub' | 'export' | 'settings'

export interface NavigationItem {
  id: AppPage
  label: string
}

export const PRIMARY_NAV_ITEMS: NavigationItem[] = [
  { id: 'ask-ai', label: '问问 AI' },
  { id: 'report', label: '日报' },
  { id: 'agent-hub', label: 'Clawbot' },
  { id: 'export', label: '导出' },
  { id: 'settings', label: '设置' }
]
