import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs-extra'

const tempBaseDir = path.join(os.tmpdir(), `tracedigest-settings-test-${Date.now()}`)
const originalSettingsDir = process.env.WE_SETTINGS_DIR

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return tempBaseDir
      return tempBaseDir
    })
  }
}))

describe('settings-store theme normalization and persistence hygiene', () => {
  let currentTestDir = ''

  beforeEach(() => {
    vi.resetModules()
    currentTestDir = path.join(
      tempBaseDir,
      `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    )
    fs.ensureDirSync(currentTestDir)
    process.env.WE_SETTINGS_DIR = currentTestDir
  })

  afterEach(() => {
    try {
      if (currentTestDir && fs.existsSync(currentTestDir)) {
        fs.removeSync(currentTestDir)
      }
    } catch {
      // Best-effort directory cleanup
    } finally {
      if (originalSettingsDir !== undefined) {
        process.env.WE_SETTINGS_DIR = originalSettingsDir
      } else {
        delete process.env.WE_SETTINGS_DIR
      }
    }
  })

  it('defaults appearanceTheme to light when no settings file exists', async () => {
    const { loadSettings } = await import('../../src/main/services/settings-store')
    const loaded = loadSettings()
    expect(loaded.appearanceTheme).toBe('light')
    expect(loaded.apiEnabled).toBe(true)
    expect(loaded.compactMode).toBe(false)
  })

  it('normalizes legacy dark value to light on load', async () => {
    fs.writeJsonSync(path.join(currentTestDir, 'settings.json'), {
      appearanceTheme: 'dark',
      compactMode: true,
      apiPort: 7123
    })

    const { loadSettings } = await import('../../src/main/services/settings-store')
    const loaded = loadSettings()
    expect(loaded.appearanceTheme).toBe('light')
    expect(loaded.compactMode).toBe(true)
    expect(loaded.apiPort).toBe(7123)
  })

  it('normalizes legacy system value to light on load', async () => {
    fs.writeJsonSync(path.join(currentTestDir, 'settings.json'), {
      appearanceTheme: 'system',
      compactMode: false,
      recallProtectionEnabled: true
    })

    const { loadSettings } = await import('../../src/main/services/settings-store')
    const loaded = loadSettings()
    expect(loaded.appearanceTheme).toBe('light')
    expect(loaded.compactMode).toBe(false)
    expect(loaded.recallProtectionEnabled).toBe(true)
  })

  it('forces light theme when saving or updating settings', async () => {
    const { updateSettings, loadSettings } = await import('../../src/main/services/settings-store')
    const updated = updateSettings({
      appearanceTheme: 'dark' as unknown as 'light',
      compactMode: true
    })
    expect(updated.appearanceTheme).toBe('light')
    expect(updated.compactMode).toBe(true)

    // Verify written file on disk is also normalized
    const diskContent = fs.readJsonSync(path.join(currentTestDir, 'settings.json'))
    expect(diskContent.appearanceTheme).toBe('light')
    expect(diskContent.compactMode).toBe(true)

    const reloaded = loadSettings()
    expect(reloaded.appearanceTheme).toBe('light')
  })

  it('preserves other settings when updating specific fields', async () => {
    const { saveSettings, updateSettings } = await import('../../src/main/services/settings-store')
    const initial = saveSettings({
      dbRoot: 'test-db-root',
      apiEnabled: true,
      apiHost: '127.0.0.1',
      apiPort: 9090,
      imageKeyRoot: 'test-db-root',
      imageXorKey: '0x12',
      imageAesKey: 'abc',
      imageKeyFallbackDisabled: false,
      ffmpegPath: '/usr/bin/ffmpeg',
      recallProtectionEnabled: true,
      debugEnabled: false,
      autoLogin: true,
      autoLoginPreferenceSet: true,
      appearanceTheme: 'dark' as unknown as 'light',
      compactMode: false,
      showStartupProgress: true,
      agentHubCustomInstructions: 'instruction-test',
      ttsSelectedVoiceId: 'voice-1',
      ttsModel: 's2.1-pro-free'
    })
    expect(initial.appearanceTheme).toBe('light')

    const patched = updateSettings({ compactMode: true })
    expect(patched.compactMode).toBe(true)
    expect(patched.appearanceTheme).toBe('light')
    expect(patched.apiPort).toBe(9090)
    expect(patched.recallProtectionEnabled).toBe(true)
    expect(patched.agentHubCustomInstructions).toBe('instruction-test')
  })
})
