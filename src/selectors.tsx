import type { CSSProperties } from 'react'
import { opps, reviewData, type Opportunity } from './data'
import { colors, impactPill, pill, riskPill } from './theme'
import { useStore } from './store'

const impactRank: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

export type DerivedOpp = Opportunity & {
  status: string
  impactPill: CSSProperties
  confPct: string
  inReview: boolean
  showButtons: boolean
  genLabel: string
  rowStyle: CSSProperties
  onReview: (e?: { stopPropagation?: () => void }) => void
  onGenerate: (e?: { stopPropagation?: () => void }) => void
}

/** Opportunities with derived status/handlers, plus the filtered+sorted list. */
export function useOpportunities() {
  const { state, setState, nav, showToast } = useStore()
  const f = state.filters

  const withStatus = opps.map((o) => ({ ...o, status: state.oppStatus[o.id] ?? 'Open' }))

  const filtered = withStatus
    .filter(
      (o) =>
        (f.type === 'All' || o.type === f.type) &&
        (f.impact === 'All' || o.impact === f.impact) &&
        (f.effort === 'All' || o.effort === f.effort) &&
        (f.source === 'All' || o.source === f.source) &&
        (f.status === 'All' || o.status === f.status),
    )
    .sort((a, b) => impactRank[a.impact] - impactRank[b.impact] || b.confidence - a.confidence)

  const mkOpp = (o: (typeof withStatus)[number]): DerivedOpp => ({
    ...o,
    impactPill: impactPill(o.impact),
    confPct: o.confidence + '%',
    inReview: o.status === 'In review',
    showButtons: o.status !== 'In review',
    genLabel: state.generating[o.id] ? 'Generating…' : 'Generate update',
    rowStyle: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1.6fr) 90px 90px 70px 110px 200px',
      gap: 12,
      alignItems: 'center',
      padding: '12px 18px',
      borderBottom: '1px solid #f3f3ed',
      cursor: 'pointer',
    },
    onReview: (e) => {
      e?.stopPropagation?.()
      nav('pages')
    },
    onGenerate: (e) => {
      e?.stopPropagation?.()
      if (state.generating[o.id]) return
      setState((prev) => ({ generating: { ...prev.generating, [o.id]: true } }))
      setTimeout(() => {
        setState((prev) => ({
          generating: { ...prev.generating, [o.id]: false },
          oppStatus: { ...prev.oppStatus, [o.id]: 'In review' },
        }))
        showToast('Update generated — added to review queue')
      }, 1100)
    },
  })

  return { withStatus, filtered, mkOpp }
}

/** Review-queue rows with derived status + handlers, plus pending/approved counts. */
export function useReview() {
  const { state, setState, showToast } = useStore()

  const items = reviewData.map((r) => {
    const status: string = state.reviewStatus[r.id] ?? r.preset ?? 'Pending'
    const pending = status === 'Pending'
    return {
      ...r,
      riskPill: riskPill(r.risk),
      pending,
      resolved: !pending,
      resolvedLabel: status,
      resolvedPill:
        status === 'Approved' ? pill(colors.green, colors.greenBg) : pill(colors.muted, colors.chipBg),
      onApprove: () => {
        setState({ reviewStatus: { ...state.reviewStatus, [r.id]: 'Approved' } })
        showToast('Approved — publishes on next sync')
      },
      onReject: () => {
        setState({ reviewStatus: { ...state.reviewStatus, [r.id]: 'Rejected' } })
        showToast('Rejected — change discarded')
      },
    }
  })

  const pendingCount = items.filter((r) => r.pending).length
  const approvedCount = items.filter((r) => r.resolved && r.resolvedLabel === 'Approved').length

  return { items, pendingCount, approvedCount }
}
