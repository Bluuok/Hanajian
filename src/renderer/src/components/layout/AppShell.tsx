import React from 'react'
import { APP_BRAND } from '../../brand'
import { AccountSummary } from '../account/AccountSummary'
import { PrimaryNavigation } from './PrimaryNavigation'
import { AppPage, PRIMARY_NAV_ITEMS } from './navigation'
import recorder from '../../assets/illustrations/recorder.png'
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
  appearanceTheme = 'system',
  compactMode = false,
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
  React.useEffect(() => {
    document.title = `${APP_BRAND.name} · ${APP_BRAND.englishName}`
    document.documentElement.dataset.theme = appearanceTheme
    return () => {
      delete document.documentElement.dataset.theme
    }
  }, [appearanceTheme])

  const activeItem = PRIMARY_NAV_ITEMS.find((item) => item.id === activePage)

  return (
    <div className={`app-shell theme-${appearanceTheme} ${compactMode ? 'is-compact' : ''}`}>
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
        {activePage === 'ask-ai' && (
          <>
            <button
              type="button"
              className="app-companion-control"
              onClick={toggleCompanion}
              aria-pressed={companionVisible}
            >
              {companionVisible ? '收起静态伙伴' : '显示静态伙伴'}
            </button>
            {companionVisible && (
              <div className="app-companion-dock">
                <img src={recorder} alt="抱着笔记本的记录员" />
              </div>
            )}
          </>
        )}
      </aside>
      <main className="app-shell-main" aria-label={activeItem?.label || '工作区'}>
        {children}
      </main>
    </div>
  )
}
