import { useEffect, useState } from 'react'
import { Switch } from '../../../components/ui'

export type AppearanceTheme = 'system' | 'light' | 'dark'

export function AppearancePage({
  onNotice,
  onAppearanceChange
}: {
  onNotice: (message: string) => void
  onAppearanceChange: (settings: { theme: AppearanceTheme; compactMode: boolean }) => void
}): React.ReactElement {
  const [compactMode, setCompactMode] = useState(false)
  const [showStartupProgress, setShowStartupProgress] = useState(true)

  useEffect(() => {
    let active = true
    void window.api.getSettings().then((result) => {
      if (!active) return
      setCompactMode(result.settings.compactMode)
      setShowStartupProgress(result.settings.showStartupProgress)
      onAppearanceChange({
        theme: 'light',
        compactMode: result.settings.compactMode
      })
    })
    return () => {
      active = false
    }
  }, [onAppearanceChange])

  const save = async (patch: {
    compactMode?: boolean
    showStartupProgress?: boolean
  }): Promise<void> => {
    const result = await window.api.setSettings({ ...patch, appearanceTheme: 'light' })
    setCompactMode(result.settings.compactMode)
    setShowStartupProgress(result.settings.showStartupProgress)
    onAppearanceChange({
      theme: 'light',
      compactMode: result.settings.compactMode
    })
    onNotice('外观设置已保存')
  }

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <div>
          <h1>外观与行为</h1>
          <p>调整工作区的显示方式和启动体验。</p>
        </div>
      </header>
      <div className="settings-page-scroll">
        <div className="settings-page-content">
          <h2 className="settings-section-heading">显示主题</h2>
          <section className="settings-card settings-option-card">
            <div className="settings-theme-info p-3">
              <strong className="block text-sm font-semibold text-[hsl(var(--tm-foreground))]">
                纯白与暖白浅色主题
              </strong>
              <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--tm-muted-foreground))]">
                花笺统一采用低饱和暖白底色与雾蓝、灰粉的水彩纸质风格，固定为浅色模式以保证视觉层次与文字清晰度。
              </p>
            </div>
          </section>

          <h2 className="settings-section-heading">工作区行为</h2>
          <section className="settings-card settings-toggle-list">
            <label className="settings-toggle-row">
              <span>
                <b>紧凑布局</b>
                <small>减少导航栏和列表的留白，适合较小窗口。</small>
              </span>
              <Switch
                checked={compactMode}
                onCheckedChange={(checked) => void save({ compactMode: checked })}
                aria-label="紧凑布局"
              />
            </label>
            <label className="settings-toggle-row">
              <span>
                <b>显示启动进度</b>
                <small>启动或自动连接数据库时显示详细进度。</small>
              </span>
              <Switch
                checked={showStartupProgress}
                onCheckedChange={(checked) => void save({ showStartupProgress: checked })}
                aria-label="显示启动进度"
              />
            </label>
          </section>
        </div>
      </div>
    </div>
  )
}
