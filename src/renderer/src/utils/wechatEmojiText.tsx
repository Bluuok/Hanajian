import type { ReactNode } from 'react'
import { getEmojiPath } from 'wechat-emojis'

const emojiAssetModules = import.meta.glob(
  '../../../../node_modules/wechat-emojis/assets/**/*.png',
  {
    eager: true,
    query: '?url',
    import: 'default'
  }
) as Record<string, string>

const emojiUrlByPath = new Map<string, string>()

for (const [modulePath, url] of Object.entries(emojiAssetModules)) {
  const normalized = modulePath.replace(/\\/g, '/')
  const match = normalized.match(/wechat-emojis\/(.+)$/)
  if (match) emojiUrlByPath.set(match[1], url)
}

const unicodeFallback: Record<string, string> = {
  微笑: '🙂',
  撇嘴: '😒',
  色: '😍',
  发呆: '😳',
  得意: '😎',
  流泪: '😭',
  害羞: '😊',
  闭嘴: '🤐',
  睡: '😴',
  大哭: '😭',
  尴尬: '😅',
  发怒: '😡',
  调皮: '😜',
  呲牙: '😁',
  惊讶: '😮',
  难过: '😞',
  抓狂: '😫',
  吐: '🤮',
  偷笑: '🤭',
  愉快: '😄',
  白眼: '🙄',
  傲慢: '😤',
  困: '😪',
  惊恐: '😱',
  憨笑: '😄',
  悠闲: '😌',
  咒骂: '😤',
  疑问: '❓',
  嘘: '🤫',
  晕: '😵',
  衰: '😞',
  骷髅: '💀',
  敲打: '🔨',
  再见: '👋',
  擦汗: '😓',
  抠鼻: '🤧',
  鼓掌: '👏',
  坏笑: '😏',
  鄙视: '😒',
  委屈: '🥺',
  快哭了: '😢',
  阴险: '😈',
  亲亲: '😘',
  可怜: '🥺',
  笑脸: '😄',
  生病: '🤒',
  脸红: '😊',
  破涕为笑: '😂',
  恐惧: '😨',
  失望: '😞',
  无语: '😑',
  嘿哈: '😄',
  捂脸: '😭',
  奸笑: '😏',
  机智: '😏',
  皱眉: '😟',
  耶: '✌️',
  666: '👍',
  Emm: '😐'
}

function resolveEmojiUrl(name: string): string {
  const emojiPath = getEmojiPath(name)
  return emojiPath ? emojiUrlByPath.get(emojiPath) || '' : ''
}

export function renderWechatEmojiText(text: string, size = 22): ReactNode {
  if (!text || !text.includes('[')) return text

  return text.split(/\[([^\[\]\r\n]{1,16})\]/g).map((part, index) => {
    if (index % 2 === 0) return part

    const url = resolveEmojiUrl(part)
    if (url) {
      return (
        <img
          key={`${part}-${index}`}
          className="inline-wechat-emoji"
          src={url}
          alt={`[${part}]`}
          title={`[${part}]`}
          style={{ width: size, height: size }}
        />
      )
    }

    return unicodeFallback[part] || `[${part}]`
  })
}
