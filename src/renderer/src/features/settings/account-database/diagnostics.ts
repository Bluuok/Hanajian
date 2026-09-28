import type { SettingsSelfInfo } from '../model/types'
import type { ConnectionCheckState, ConnectionDiagnostic, ConnectionOverviewStatus } from './types'

const CORE_DIAGNOSTIC_IDS = new Set<ConnectionDiagnostic['id']>([
  'db-key',
  'contacts',
  'messages',
  'identity'
])

export function buildConnectionDiagnostics(input: {
  dbReady: boolean
  selfInfo: SettingsSelfInfo | null
  hasDbKey: boolean
  hasImageKey: boolean
  checkState: ConnectionCheckState
}): ConnectionDiagnostic[] {
  if (input.checkState.status === 'checking') {
    return [
      { id: 'db-key', label: '数据库密钥', status: 'checking', result: '检测中' },
      { id: 'contacts', label: '联系人索引', status: 'checking', result: '检测中' },
      { id: 'messages', label: '消息数据库', status: 'checking', result: '检测中' },
      { id: 'identity', label: '账号身份', status: 'checking', result: '检测中' },
      { id: 'image-key', label: '图片解密密钥', status: 'checking', result: '检测中' }
    ]
  }

  const checkFailed = input.checkState.status === 'error'
  const checkError = input.checkState.status === 'error' ? input.checkState.message : undefined
  const connected = input.dbReady && !checkFailed
  const identityMatched =
    input.checkState.status === 'success' || input.checkState.status === 'warning'
      ? input.checkState.identityMatched
      : undefined

  return [
    {
      id: 'db-key',
      label: '数据库密钥',
      status: checkFailed
        ? 'error'
        : connected
          ? 'success'
          : input.hasDbKey
            ? 'warning'
            : 'unavailable',
      result: checkFailed
        ? '验证失败'
        : connected
          ? '已用于当前连接'
          : input.hasDbKey
            ? '尚未验证'
            : '尚未配置',
      detail: checkError
    },
    {
      id: 'contacts',
      label: '联系人索引',
      status: checkFailed ? 'error' : connected ? 'success' : 'idle',
      result: checkFailed ? '读取失败' : connected ? '当前连接可读取' : '未检测'
    },
    {
      id: 'messages',
      label: '消息数据库',
      status: checkFailed ? 'error' : connected ? 'success' : 'idle',
      result: checkFailed ? '挂载失败' : connected ? '当前连接已挂载' : '未检测'
    },
    {
      id: 'identity',
      label: '账号身份',
      status:
        identityMatched === false
          ? 'error'
          : connected && input.selfInfo?.wxid
            ? 'success'
            : 'idle',
      result:
        identityMatched === false
          ? '账号不匹配'
          : connected && input.selfInfo?.wxid
            ? '匹配成功'
            : '未检测'
    },
    {
      id: 'image-key',
      label: '图片解密密钥',
      status: input.hasImageKey ? 'success' : 'warning',
      result: input.hasImageKey ? '已配置' : '未配置',
      detail: input.hasImageKey ? undefined : '不影响聊天数据库读取，可在图片解密设置中配置'
    }
  ]
}

export function getConnectionOverviewStatus(input: {
  dbReady: boolean
  checkState: ConnectionCheckState
  diagnostics: ConnectionDiagnostic[]
}): ConnectionOverviewStatus {
  if (input.checkState.status === 'checking') return 'checking'
  if (!input.dbReady) return 'unavailable'
  if (input.checkState.status === 'error') return 'error'

  const coreDiagnostics = input.diagnostics.filter((item) => CORE_DIAGNOSTIC_IDS.has(item.id))
  if (coreDiagnostics.some((item) => item.status === 'error')) return 'error'
  if (coreDiagnostics.some((item) => item.status !== 'success')) return 'warning'
  if (
    input.diagnostics.some((item) => item.status === 'warning' || item.status === 'unavailable')
  ) {
    return 'warning'
  }
  return 'success'
}

export function formatConnectionCheckedAt(
  checkState: ConnectionCheckState,
  now: Date = new Date()
): string {
  if (checkState.status === 'checking') return '正在检测'
  if (!checkState.checkedAt) return '本次启动期间尚未检测'

  const elapsedMinutes = Math.max(
    0,
    Math.floor((now.getTime() - checkState.checkedAt.getTime()) / 60_000)
  )
  if (elapsedMinutes < 1) return '刚刚'
  if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`
  return checkState.checkedAt.toLocaleString('zh-CN', { hour12: false })
}

export function isSameAccount(input: {
  currentWxid?: string
  probeWxid?: string
  currentRoot?: string
  probeRoot?: string
}): boolean | undefined {
  const currentWxid = input.currentWxid?.trim()
  const probeWxid = input.probeWxid?.trim()
  if (currentWxid && probeWxid) return currentWxid === probeWxid

  const normalizePath = (value?: string): string | undefined =>
    value?.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
  const currentRoot = normalizePath(input.currentRoot)
  const probeRoot = normalizePath(input.probeRoot)
  return currentRoot && probeRoot ? currentRoot === probeRoot : undefined
}

export function sanitizeConnectionError(error?: string): string {
  const normalized = error?.toLocaleLowerCase() || ''
  if (normalized.includes('key') || normalized.includes('密钥')) return '数据库密钥验证失败'
  if (normalized.includes('path') || normalized.includes('目录')) return '无法读取当前账号目录'
  if (normalized.includes('permission') || normalized.includes('access'))
    return '当前账号目录不可访问'
  return '数据库连接检查未通过'
}
