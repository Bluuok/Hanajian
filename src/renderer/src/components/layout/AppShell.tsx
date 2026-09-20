import React from 'react'
import { AccountSummary } from '../account/AccountSummary'
import { PrimaryNavigation } from './PrimaryNavigation'
import { AppPage, PRIMARY_NAV_ITEMS } from './navigation'
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
    <div className="app-brand" title="TraceDigest" aria-label="TraceDigest">
      <img src={brandIcon} alt="" aria-hidden="true" />
    </div>
  )
}

function CompanionDoll(): React.ReactElement {
  const companionRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const root = companionRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    let frame = 0

    const reset = (): void => {
      root.style.setProperty('--companion-head-x', '0px')
      root.style.setProperty('--companion-head-y', '0px')
      root.style.setProperty('--companion-head-rotate', '0deg')
      root.style.setProperty('--companion-pupil-x', '0px')
      root.style.setProperty('--companion-pupil-y', '0px')
    }

    const move = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') {
        return
      }

      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const rect = root.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const normalizedX = Math.max(-1, Math.min(1, (event.clientX - centerX) / (rect.width / 2)))
        const normalizedY = Math.max(-1, Math.min(1, (event.clientY - centerY) / (rect.height / 2)))

        root.style.setProperty('--companion-head-x', `${(normalizedX * 3.2).toFixed(2)}px`)
        root.style.setProperty('--companion-head-y', `${(normalizedY * 2.4).toFixed(2)}px`)
        root.style.setProperty('--companion-head-rotate', `${(normalizedX * 4).toFixed(2)}deg`)
        root.style.setProperty('--companion-pupil-x', `${(normalizedX * 2.1).toFixed(2)}px`)
        root.style.setProperty('--companion-pupil-y', `${(normalizedY * 1.7).toFixed(2)}px`)
      })
    }

    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('blur', reset)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('blur', reset)
    }
  }, [])

  return (
    <div
      ref={companionRef}
      className="app-companion"
      aria-hidden="true"
      data-testid="app-companion"
    >
      <svg className="app-companion-art" viewBox="0 0 120 150" focusable="false">
        <ellipse className="app-companion-shadow" cx="60" cy="145" rx="28" ry="4" />
        <g className="app-companion-body">
          <path className="app-companion-leg" d="M49 103c-1 10-3 18-7 28l8 2c5-10 8-18 10-28Z" />
          <path className="app-companion-leg" d="M68 104c0 10 2 18 6 27l8-2c-3-11-4-19-4-28Z" />
          <path className="app-companion-sock" d="m40 127 10 3-3 8-11-3Z" />
          <path className="app-companion-sock" d="m74 128 9-2 3 8-10 3Z" />
          <path className="app-companion-shoe" d="M35 135c4-4 10-4 15 0l3 7c-5 4-15 3-20-1Z" />
          <path className="app-companion-shoe" d="M74 136c5-3 11-2 15 2l1 5c-6 3-15 2-20-2Z" />
          <path className="app-companion-skirt" d="M38 85c7-3 37-3 44 0l8 25c-15 7-45 7-60 0Z" />
          <path className="app-companion-pleat" d="m48 86 3 23M60 85v26M71 86l-3 24M81 88l-8 21" />
          <path className="app-companion-blouse" d="M44 61c8-4 24-4 32 0l7 28c-12 5-33 5-46 0Z" />
          <path className="app-companion-cardigan" d="M43 62c-7 1-13 7-16 17l8 15 9-5 3-17Z" />
          <path className="app-companion-cardigan" d="M77 62c7 1 13 7 16 17l-8 15-9-5-3-17Z" />
          <path className="app-companion-cardigan" d="M42 60c-2 9-2 29 2 36l10-4-3-32Z" />
          <path className="app-companion-cardigan" d="M78 60c2 9 2 29-2 36l-10-4 3-32Z" />
          <path className="app-companion-collar" d="m48 61 12 9 12-9 4 6-16 9-16-9Z" />
          <path className="app-companion-bow" d="m55 69-9-3-3 5 10 4m14-6 9-3 3 5-10 4m-7-5v9" />
          <path className="app-companion-arm" d="M35 78c5 5 10 8 16 10l-3 7c-8-2-14-7-19-13Z" />
          <path className="app-companion-arm" d="M85 77c-3 3-5 7-7 12l7 3c4-6 6-10 7-15Z" />
          <path className="app-companion-notebook" d="m43 76 16 7-5 17-16-7Z" />
          <path className="app-companion-notebook-line" d="m44 80 12 5m-13-1 11 5m-12-1 10 5" />
        </g>
        <g className="app-companion-head">
          <path
            className="app-companion-hair-back"
            d="M25 43c-5-17 6-32 22-36 19-5 39 4 46 20 6 14 2 31-9 40l-9-7H42l-10 8c-7-6-6-16-7-25Z"
          />
          <path
            className="app-companion-face"
            d="M34 34c0-13 10-22 26-22s26 9 26 22v14c0 14-11 24-26 24S34 62 34 48Z"
          />
          <path
            className="app-companion-ear"
            d="M34 42c-6-2-8 3-5 8 2 3 5 3 7 2m48-10c6-2 8 3 5 8-2 3-5 3-7 2"
          />
          <path
            className="app-companion-bangs"
            d="M31 35c2-16 14-24 29-24 15 0 25 7 30 19-8-6-13-9-19-10 1 6 0 11-3 16-4-6-8-9-12-12-2 7-8 13-16 17l-1-8Z"
          />
          <path className="app-companion-hair-lock" d="M29 38c-5 8-4 19 3 27m59-28c5 8 4 19-3 27" />
          <path className="app-companion-brow" d="M43 40c3-2 6-2 9 0m16 0c3-2 6-2 9 0" />
          <ellipse className="app-companion-eye-white" cx="48" cy="47" rx="7" ry="6" />
          <ellipse className="app-companion-eye-white" cx="72" cy="47" rx="7" ry="6" />
          <g className="app-companion-pupils">
            <ellipse className="app-companion-eye" cx="48" cy="47" rx="4.2" ry="4.8" />
            <ellipse className="app-companion-eye" cx="72" cy="47" rx="4.2" ry="4.8" />
            <circle className="app-companion-eye-glint" cx="46.5" cy="45" r="1.35" />
            <circle className="app-companion-eye-glint" cx="70.5" cy="45" r="1.35" />
          </g>
          <path className="app-companion-blush" d="M39 56c3 2 5 2 8 0m26 0c3 2 5 2 8 0" />
          <path className="app-companion-mouth" d="M55 57c3 3 7 3 10 0" />
          <path
            className="app-companion-hair-bow"
            d="m79 23 8-6 4 5-9 7m-4-6-8-6-4 5 9 7m2-4 2 8"
          />
        </g>
      </svg>
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
  React.useEffect(() => {
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
      </aside>
      <main className="app-shell-main" aria-label={activeItem?.label || '工作区'}>
        <CompanionDoll />
        {children}
      </main>
    </div>
  )
}
