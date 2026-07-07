import type { CSSProperties } from 'react'

/**
 * Groundwork design tokens.
 * A calm, near-white warm-neutral palette with a single restrained indigo accent.
 * Green / amber / red are used only for status semantics.
 */
export const colors = {
  // surfaces
  bg: '#f6f6f3',
  panel: '#fff',
  sidebar: '#fbfbf9',
  topbar: '#fff',
  subtle: '#fbfbf8', // table header / footer fills
  subtleAlt: '#fafaf6', // row hover
  suggestBg: '#fbfcff', // "suggested" column tint

  // ink
  ink: '#1c1c19',
  inkStrong: '#33332e', // primary button hover
  text: '#3c3c36',
  muted: '#6b6b62',
  muted2: '#8b8b82',
  faint: '#a0a096',
  navIdle: '#55554d',

  // borders / hairlines
  border: '#e8e8e3',
  borderInput: '#e2e2db',
  borderBtn: '#dcdcd4',
  hair: '#efefe9',
  hair2: '#f3f3ed',
  hair3: '#f6f6f0',
  hair4: '#f5f5ef',
  chipBg: '#f0f0ea',
  chipBg2: '#f2f2ec',
  navActiveBg: '#eeeee7',
  track: '#efefe9',

  // accent
  accent: '#3b5bdb',
  accentHover: '#2f4ab8',
  accentSoftBg: '#e7ecf9',

  // semantic — green (good)
  green: '#177245',
  greenBright: '#22a06b',
  greenBg: '#e6f3ea',
  greenBorder: '#bfdfc9',
  greenToast: '#4ade80',

  // semantic — amber (attention / medium)
  amber: '#9a6700',
  amberDot: '#d9a514',
  amberSync: '#d9a514',
  amberBg: '#faf1dd',

  // semantic — red (bad / high risk)
  red: '#b3261e',
  redBg: '#fbeceb',
} as const

export const shadow = {
  card: '0 1px 2px rgba(20,20,17,.03)',
  menu: '0 8px 28px rgba(20,20,17,.12)',
  toast: '0 8px 24px rgba(20,20,17,.25)',
} as const

export const mono = "'Geist Mono', monospace"

/** Base card surface used across every view. */
export const cardBase: CSSProperties = {
  background: colors.panel,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  boxShadow: shadow.card,
}

/** A rounded status pill. */
export function pill(color: string, bg: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifySelf: 'start',
    padding: '2px 9px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 650,
    color,
    background: bg,
    whiteSpace: 'nowrap',
  }
}

export type Impact = 'High' | 'Medium' | 'Low'
export type Risk = 'High' | 'Medium' | 'Low'

/** Impact badge: High = green, Medium = amber, Low = neutral. */
export function impactPill(level: string): CSSProperties {
  if (level === 'High') return pill(colors.green, colors.greenBg)
  if (level === 'Medium') return pill(colors.amber, colors.amberBg)
  return pill(colors.muted, colors.chipBg)
}

/** Risk / severity badge: High = red, Medium = amber, Low = green. */
export function riskPill(level: string): CSSProperties {
  if (level === 'High') return pill(colors.red, colors.redBg)
  if (level === 'Medium') return pill(colors.amber, colors.amberBg)
  return pill(colors.green, colors.greenBg)
}

/** Uppercase micro-label used for table headers and section eyebrows. */
export const th: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 650,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: colors.muted2,
}
