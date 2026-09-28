export type DiagnosticStatus = 'idle' | 'checking' | 'success' | 'warning' | 'error' | 'unavailable'

export type ConnectionCheckState =
  | { status: 'idle'; checkedAt?: Date }
  | { status: 'checking'; checkedAt?: Date }
  | { status: 'success'; checkedAt: Date; identityMatched?: boolean }
  | { status: 'warning'; checkedAt: Date; message?: string; identityMatched?: boolean }
  | { status: 'error'; checkedAt: Date; message?: string }

export interface ConnectionDiagnostic {
  id: 'db-key' | 'contacts' | 'messages' | 'identity' | 'image-key'
  label: string
  status: DiagnosticStatus
  result: string
  detail?: string
}

export type ConnectionOverviewStatus = 'checking' | 'success' | 'warning' | 'error' | 'unavailable'
