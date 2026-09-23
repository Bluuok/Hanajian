import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppearancePage } from '../../src/renderer/src/features/settings/pages/AppearancePage'

describe('AppearancePage UI pilot', () => {
  it('enforces light theme and manages compact mode and startup progress switches', async () => {
    const user = userEvent.setup()
    const onNotice = vi.fn()
    const onAppearanceChange = vi.fn()
    const settings = {
      appearanceTheme: 'system' as const,
      compactMode: false,
      showStartupProgress: true
    }
    const api = {
      getSettings: vi.fn(async () => ({ settings })),
      setSettings: vi.fn(async (patch: Partial<typeof settings>) => ({
        settings: Object.assign(settings, patch)
      }))
    }
    Object.defineProperty(window, 'api', { configurable: true, value: api })

    render(<AppearancePage onNotice={onNotice} onAppearanceChange={onAppearanceChange} />)
    expect(await screen.findByRole('heading', { name: '外观与行为' })).toBeVisible()
    expect(screen.getByText('纯白与暖白浅色主题')).toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: '紧凑布局' }))

    expect(api.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ compactMode: true, appearanceTheme: 'light' })
    )
    expect(onAppearanceChange).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'light', compactMode: true })
    )
    expect(onNotice).toHaveBeenCalledWith('外观设置已保存')
  })
})
