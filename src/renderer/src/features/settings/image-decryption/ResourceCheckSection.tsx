import type {
  ImageDecryptionStatus,
  ImageResourceCheck
} from '../../../../../shared/image-decryption'

const ITEMS: { key: keyof ImageDecryptionStatus['resources']; label: string }[] = [
  { key: 'imageIndex', label: '图片索引' },
  { key: 'imageDirectory', label: '图片文件目录' },
  { key: 'thumbnail', label: '缩略图资源' },
  { key: 'original', label: '原图资源' },
  { key: 'sticker', label: '表情资源' }
]

export function ResourceCheckSection({
  status
}: {
  status: ImageDecryptionStatus | null
}): React.ReactElement {
  return (
    <section className="settings-card image-resource-checks">
      {ITEMS.map(({ key, label }) => {
        const item: ImageResourceCheck = status?.resources[key] || {
          state: 'unknown',
          detail: '正在检查'
        }
        return (
          <div key={key}>
            <span className={`image-resource-icon ${item.state}`}>
              {item.state === 'available' ? '✓' : item.state === 'unavailable' ? '!' : '·'}
            </span>
            <strong>{label}</strong>
            <small>{item.detail}</small>
          </div>
        )
      })}
    </section>
  )
}
