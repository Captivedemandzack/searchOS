import type { PublishReadiness } from '../lib/api'
import { colors } from '../theme'
import { HButton } from '../lib/Hover'

type ReadinessPanelProps = {
  readiness: PublishReadiness
  onPublish?: () => void
  publishing?: boolean
  publishBlocked?: string | null
}

/**
 * Pre-publish readiness ("verified draft"): shows the proof that every planned
 * change will land before the human clicks Publish. Green = ready to publish.
 */
export function ReadinessPanel({
  readiness,
  onPublish,
  publishing,
  publishBlocked,
}: ReadinessPanelProps) {
  const allOk = readiness.ok
  const canPublish = allOk && !!onPublish
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 8,
        background: allOk ? colors.greenBg : colors.amberBg,
        border: `1px solid ${allOk ? `${colors.green}44` : `${colors.amber}55`}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span aria-hidden style={{ fontSize: 13 }}>✦</span>
        <span style={{ fontSize: 13, fontWeight: 650, color: allOk ? colors.green : colors.text }}>
          {allOk ? 'Verified draft ready to publish' : 'Draft prepared — some checks need attention'}
        </span>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
        {allOk
          ? canPublish
            ? 'Every change below was proven to land before any live write.'
            : 'Every change below was proven to land. Scroll to the review panel below to publish.'
          : 'Not auto-approved. Fix the flagged items, then rebuild or publish manually.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {readiness.checks.map((c) => (
          <div key={c.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span
              aria-hidden="true"
              style={{ fontSize: 12, fontWeight: 700, color: c.ok ? colors.green : colors.red, lineHeight: 1.5 }}
            >
              {c.ok ? '\u2713' : '\u2717'}
            </span>
            <span style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600 }}>{c.label}:</strong> {c.detail}
            </span>
          </div>
        ))}
      </div>
      {canPublish ? (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${colors.green}33` }}>
          <HButton
            onClick={() => {
              if (publishing || publishBlocked) return
              onPublish?.()
            }}
            hover={publishing || publishBlocked ? undefined : { background: colors.inkStrong }}
            title={publishBlocked ?? undefined}
            style={{
              background: colors.ink,
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 12.5,
              fontWeight: 600,
              color: '#fff',
              opacity: publishing || publishBlocked ? 0.55 : 1,
              cursor: publishing || publishBlocked ? 'not-allowed' : 'pointer',
            }}
          >
            {publishing ? 'Publishing…' : 'Publish to WordPress'}
          </HButton>
          {publishBlocked ? (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: colors.muted, lineHeight: 1.45 }}>
              {publishBlocked}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
