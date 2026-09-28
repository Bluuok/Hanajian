export function buildApiUrl(
  host: string,
  port: number,
  path: string,
  params: Record<string, string>
): string {
  const url = new URL(path, `http://${host}:${port}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value.trim()) url.searchParams.set(key, value.trim())
  })
  return url.toString()
}

export function isLoopbackHost(host: string): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(host.trim().toLowerCase())
}
