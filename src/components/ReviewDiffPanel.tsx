import type { ReviewDiff } from '../data'
import { colors } from '../theme'

function DiffLine({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
        <pre
          style={{
            margin: 0,
            padding: '8px 10px',
            borderRadius: 6,
            background: '#faf9f6',
            border: `1px solid ${colors.hair}`,
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: colors.muted,
          }}
        >
          {before || '(empty)'}
        </pre>
        <pre
          style={{
            margin: 0,
            padding: '8px 10px',
            borderRadius: 6,
            background: '#f0faf4',
            border: `1px solid #c8e6d4`,
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: colors.ink,
          }}
        >
          {after || '(empty)'}
        </pre>
      </div>
    </div>
  )
}

export function ReviewDiffPanel({ diff, compact }: { diff: ReviewDiff; compact?: boolean }) {
  if (diff.manual && diff.instructions) {
    return (
      <div
        style={{
          gridColumn: '1 / -1',
          margin: '0 18px 12px',
          padding: '10px 12px',
          borderRadius: 8,
          background: '#f6f8fc',
          border: `1px solid ${colors.hair}`,
          fontSize: 12,
          color: colors.text,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ fontWeight: 600 }}>Manual step:</strong> {diff.instructions}
      </div>
    )
  }

  const hasContent =
    diff.title || diff.meta || (diff.content && diff.content.length > 0)
  if (!hasContent) return null

  return (
    <div
      style={{
        gridColumn: '1 / -1',
        margin: compact ? '0 18px 12px' : '0 18px 12px',
        padding: compact ? '10px 12px' : '12px 14px',
        borderRadius: 8,
        background: colors.subtle,
        border: `1px solid ${colors.hair}`,
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.ink, marginBottom: 4 }}>
        Suggested change preview
        {diff.subjectRef ? ` · ${diff.subjectRef}` : ''}
      </div>
      <div style={{ fontSize: 10.5, color: colors.muted2, marginBottom: 4 }}>Current → Suggested</div>
      {diff.title ? <DiffLine label="SEO title" before={diff.title.before} after={diff.title.after} /> : null}
      {diff.meta ? <DiffLine label="Meta description" before={diff.meta.before} after={diff.meta.after} /> : null}
      {diff.content?.map((c) => (
        <DiffLine key={c.tab} label={c.tab} before={c.before} after={c.after} />
      ))}
    </div>
  )
}
