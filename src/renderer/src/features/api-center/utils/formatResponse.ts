export function formatResponseSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export function inferResponseCount(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>
  return typeof value.count === 'number' ? value.count : null
}
