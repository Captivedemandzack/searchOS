import type { CSSProperties, ReactNode } from 'react'
import { cardBase, colors } from '../theme'

/** White rounded card surface. Extra `style` merges over the base. */
export function Card({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  return <div style={{ ...cardBase, ...style }}>{children}</div>
}

/** Page title row: an <h1> plus an optional muted subtitle. */
export function PageHeading({
  title,
  sub,
  children,
}: {
  title: string
  sub?: ReactNode
  children?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 16px' }}>
      <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>{title}</h1>
      {sub != null && <span style={{ fontSize: 12.5, color: colors.muted2 }}>{sub}</span>}
      {children}
    </div>
  )
}

/** Small secondary/ghost button used for row actions across tables. */
export const ghostBtn: CSSProperties = {
  background: colors.panel,
  border: `1px solid ${colors.borderBtn}`,
  borderRadius: 7,
  padding: '5px 11px',
  fontSize: 11.5,
  fontWeight: 550,
  color: colors.ink,
}

/** Dark primary button. */
export const primaryBtn: CSSProperties = {
  background: colors.ink,
  color: colors.panel,
  border: 'none',
  borderRadius: 8,
  padding: '7px 13px',
  fontSize: 12.5,
  fontWeight: 550,
}
