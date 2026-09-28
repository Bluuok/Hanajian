import type { DatabaseKeyAction, DatabaseKeyState } from './types'

export const initialDatabaseKeyState: DatabaseKeyState = {
  status: 'idle',
  saved: false,
  encryptionAvailable: true,
  autoPhase: 0
}

export function databaseKeyReducer(
  state: DatabaseKeyState,
  action: DatabaseKeyAction
): DatabaseKeyState {
  switch (action.type) {
    case 'STORAGE_LOADED':
      return {
        ...state,
        saved: action.saved,
        encryptionAvailable: action.encryptionAvailable,
        status: state.status === 'idle' && action.saved ? 'saved' : state.status,
        error: action.error
      }
    case 'ENVIRONMENT_LOADED':
      return { ...state, environment: action.environment }
    case 'EDIT':
      return {
        ...state,
        status: 'editing',
        validation: undefined,
        error: undefined,
        errorCode: undefined
      }
    case 'VALIDATE_START':
      return {
        ...state,
        status: 'validating',
        validation: undefined,
        error: undefined,
        errorCode: undefined
      }
    case 'VALIDATE_SUCCESS':
      return {
        ...state,
        status: 'valid',
        validation: action.result,
        lastValidatedAt: action.at,
        error: undefined,
        errorCode: undefined,
        autoPhase: Math.max(state.autoPhase, 5)
      }
    case 'VALIDATE_ERROR':
      return {
        ...state,
        status: 'invalid',
        validation: action.result,
        lastValidatedAt: action.at,
        error: action.result.error,
        errorCode: action.result.code
      }
    case 'SAVE_START':
      return { ...state, status: 'saving', error: undefined }
    case 'SAVE_SUCCESS':
      return {
        ...state,
        status: 'saved',
        saved: true,
        encryptionAvailable: action.encryptionAvailable
      }
    case 'SAVE_ERROR':
      return { ...state, status: 'save-error', error: action.error }
    case 'CLEAR_START':
      return { ...state, status: 'clearing', error: undefined }
    case 'CLEAR_SUCCESS':
      return {
        ...initialDatabaseKeyState,
        environment: state.environment,
        encryptionAvailable: state.encryptionAvailable
      }
    case 'CLEAR_ERROR':
      return { ...state, status: 'clear-error', error: action.error }
    case 'AUTO_START':
      return { ...state, status: 'auto-detecting', autoPhase: 1, error: undefined }
    case 'AUTO_PROGRESS':
      return { ...state, autoPhase: Math.max(state.autoPhase, action.phase) }
    case 'AUTO_SUCCESS':
      return { ...state, status: 'auto-detected', autoPhase: 4 }
    case 'AUTO_ERROR':
      return { ...state, status: 'auto-detect-error', error: action.error }
  }
}
