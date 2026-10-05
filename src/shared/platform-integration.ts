export type PlatformWatermarkStatus = 'absent' | 'present' | 'unknown'

export interface PlatformMediaAsset {
  id: string
  kind: 'image' | 'video'
  urls: string[]
  sourceField: string
  watermark: PlatformWatermarkStatus
  watermarkEvidence: string
  previewUrl?: string
}

export interface PlatformWork {
  platform: 'douyin' | 'xiaohongshu'
  id: string
  kind: 'images' | 'video'
  title: string
  author: string
  sourceUrl: string
  assets: PlatformMediaAsset[]
  resolvedBy: 'http' | 'browser'
  warnings: string[]
}

export interface PlatformParseResult {
  success: boolean
  work?: PlatformWork
  resultId?: string
  error?: string
  code?: 'INVALID_INPUT' | 'NO_MEDIA' | 'UNAVAILABLE' | 'BROWSER_UNAVAILABLE'
  identifiedWork?: { id: string; kind?: 'images' | 'video'; sourceUrl: string }
}

export interface PlatformSaveRequest {
  resultId: string
  /** Omit to save every asset. Main process uses a previously confirmed directory or opens its picker. */
  assetId?: string
}

export interface PlatformSaveResult {
  success: boolean
  canceled?: boolean
  files: string[]
  errors?: string[]
  error?: string
  directory?: string
  savedAssets?: PlatformSavedAsset[]
  reusedFiles?: string[]
}

export interface PlatformSavedAsset {
  assetId: string
  path: string
}
export interface PlatformMarkdownResult {
  success: boolean
  reused?: boolean
  file?: string
  directory?: string
  canceled?: boolean
  error?: string
}

export interface PlatformDirectoryResult {
  success: boolean
  directory?: string
  canceled?: boolean
  error?: string
}

export const PLATFORM_WATERMARK_LABELS: Record<PlatformWatermarkStatus, string> = {
  absent: '平台标明无水印',
  present: '含水印',
  unknown: '水印状态未知'
}
