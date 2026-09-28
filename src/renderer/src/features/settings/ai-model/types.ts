import type {
  AIProviderConfig,
  AIProviderSummary,
  AIRuntimeModelConfig,
  AIVisionTestResult
} from '../../../../../shared/ai-provider'

export const DEFAULT_VISION_PROMPT =
  '请描述这张图片中的主要内容，包括物体、场景、文字信息以及你能观察到的细节。'

export interface AIVisionTestState {
  status: 'idle' | 'reading' | 'ready' | 'testing' | 'success' | 'error'
  prompt: string
  image?: {
    dataUrl: string
    fileName: string
    mimeType: string
    size: number
  }
  result?: AIVisionTestResult
  error?: string
}

export interface AIModelSettingsState {
  loading: boolean
  saving: boolean
  providers: AIProviderSummary[]
  runtime: AIRuntimeModelConfig | null
  editor: AIProviderConfig | null
  originalProviderId?: string
  presetId: string
  testingId?: string
  visionTest: AIVisionTestState
  error?: string
}

export type AIModelSettingsAction =
  | { type: 'LOADED'; providers: AIProviderSummary[]; runtime: AIRuntimeModelConfig }
  | { type: 'ERROR'; error: string }
  | {
      type: 'OPEN_EDITOR'
      editor: AIProviderConfig
      presetId: string
      originalProviderId?: string
    }
  | { type: 'CLOSE_EDITOR' }
  | { type: 'EDIT'; editor: AIProviderConfig }
  | { type: 'SAVE_START' }
  | { type: 'TEST_START'; providerId: string }
  | { type: 'VISION_READING' }
  | {
      type: 'VISION_READY'
      image: NonNullable<AIVisionTestState['image']>
    }
  | { type: 'VISION_PROMPT'; prompt: string }
  | { type: 'VISION_TEST_START' }
  | { type: 'VISION_RESULT'; result: AIVisionTestResult }
  | { type: 'VISION_ERROR'; error: string }
  | { type: 'VISION_CLEAR' }

export interface AIModelSettingsController {
  state: AIModelSettingsState
  openNew: () => void
  openEdit: (provider: AIProviderSummary) => void
  closeEditor: () => void
  selectPreset: (presetId: string) => void
  updateEditor: (editor: AIProviderConfig) => void
  save: () => Promise<void>
  remove: (providerId: string) => Promise<void>
  setDefault: (providerId: string) => Promise<void>
  test: (providerId: string) => Promise<void>
  selectVisionImage: (file: File) => Promise<void>
  setVisionPrompt: (prompt: string) => void
  runVisionTest: () => Promise<void>
  clearVisionImage: () => void
}
