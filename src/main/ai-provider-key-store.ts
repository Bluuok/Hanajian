import { app, safeStorage } from 'electron'
import fs from 'fs-extra'
import path from 'path'

interface StoredKeys {
  version: 1
  keys: Record<string, string>
}

export class AIProviderKeyStore {
  private get filePath(): string {
    return path.join(app.getPath('userData'), 'ai-provider-keys.bin')
  }

  get(providerId: string): { success: boolean; key?: string; error?: string; available: boolean } {
    const result = this.read()
    return { ...result, key: result.data?.keys[providerId] }
  }

  save(providerId: string, key: string): { success: boolean; error?: string } {
    if (!safeStorage.isEncryptionAvailable()) {
      return { success: false, error: '系统安全存储不可用' }
    }
    const current = this.read()
    if (!current.success) return { success: false, error: current.error }
    const data = current.data || { version: 1 as const, keys: {} }
    data.keys[providerId] = key
    return this.write(data)
  }

  clear(providerId: string): { success: boolean; error?: string } {
    const current = this.read()
    if (!current.success) return { success: false, error: current.error }
    if (!current.data?.keys[providerId]) return { success: true }
    delete current.data.keys[providerId]
    try {
      if (Object.keys(current.data.keys).length === 0) fs.removeSync(this.filePath)
      else return this.write(current.data)
      return { success: true }
    } catch {
      return { success: false, error: '无法清除 AI Provider 密钥' }
    }
  }

  private read(): {
    success: boolean
    data?: StoredKeys
    error?: string
    available: boolean
  } {
    const available = safeStorage.isEncryptionAvailable()
    if (!fs.existsSync(this.filePath)) {
      return { success: true, data: { version: 1, keys: {} }, available }
    }
    if (!available) return { success: false, error: '系统安全存储不可用', available }
    try {
      const data = JSON.parse(
        safeStorage.decryptString(fs.readFileSync(this.filePath))
      ) as StoredKeys
      if (data.version !== 1 || !data.keys) throw new Error('invalid AI key store')
      return { success: true, data, available }
    } catch {
      return { success: false, error: 'AI Provider 安全存储不可读取', available }
    }
  }

  private write(data: StoredKeys): { success: boolean; error?: string } {
    try {
      fs.ensureDirSync(path.dirname(this.filePath))
      fs.writeFileSync(this.filePath, safeStorage.encryptString(JSON.stringify(data)), {
        mode: 0o600
      })
      fs.chmodSync(this.filePath, 0o600)
      return { success: true }
    } catch {
      return { success: false, error: 'AI Provider 密钥保存失败' }
    }
  }
}
