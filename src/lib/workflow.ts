import type { ReviewRow } from '../data'
import type { NextStep } from './api'
import { normalizePageRef, pageRefsMatch } from './proposedChanges'
export { normalizePageRef, pageRefsMatch } from './proposedChanges'
import type { State } from '../store'
import type { EditorTabId, ViewId } from '../data'

type NavCtx = {
  nav: (view: ViewId) => void
  setState: (patch: Partial<State> | ((prev: State) => Partial<State>)) => void
}

export function editorTabForCategory(category: string): EditorTabId {
  if (category === 'Metadata') return 'seo'
  if (category === 'Schema') return 'schema'
  if (category === 'Internal links') return 'links'
  return 'body'
}

/** Server-persisted draft or in-review work (generated suggestions exist). */
export function hasServerDraft(step: Pick<NextStep, 'action' | 'status'>): boolean {
  return (
    step.action === 'continue' ||
    step.status === 'Drafted' ||
    step.status === 'drafted' ||
    step.status === 'in_review'
  )
}

/** @deprecated use hasServerDraft or isStepInProgress */
export function isOpportunityInProgress(step: Pick<NextStep, 'action' | 'status'>): boolean {
  return hasServerDraft(step)
}

export function isStepInProgress(step: NextStep, startedIds: ReadonlySet<string>): boolean {
  return hasServerDraft(step) || startedIds.has(step.id)
}

export function opportunityStartLabel(variant: 'start' | 'continue'): string {
  return variant === 'continue' ? 'Continue' : 'Start'
}

function addInProgressStep(
  prev: State,
  siteId: string,
  stepId: string,
): Partial<State> {
  const current = prev.inProgressSteps[siteId] ?? []
  if (current.includes(stepId)) return {}
  return { inProgressSteps: { ...prev.inProgressSteps, [siteId]: [...current, stepId] } }
}

export function removeInProgressStep(
  prev: State,
  siteId: string,
  stepId: string,
): Partial<State> {
  const current = prev.inProgressSteps[siteId] ?? []
  if (!current.includes(stepId)) return {}
  return {
    inProgressSteps: {
      ...prev.inProgressSteps,
      [siteId]: current.filter((id) => id !== stepId),
    },
  }
}

/** @deprecated use normalizePageRef */
export function primaryPagePath(context: string): string | null {
  const path = normalizePageRef(context)
  return path || null
}

/** Match a review-queue row to the next step or workspace context. */
export function resolveReviewId(
  step: Pick<NextStep, 'kind' | 'findingId' | 'opportunityId' | 'context' | 'title'>,
  items: ReviewRow[],
): string | null {
  const openable = items.filter((r) => {
    const status = r.preset ?? 'Pending'
    if (r.executedAt) return false
    return status === 'Pending' || status === 'Approved'
  })

  const score = (r: ReviewRow): number => {
    let s = 0
    if (r.diff?.meta && r.diff.meta.before !== r.diff.meta.after) s += 4
    if (r.diff?.title && r.diff.title.before !== r.diff.title.after) s += 2
    if (r.preset === 'Pending') s += 1
    return s
  }

  const pickBest = (candidates: ReviewRow[]) =>
    candidates.length
      ? [...candidates].sort((a, b) => score(b) - score(a))[0]!.id
      : null

  if (step.findingId) {
    const matches = openable.filter((r) => r.findingId === step.findingId)
    const best = pickBest(matches)
    if (best) return best
  }

  const path = normalizePageRef(step.context)
  if (path) {
    const pathMatches = openable.filter(
      (r) =>
        (r.diff?.subjectRef && pageRefsMatch(r.diff.subjectRef, path)) ||
        pageRefsMatch(r.detail, path) ||
        r.title.toLowerCase().includes(step.title.toLowerCase().slice(0, 28)),
    )
    const best = pickBest(pathMatches)
    if (best) return best
  }

  const titleKey = step.title.toLowerCase().slice(0, 40)
  const titleMatches = openable.filter((r) => r.title.toLowerCase().includes(titleKey.slice(0, 24)))
  return pickBest(titleMatches)
}

/** Open an opportunity or finding into the unified detail screen. */
export function openOpportunity(
  step: NextStep,
  ctx: NavCtx,
  reviewItems?: ReviewRow[],
  opts?: { tab?: State['oppTab']; siteId?: string },
) {
  const reviewId = reviewItems?.length ? resolveReviewId(step, reviewItems) : null
  ctx.setState((prev) => ({
    oppDetailStep: step,
    actFindingId: step.findingId ?? null,
    actOpportunityId: step.opportunityId ?? null,
    actScopePath: normalizePageRef(step.context) || null,
    editorTab: editorTabForCategory(step.category),
    reviewFocusId: reviewId,
    expandedOpp: null,
    ...(opts?.siteId ? addInProgressStep(prev, opts.siteId, step.id) : {}),
  }))
  ctx.nav('opportunities')
}

/** Close the opportunity detail screen and return to the list. */
export function closeOpportunity(ctx: NavCtx, tab?: State['oppTab']) {
  ctx.setState({
    oppDetailStep: null,
    reviewFocusId: null,
    oppTab: tab ?? 'in_progress',
  })
}

/** @deprecated use openOpportunity */
export function openNextStep(
  step: NextStep,
  ctx: NavCtx,
  reviewItems?: ReviewRow[],
  siteId?: string,
) {
  openOpportunity(step, ctx, reviewItems, { siteId })
}

/** @deprecated use openOpportunity */
export function openProposedChanges(step: NextStep, reviewId: string | null, ctx: NavCtx) {
  openOpportunity(step, ctx, undefined)
  if (reviewId) ctx.setState({ reviewFocusId: reviewId })
}

/** @deprecated use openOpportunity */
export function openReviewFocus(reviewId: string | null, ctx: NavCtx, stepContext?: Partial<State>) {
  ctx.setState({
    reviewFocusId: reviewId,
    ...stepContext,
  })
  ctx.nav('opportunities')
}

/** @deprecated use openOpportunity */
export function openActForOpportunity(
  oppId: string,
  opts: { category: string; page: string; title?: string },
  ctx: NavCtx,
) {
  openOpportunity(
    {
      id: `opportunity:${oppId}`,
      kind: 'opportunity',
      opportunityId: oppId,
      title: opts.title ?? 'Opportunity',
      context: opts.page,
      category: opts.category,
      source: 'GSC',
      effort: 'Medium',
      impact: 'Medium',
      estMonthlyClicks: 0,
      priorityValue: 0,
      status: 'Open',
      action: 'act',
      actionLabel: 'Open',
    },
    ctx,
  )
}

/** @deprecated use openOpportunity */
export function openActForPage(path: string, editorTab: EditorTabId, ctx: NavCtx) {
  openOpportunity(
    {
      id: `page:${path}`,
      kind: 'opportunity',
      title: path,
      context: path,
      category: 'Content',
      source: 'Manual',
      effort: 'Medium',
      impact: 'Medium',
      estMonthlyClicks: 0,
      priorityValue: 0,
      status: 'Open',
      action: 'act',
      actionLabel: 'Open',
    },
    ctx,
  )
  ctx.setState({ editorTab })
}

/** From Workspace: open the review item tied to the current finding or page. */
export function openReviewForWorkspace(
  ctx: NavCtx,
  reviewItems: ReviewRow[],
  opts: {
    findingId?: string | null
    opportunityId?: string | null
    context: string
    title: string
    category?: string
  },
) {
  const step: NextStep = {
    id: opts.findingId ? `finding:${opts.findingId}` : `opportunity:${opts.opportunityId}`,
    kind: opts.findingId ? 'finding' : 'opportunity',
    findingId: opts.findingId ?? undefined,
    opportunityId: opts.opportunityId ?? undefined,
    title: opts.title,
    context: opts.context,
    category: opts.category ?? 'Content',
    source: 'GSC',
    effort: 'Medium',
    impact: 'Medium',
    estMonthlyClicks: 0,
    priorityValue: 0,
    status: 'drafted',
    action: 'continue',
    actionLabel: 'Continue',
  }
  openOpportunity(step, ctx, reviewItems)
}
