export function SecurityInfoSection(): React.ReactElement {
  return (
    <div className="database-key-security-info">
      <span>
        <strong>系统安全存储</strong>图片密钥通过系统安全能力保存。
      </span>
      <span>
        <strong>账号绑定</strong>密钥只用于当前微信账号。
      </span>
      <span>
        <strong>无损清除</strong>清除密钥不会删除微信原始图片。
      </span>
    </div>
  )
}
