import type { AIModelSettingsAction, AIModelSettingsState } from './types'
import { DEFAULT_VISION_PROMPT } from './types'

export const initialAIModelSettingsState: AIModelSettingsState = {
  loading: true,
  saving: false,
  providers: [],
  runtime: null,
  editor: null,
  presetId: 'deepseek',
  visionTest: { status: 'idle', prompt: DEFAULT_VISION_PROMPT }
}

export function aiModelSettingsReducer(
  state: AIModelSettingsState,
  action: AIModelSettingsAction
): AIModelSettingsState {
  switch (action.type) {
    case 'LOADED':
      return {
        ...state,
        loading: false,
        saving: false,
        testingId: undefined,
        providers: action.providers,
        runtime: action.runtime,
        error: undefined
      }
    case 'ERROR':
      return { ...state, loading: false, saving: false, testingId: undefined, error: action.error }
    case 'OPEN_EDITOR':
      return {
        ...state,
        editor: action.editor,
        presetId: action.presetId,
        originalProviderId: action.originalProviderId,
        error: undefined
      }
    case 'CLOSE_EDITOR':
      return { ...state, editor: null, originalProviderId: undefined, error: undefined }
    case 'EDIT':
      return { ...state, editor: action.editor, error: undefined }
    case 'SAVE_START':
      return { ...state, saving: true, error: undefined }
    case 'TEST_START':
      return { ...state, testingId: action.providerId, error: undefined }
    case 'VISION_READING':
      return {
        ...state,
        visionTest: { ...state.visionTest, status: 'reading', result: undefined, error: undefined }
      }
    case 'VISION_READY':
      return {
        ...state,
        visionTest: {
          ...state.visionTest,
          status: 'ready',
          image: action.image,
          result: undefined,
          error: undefined
        }
      }
    case 'VISION_PROMPT':
      return { ...state, visionTest: { ...state.visionTest, prompt: action.prompt } }
    case 'VISION_TEST_START':
      return {
        ...state,
        visionTest: { ...state.visionTest, status: 'testing', result: undefined, error: undefined }
      }
    case 'VISION_RESULT':
      return {
        ...state,
        visionTest: {
          ...state.visionTest,
          status: action.result.success ? 'success' : 'error',
          result: action.result,
          error: action.result.error
        }
      }
    case 'VISION_ERROR':
      return {
        ...state,
        visionTest: { ...state.visionTest, status: 'error', result: undefined, error: action.error }
      }
    case 'VISION_CLEAR':
      return {
        ...state,
        visionTest: { status: 'idle', prompt: state.visionTest.prompt }
      }
    default:
      return state
  }
}
