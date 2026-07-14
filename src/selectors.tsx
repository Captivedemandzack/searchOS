import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type Opportunity } from './data'
import { useData, useSiteId } from './data/DataProvider'
import { api, type NextStep } from './lib/api'
import { colors, impactPill, pill, riskPill } from './theme'
import { isStepInProgress, openOpportunity } from './lib/workflow'
import { useStore } from './store'

// "Quick wins first": expected monthly clicks discounted by effort. Shared by
// the Overview card and the Opportunities tab so both rank identically.
export const EFFORT_WEIGHT: Record<string, number> = { Low: 1, Medium: 2, High: 3.2 }

/** Pull the expected monthly-click number out of the "+613 clicks/mo" string. */
export function parseExpectedClicks(s: string): number {
  const m = s.match(/(\d[\d,]*)/)
  return m ? Number(m[1].replace(/,/g, '')) : 0
}

/** Split "…+613 clicks/mo" into a big stat + unit; null for non-numeric outcomes. */
export function expectedStat(s: string): { value: string; positive: boolean } | null {
  const m = s.match(/([+~]?[\d,]+)\s*clicks\/mo/)
  return m ? { value: m[1], positive: m[1].startsWith('+') } : null
}

export const oppPriority = (o: { expected: string; effort: string }) =>
  parseExpectedClicks(o.expected) / (EFFORT_WEIGHT[o.effort] ?? 2)

function stepFromOpportunity(o: Opportunity & { status?: string }): NextStep {
  return {
    id: `opportunity:${o.id}`,
    kind: 'opportunity',
    opportunityId: o.id,
    title: o.title,
    context: o.page,
    category: o.type,
    source: o.source,
    effort: o.effort,
    impact: o.impact,
    estMonthlyClicks: parseExpectedClicks(o.expected),
    priorityValue: oppPriority(o),
    status: o.status ?? 'Drafted',
    action: 'continue',
    actionLabel: 'Continue',
  }
}

export type DerivedOpp = Opportunity & {
  status: string
  impactPill: CSSProperties
  confPct: string
  inReview: boolean // has a generated draft awaiting review
  done: boolean
  dismissed: boolean
  onReview: (e?: { stopPropagation?: () => void }) => void
  onDone: (e?: { stopPropagation?: () => void }) => void
  onDismiss: (e?: { stopPropagation?: () => void }) => void
  onReopen: (e?: { stopPropagation?: () => void }) => void
}

/** Opportunities with derived status/handlers, plus the filtered+sorted list. */
export function useOpportunities() {
  const { state, setState, nav, showToast } = useStore()
  const { opps, reviewData } = useData()
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const f = state.filters

  // DB status is authoritative; a client override (optimistic) wins if present.
  const withStatus = opps.map((o) => ({ ...o, status: state.oppStatus[o.id] ?? o.status ?? 'Open' }))

  // Persist a checklist decision with an optimistic update + refetch.
  const setStatus = (id: string, status: 'Open' | 'Done' | 'Dismissed') => {
    setState((prev) => ({ oppStatus: { ...prev.oppStatus, [id]: status } }))
    if (!siteId) return
    api
      .setOpportunityStatus(siteId, id, status)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
        queryClient.invalidateQueries({ queryKey: ['next-steps'] })
      })
      .catch((err: Error) => {
        setState((prev) => {
          const next = { ...prev.oppStatus }
          delete next[id]
          return { oppStatus: next }
        })
        showToast(err.message)
      })
  }

  // "Active" (the default) shows the working set — Open + Drafted — and hides
  // Done/Dismissed so the checklist burns down. Explicit statuses still filter exactly.
  const statusMatch = (filter: string, status: string) =>
    filter === 'All'
      ? true
      : filter === 'Active'
        ? status === 'Open' || status === 'Drafted'
        : status === filter

  const filtered = withStatus
    .filter(
      (o) =>
        (f.type === 'All' || o.type === f.type) &&
        (f.impact === 'All' || o.impact === f.impact) &&
        (f.effort === 'All' || o.effort === f.effort) &&
        (f.source === 'All' || o.source === f.source) &&
        statusMatch(f.status, o.status),
    )
    // Quick wins first — same ranking as the Overview card (id tiebreak keeps
    // the order stable across renders).
    .sort((a, b) => oppPriority(b) - oppPriority(a) || a.id.localeCompare(b.id))

  const mkOpp = (o: (typeof withStatus)[number]): DerivedOpp => ({
    ...o,
    impactPill: impactPill(o.impact),
    confPct: o.confidence + '%',
    inReview: o.status === 'Drafted',
    done: o.status === 'Done',
    dismissed: o.status === 'Dismissed',
    onReview: (e) => {
      e?.stopPropagation?.()
      if (o.status === 'Drafted') {
        const step = stepFromOpportunity(o)
        openOpportunity(step, { nav, setState }, reviewData)
        return
      }
      openOpportunity(
        {
          id: `opportunity:${o.id}`,
          kind: 'opportunity',
          opportunityId: o.id,
          title: o.title,
          context: o.page,
          category: o.type,
          source: o.source,
          effort: o.effort,
          impact: o.impact,
          estMonthlyClicks: parseExpectedClicks(o.expected),
          priorityValue: oppPriority(o),
          status: o.status ?? 'Open',
          action: 'act',
          actionLabel: 'Open',
        },
        { nav, setState },
      )
    },
    onDone: (e) => {
      e?.stopPropagation?.()
      setStatus(o.id, 'Done')
      showToast('Marked done — it won’t resurface on refresh')
    },
    onDismiss: (e) => {
      e?.stopPropagation?.()
      setStatus(o.id, 'Dismissed')
      showToast('Dismissed')
    },
    onReopen: (e) => {
      e?.stopPropagation?.()
      setStatus(o.id, 'Open')
    },
  })

  return { withStatus, filtered, mkOpp }
}

/** Review-queue rows with derived status + handlers, plus pending/approved counts. */
export function useReview() {
  const { state, setState, showToast } = useStore()
  const { reviewData } = useData()
  const siteId = useSiteId()
  const queryClient = useQueryClient()

  const decide = (id: string, status: 'Approved' | 'Rejected') => {
    setState({ reviewStatus: { ...state.reviewStatus, [id]: status } })
    if (!siteId) return
    api
      .setReviewStatus(siteId, id, status)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
        queryClient.invalidateQueries({ queryKey: ['next-steps'] })
      })
      .catch((err: Error) => {
        setState((prev) => {
          const next = { ...prev.reviewStatus }
          delete next[id]
          return { reviewStatus: next }
        })
        showToast(err.message)
      })
  }

  const publish = (id: string) => {
    if (!siteId) return
    api
      .publishReviewItem(siteId, id)
      .then((res) => {
        showToast(
          res.editUrl
            ? `Published to WordPress as draft — open in WP to review`
            : 'Change logged for impact tracking',
        )
        queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
        queryClient.invalidateQueries({ queryKey: ['impact-changes', siteId] })
      })
      .catch((err: Error) => showToast(err.message))
  }

  const items = reviewData.map((r) => {
    const status: string = state.reviewStatus[r.id] ?? r.preset ?? 'Pending'
    const pending = status === 'Pending'
    const approved = status === 'Approved'
    const published = !!r.executedAt
    const canPublish = approved && !published && r.publishTier !== 'destructive'
    const resolvedLabel =
      status === 'Rejected' ? 'Rejected' : status === 'Approved' || published ? 'Completed' : status
    return {
      ...r,
      riskPill: riskPill(r.risk),
      pending,
      approved,
      published,
      canPublish,
      resolved: !pending,
      resolvedLabel,
      resolvedPill:
        published || status === 'Approved'
          ? pill(colors.green, colors.greenBg)
          : status === 'Rejected'
            ? pill(colors.red, colors.redBg)
            : pill(colors.muted, colors.chipBg),
      onApprove: () => {
        decide(r.id, 'Approved')
      },
      onReject: () => {
        decide(r.id, 'Rejected')
        showToast('Rejected')
      },
      onPublish: () => publish(r.id),
    }
  })

  const pendingCount = items.filter((r) => r.pending).length
  const completedCount = items.filter((r) => !r.pending).length
  const approvedCount = items.filter((r) => r.resolvedLabel.startsWith('Completed')).length

  return { items, pendingCount, completedCount, approvedCount }
}

/** Unified work queue: to do, in progress, and verified completed. */
export function useWorkItems() {
  const { state } = useStore()
  const { nextSteps, completedSteps } = useData()
  const siteId = useSiteId()
  const full = useQuery({
    queryKey: ['next-steps', siteId],
    queryFn: () => api.nextSteps(siteId!),
    enabled: !!siteId,
    staleTime: 30_000,
  })

  const allOpen = full.data?.steps ?? nextSteps
  const completed = full.data?.completed ?? completedSteps
  const startedIds = new Set(siteId ? (state.inProgressSteps[siteId] ?? []) : [])

  const inProgress = allOpen.filter((step) => isStepInProgress(step, startedIds))
  const todo = allOpen.filter((step) => !isStepInProgress(step, startedIds))
  const openCount = todo.length + inProgress.length

  return { todo, inProgress, completed, openCount, allOpen }
}
