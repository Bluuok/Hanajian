import type { ApiEndpoint, ApiResponse } from '../model/types'

export async function sendLocalApiRequest(
  endpoint: ApiEndpoint,
  params: Record<string, string>,
  body: string
): Promise<ApiResponse | { error: string }> {
  const response = await window.api.testLocalApiRequest({
    endpointId: endpoint.id,
    query: params,
    body
  })
  if (!response.ok || typeof response.status !== 'number')
    return { error: response.error || '本地 API 请求失败' }
  const text = response.bodyText || JSON.stringify(response.json ?? {}, null, 2)
  return {
    endpoint,
    status: response.status,
    durationMs: response.durationMs,
    responseSize: response.responseSize,
    text,
    data: response.json ?? response.bodyText
  }
}
