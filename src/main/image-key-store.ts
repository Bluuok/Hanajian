import { app, safeStorage } from 'electron'
import fs from 'fs-extra'
import path from 'path'

export interface StoredImageKeyEntry {
  xorKey: string
  aesKey: string
  updatedAt: number
}

interface StoredImageKeyFile {
  version: 1
  accounts: Record<string, StoredImageKeyEntry>
}

interface StoreReadResult {
  success: boolean
  data?: StoredImageKeyFile
  error?: string
  encryptionAvailable: boolean
}

export class ImageKeyStore {
  private get filePath(): string {
    return path.join(app.getPath('userData'), 'wechat-image-keys.bin')
  }

  get(accountId: string): StoreReadResult & { entry?: StoredImageKeyEntry } {
    const result = this.read()
    return { ...result, entry: result.data?.accounts[accountId] }
  }

  save(
    accountId: string,
    entry: Omit<StoredImageKeyEntry, 'updatedAt'>
  ): { success: boolean; entry?: StoredImageKeyEntry; error?: string } {
    if (!safeStorage.isEncryptionAvailable()) {
      return { success: false, error: '系统安全存储不可用' }
    }
    const current = this.read()
    if (!current.success && fs.existsSync(this.filePath)) {
      return { success: false, error: '无法读取现有图片密钥配置' }
    }
    const nextEntry = { ...entry, updatedAt: Date.now() }
    const data: StoredImageKeyFile = current.data || { version: 1, accounts: {} }
    data.accounts[accountId] = nextEntry
    const saved = this.write(data)
    return saved.success ? { success: true, entry: nextEntry } : saved
  }

  clear(accountId: string): { success: boolean; error?: string } {
    const current = this.read()
    if (!current.success) return { success: false, error: current.error }
    if (!current.data?.accounts[accountId]) return { success: true }
    delete current.data.accounts[accountId]
    try {
      if (Object.keys(current.data.accounts).length === 0) fs.removeSync(this.filePath)
      else return this.write(current.data)
      return { success: true }
    } catch {
      return { success: false, error: '无法清除图片密钥配置' }
    }
  }

  private read(): StoreReadResult {
    const encryptionAvailable = safeStorage.isEncryptionAvailable()
    if (!fs.existsSync(this.filePath)) {
      return {
        success: true,
        data: { version: 1, accounts: {} },
        encryptionAvailable
      }
    }
    if (!encryptionAvailable) {
      return { success: false, error: '系统安全存储不可用', encryptionAvailable }
    }
    try {
      const decrypted = safeStorage.decryptString(fs.readFileSync(this.filePath))
      const data = JSON.parse(decrypted) as StoredImageKeyFile
      if (data.version !== 1 || !data.accounts) throw new Error('invalid image key store')
      return { success: true, data, encryptionAvailable }
    } catch {
      return { success: false, error: '图片密钥安全存储不可读取', encryptionAvailable }
    }
  }

  private write(data: StoredImageKeyFile): { success: boolean; error?: string } {
    try {
      fs.ensureDirSync(path.dirname(this.filePath))
      fs.writeFileSync(this.filePath, safeStorage.encryptString(JSON.stringify(data)), {
        mode: 0o600
      })
      fs.chmodSync(this.filePath, 0o600)
      return { success: true }
    } catch {
      return { success: false, error: '图片密钥保存失败' }
    }
  }
}
