import React from 'react'
import { APP_BRAND } from '../../brand'
import { AccountSummary } from '../account/AccountSummary'
import { PrimaryNavigation } from './PrimaryNavigation'
import { AppPage, PRIMARY_NAV_ITEMS } from './navigation'
import { GazeCompanion } from '../../features/companion/GazeCompanion'
import brandIcon from '../../assets/brand-icon.svg'

interface SelfInfo {
  wxid: string
  nickname: string
  avatar?: string
  accountRoot: string
}

interface AppShellProps {
  activePage: AppPage
  selfInfo: SelfInfo | null
  dbReady: boolean
  dbConnecting?: boolean
  onPageChange: (page: AppPage) => void
  onOpenSettings: () => void
  onOpenGuide: () => void
  appearanceTheme?: 'system' | 'light' | 'dark'
  compactMode?: boolean
  imageKeyNotice?: 'missing' | 'error'
  onOpenImageKeySettings?: () => void
  onDismissImageKeyNotice?: () => void
  children: React.ReactNode
}

function BrandLogo(): React.ReactElement {
  return (
    <div className="app-brand" title={APP_BRAND.englishName} aria-label={APP_BRAND.name}>
      <img src={brandIcon} alt="" aria-hidden="true" />
      <span className="app-brand-copy">
        <strong>
          {APP_BRAND.name} <em>{APP_BRAND.englishName}</em>
        </strong>
        <small>{APP_BRAND.tagline}</small>
      </span>
    </div>
  )
}

export function AppShell({
  activePage,
  selfInfo,
  dbReady,
  dbConnecting = false,
  onPageChange,
  onOpenSettings,
  onOpenGuide,
  compactMode = false,
  imageKeyNotice,
  onOpenImageKeySettings,
  onDismissImageKeyNotice,
  children
}: AppShellProps): React.ReactElement {
  const [companionVisible, setCompanionVisible] = React.useState(() => {
    try {
      return localStorage.getItem('shiyu_companion_visible') !== 'false'
    } catch {
      return true
    }
  })
  const toggleCompanion = (): void => {
    const next = !companionVisible
    setCompanionVisible(next)
    try {
      localStorage.setItem('shiyu_companion_visible', String(next))
    } catch {
      /* optional preference */
    }
  }

  // Enforce light theme constant across all app states (white-only policy)
  const effectiveTheme = 'light'
  React.useEffect(() => {
    document.title = `${APP_BRAND.name} · ${APP_BRAND.englishName}`
    document.documentElement.dataset.theme = effectiveTheme
  }, [])

  const activeItem = PRIMARY_NAV_ITEMS.find((item) => item.id === activePage)

  return (
    <div className={`app-shell theme-${effectiveTheme} ${compactMode ? 'is-compact' : ''}`}>
      <aside className="app-primary-rail">
        <BrandLogo />
        <PrimaryNavigation activePage={activePage} onPageChange={onPageChange} />
        <button
          type="button"
          className="app-guide-launcher"
          onClick={onOpenGuide}
          title="重新打开新手引导"
        >
          <span className="app-guide-launcher-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 3 14.2 9.8 21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z" />
            </svg>
          </span>
          <span className="app-guide-launcher-label">新手引导</span>
        </button>
        <div className="app-rail-account">
          <AccountSummary
            selfInfo={selfInfo}
            dbReady={dbReady}
            dbConnecting={dbConnecting}
            compact
            onClick={onOpenSettings}
          />
        </div>
        <button
          type="button"
          className="app-companion-control"
          onClick={toggleCompanion}
          aria-pressed={companionVisible}
        >
          {companionVisible ? '收起伙伴' : '显示伙伴'}
        </button>
        {companionVisible && <GazeCompanion />}
      </aside>
      <main className="app-shell-main" aria-label={activeItem?.label || '工作区'}>
        {children}
        {imageKeyNotice && (
          <aside className="app-image-key-notice" role="status" aria-label="图片解密提醒">
            <strong>
              {imageKeyNotice === 'missing' ? '聊天图片尚未配置密钥' : '暂时无法检查图片密钥'}
            </strong>
            <p>
              {imageKeyNotice === 'missing'
                ? '聊天记录已连接。查看加密图片还需为当前微信账号配置图片密钥。'
                : '聊天记录已连接，请到图片解密设置检查当前账号的图片能力。'}
            </p>
            <p>在「设置 → 图片解密」按提示自动获取、验证并保存；不支持自动获取时可手动配置。</p>
            <div className="app-image-key-notice-actions">
              <button type="button" onClick={onOpenImageKeySettings}>
                去配置图片
              </button>
              <button type="button" onClick={onDismissImageKeyNotice}>
                稍后
              </button>
            </div>
          </aside>
        )}
      </main>
    </div>
  )
}
