import type {
  DatabaseKeyEnvironment,
  DatabaseKeyValidationResult
} from '../../../../../shared/database-key'

export type DatabaseKeyWorkflowStatus =
  | 'idle'
  | 'editing'
  | 'validating'
  | 'valid'
  | 'invalid'
  | 'saving'
  | 'saved'
  | 'save-error'
  | 'clearing'
  | 'clear-error'
  | 'auto-detecting'
  | 'auto-detected'
  | 'auto-detect-error'

export interface DatabaseKeyState {
  status: DatabaseKeyWorkflowStatus
  saved: boolean
  encryptionAvailable: boolean
  validation?: DatabaseKeyValidationResult
  lastValidatedAt?: number
  error?: string
  errorCode?: string
  autoPhase: number
  environment?: DatabaseKeyEnvironment
}

export type DatabaseKeyAction =
  | { type: 'STORAGE_LOADED'; saved: boolean; encryptionAvailable: boolean; error?: string }
  | { type: 'ENVIRONMENT_LOADED'; environment: DatabaseKeyEnvironment }
  | { type: 'EDIT' }
  | { type: 'VALIDATE_START' }
  | { type: 'VALIDATE_SUCCESS'; result: DatabaseKeyValidationResult; at: number }
  | { type: 'VALIDATE_ERROR'; result: DatabaseKeyValidationResult; at: number }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS'; encryptionAvailable: boolean }
  | { type: 'SAVE_ERROR'; error: string }
  | { type: 'CLEAR_START' }
  | { type: 'CLEAR_SUCCESS' }
  | { type: 'CLEAR_ERROR'; error: string }
  | { type: 'AUTO_START' }
  | { type: 'AUTO_PROGRESS'; phase: number }
  | { type: 'AUTO_SUCCESS' }
  | { type: 'AUTO_ERROR'; error: string }

export interface DatabaseKeyController {
  state: DatabaseKeyState
  isBusy: boolean
  canSave: boolean
  pageStatus: 'saved' | 'unconfigured' | 'validating' | 'invalid'
  editKey: (value: string) => void
  pasteKey: () => Promise<void>
  validateKey: () => Promise<void>
  saveKey: () => Promise<void>
  autoDetectKey: () => Promise<void>
  clearSavedKey: () => Promise<void>
  returnToLogin: () => Promise<void>
  copyDiagnostics: () => Promise<void>
  refreshEnvironment: () => Promise<void>
}
