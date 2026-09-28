// Safe logging for Electron child processes whose stdout/stderr pipes can be
// closed by the parent (electron-vite). Plain console.error throws EPIPE
// against a closed pipe, which crashes the IPC handler. Wrap writes so any
// pipe error is swallowed.
type SafeConsoleMethod = (...args: unknown[]) => void

function makeSafe(method: SafeConsoleMethod): SafeConsoleMethod {
  return (...args: unknown[]) => {
    try {
      method(...args)
    } catch {
      // Swallow EPIPE / ERR_STREAM_DESTROYED; logging must never crash the app.
    }
  }
}

export const safeLog = makeSafe(console.log.bind(console))
export const safeWarn = makeSafe(console.warn.bind(console))
export const safeError = makeSafe(console.error.bind(console))

export function installSafeConsole(): void {
  console.log = safeLog
  console.warn = safeWarn
  console.error = safeError
}
