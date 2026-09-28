import type { DatabaseKeyState } from './types'

export function DatabaseKeyValidation({
  state
}: {
  state: DatabaseKeyState
}): React.ReactElement | null {
  if (
    !['validating', 'valid', 'invalid', 'save-error', 'clear-error', 'saved'].includes(state.status)
  ) {
    return null
  }
  if (state.status === 'validating') {
    return (
      <div className="database-key-feedback checking">
        <i />
        正在验证数据库密钥……
      </div>
    )
  }
  if (['invalid', 'save-error', 'clear-error'].includes(state.status)) {
    return <div className="database-key-feedback error">{state.error || '密钥验证失败'}</div>
  }
  if (!state.validation?.success) return null
  return (
    <div className="database-key-feedback success">
      <strong>密钥验证成功</strong>
      <span>已识别账号：{state.validation.wxid || '已识别'}</span>
      <span>联系人数据库：{state.validation.contacts?.available ? '可用' : '不可用'}</span>
      <span>消息数据库：{state.validation.messages?.available ? '可用' : '不可用'}</span>
      <span title={state.validation.accountRoot}>
        账号目录：{state.validation.accountRoot || '已识别'}
      </span>
    </div>
  )
}
