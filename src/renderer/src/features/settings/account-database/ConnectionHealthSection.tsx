import type { ConnectionDiagnostic, DiagnosticStatus } from './types'

function DiagnosticIcon({ status }: { status: DiagnosticStatus }): React.ReactElement {
  if (status === 'checking') {
    return <span className="settings-diagnostic-icon checking" aria-label="检测中" />
  }
  const symbol =
    status === 'success' ? '✓' : status === 'warning' ? '!' : status === 'error' ? '×' : '—'
  return (
    <span className={`settings-diagnostic-icon ${status}`} aria-hidden="true">
      {symbol}
    </span>
  )
}

export function ConnectionHealthSection({
  diagnostics,
  summary
}: {
  diagnostics: ConnectionDiagnostic[]
  summary?: string
}): React.ReactElement {
  return (
    <section className="settings-card settings-health-card">
      {summary && <p className="settings-diagnostic-summary">{summary}</p>}
      <div className="settings-diagnostics">
        {diagnostics.map((item) => (
          <div className="settings-diagnostic" key={item.id}>
            <DiagnosticIcon status={item.status} />
            <span>{item.label}</span>
            <small title={item.detail}>{item.result}</small>
          </div>
        ))}
      </div>
    </section>
  )
}
