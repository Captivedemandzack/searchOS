/**
 * Content Engine — refresh-first recommendation rules (July 2026 research).
 *
 * Everything in this module is a pure function: GSC/GA4/page arrays in,
 * recommendations out. No database access, no side effects — the API routes in
 * index.ts assemble inputs and serve results; components render them. All
 * thresholds come from ContentPolicy (contentPolicy.ts), never hardcoded here.
 *
 * Design points from the research:
 *  - Refreshing existing URLs beats publishing new ones on ROI, so the refresh
 *    queue is the primary output, ranked by commercial value (intent × page
 *    value × upside ÷ effort), not raw traffic.
 *  - The engine must be willing to say "do nothing" (leave_alone) and to tell a
 *    client to stop publishing (saturation / velocity governor).
 *  - Comparison window: last `windowDays` vs the same window one year earlier;
 *    where a year of history doesn't exist, fall back to the immediately prior
 *    window and mark the result low-confidence.
 *  - No crawl-budget logic: every client here is far below the ~10k-page bar.
 */
import { benchmarkCtr } from './scoring.ts'
import { normalizeUrl, urlPath } from './url.ts'
import type { ContentPolicy } from './contentPolicy.ts'

// ---- Inputs (minimal shapes; Prisma rows satisfy these) ---------------------

export type GscRowLite = {
  date: Date
  page: string
  query: string | null
  clicks: number
  impressions: number
  position: number
}
export type Ga4RowLite = { date: Date; landingPage: string; conversions: number; sessions?: number }
export type PageLite = {
  slug: string
  title: string | null
  type: string
  contentHtml: string | null
  url: string | null
  wpId: number | null
}

// ---- Outputs -----------------------------------------------------------------

export type RefreshAction =
  | 'refresh'
  | 'rewrite'
  | 'consolidate'
  | 'prune'
  | 'leave_alone'
  | 'insufficient_data'
export type TriggerId =
  | 'striking_distance'
  | 'ctr_decay'
  | 'ctr_below_curve'
  | 'stale_references'
  | 'rewrite_deep'
  | 'consolidate_cannibal'
  | 'prune_dead'
  | 'leave_alone_stable'
  | 'insufficient_data'

export type FiredTrigger = { id: TriggerId; reason: string }

export type RefreshRecommendation = {
  path: string
  title: string | null
  pageType: string
  action: RefreshAction
  triggers: FiredTrigger[]
  /** Plain-English summary (the top trigger's reason). */
  reason: string
  effort: 'Low' | 'Medium' | 'High'
  priority: number
  intent: 'transactional' | 'local' | 'informational'
  primaryKeyword: string | null
  position: number | null
  clicks: number
  conversions: number
  estMonthlyUpside: number
  lowConfidence: boolean
  /** Set for leave_alone: when to look at this page again. */
  reviewAfter: string | null
  /** Set for consolidate: the winning URL (proposed 301 target). */
  consolidateInto: string | null
}

/** Per-client data reality: how much the engine actually knows. */
export type DataSufficiency = {
  gscHistoryMonths: number
  /** Calendar months (YYYY-MM) with zero page-level rows inside the history span. */
  gscCoverageGaps: string[]
  /** Gap months falling inside the trailing prune window specifically. */
  pruneWindowGaps: string[]
  pagesTotal: number
  pagesWithGscData: number
  ga4Conversions: number
  ga4Status: 'active' | 'partial' | 'none'
  firstDataDate: string | null
  lastDataDate: string | null
}

/** Site-level context the gates check before destructive rules may fire. */
export type SufficiencyContext = {
  historyMonths: number
  pruneWindowGaps: string[]
}

export type ContentGovernor = {
  coveragePct: number
  universeSize: number
  coveredCount: number
  saturated: boolean
  postsLast30d: number
  velocityExceeded: boolean
  allowNewPosts: boolean
  reason: string | null
}

/** Post-audit reconciliation: do recommendation counts balance against reality? */
export type ReconciliationResult = {
  balanced: boolean
  totalRecs: number
  resolvedPages: number
  unknownPages: number
  insufficientMissingGsc: number
  allRecsResolved: boolean
  failures: string[]
}

// ---- Small helpers -----------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)

const STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'in', 'of', 'to', 'and', 'or', 'with', 'near', 'me', 'best', 'top',
  'your', 'our', 'how', 'what', 'is', 'are', 'vs', 'at', 'on', 'by', 'you', 'my', 'get', 'this',
])
export function keywordTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

const canonicalKey = (input: string) => normalizeUrl(input)

/** Resolved pages only — url must be set. */
export function resolvedPages(pages: PageLite[]): PageLite[] {
  return pages.filter((p) => p.url != null && p.url !== '')
}

type Agg = { clicks: number; impr: number; posw: number }
const emptyAgg = (): Agg => ({ clicks: 0, impr: 0, posw: 0 })
const aggPos = (a: Agg) => (a.impr > 0 ? a.posw / a.impr : null)
const aggCtr = (a: Agg) => (a.impr > 0 ? a.clicks / a.impr : 0)

/** Years mentioned in content that are older than `staleMonths` from `now`. */
export function detectStaleYearReferences(html: string | null, now: Date, staleMonths: number): number[] {
  if (!html) return []
  const text = html.replace(/<[^>]+>/g, ' ')
  const cutoff = new Date(now.getTime())
  cutoff.setMonth(cutoff.getMonth() - staleMonths)
  const cutoffYear = cutoff.getFullYear()
  const found = new Set<number>()
  for (const m of text.matchAll(/\b(20\d{2})\b/g)) {
    const year = Number(m[1])
    // A bare year reference is stale when the *end* of that year is older than
    // the cutoff — i.e. year < cutoff year (mentions of the cutoff year itself
    // may still be within the window).
    if (year < cutoffYear && year >= 2000) found.add(year)
  }
  return [...found].sort()
}

/**
 * How much data the engine actually has for this client. Everything destructive
 * gates on this: a page with no GSC rows is UNKNOWN, not dead, and a thin
 * history can't support a prune or rewrite call.
 */
export function computeDataSufficiency(
  gsc: GscRowLite[],
  ga4: { date: Date; conversions: number }[],
  pages: PageLite[],
  policy: ContentPolicy,
): DataSufficiency {
  let minTs = Infinity
  let maxTs = -Infinity
  const monthsWithData = new Set<string>()
  const pathsWithData = new Set<string>()
  for (const r of gsc) {
    if (r.query !== null) continue
    const t = r.date.getTime()
    if (t < minTs) minTs = t
    if (t > maxTs) maxTs = t
    monthsWithData.add(r.date.toISOString().slice(0, 7))
    pathsWithData.add(canonicalKey(r.page))
  }
  const hasData = maxTs > -Infinity
  const historyMonths = hasData ? (maxTs - minTs) / (30.44 * DAY) : 0

  const gaps: string[] = []
  if (hasData) {
    const cursor = new Date(minTs)
    cursor.setUTCDate(1)
    const end = new Date(maxTs)
    while (cursor.getTime() <= end.getTime()) {
      const key = cursor.toISOString().slice(0, 7)
      if (!monthsWithData.has(key)) gaps.push(key)
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
  }
  const pruneStart = hasData ? new Date(maxTs - policy.pruneAfterMonths * 30.44 * DAY) : null
  const pruneWindowGaps = pruneStart ? gaps.filter((g) => g >= pruneStart.toISOString().slice(0, 7)) : gaps

  let ga4Conversions = 0
  if (hasData) {
    const curStart = new Date(maxTs - (policy.windowDays - 1) * DAY)
    for (const r of ga4) if (r.date >= curStart) ga4Conversions += r.conversions
  }
  const ga4Status: DataSufficiency['ga4Status'] =
    ga4Conversions >= policy.ga4ActiveMinConversions
      ? 'active'
      : ga4Conversions >= policy.ga4PartialMinConversions
        ? 'partial'
        : 'none'

  const pagesWithGscData = resolvedPages(pages).filter((p) => pathsWithData.has(p.url!)).length

  return {
    gscHistoryMonths: Math.round(historyMonths * 10) / 10,
    gscCoverageGaps: gaps,
    pruneWindowGaps,
    pagesTotal: resolvedPages(pages).length,
    pagesWithGscData,
    ga4Conversions,
    ga4Status,
    firstDataDate: hasData ? new Date(minTs).toISOString().slice(0, 10) : null,
    lastDataDate: hasData ? new Date(maxTs).toISOString().slice(0, 10) : null,
  }
}

export function intentOf(
  keyword: string | null,
  policy: ContentPolicy,
): 'transactional' | 'local' | 'informational' {
  if (!keyword) return 'informational'
  const k = keyword.toLowerCase()
  if (policy.transactionalModifiers.some((m) => k.includes(m))) return 'transactional'
  if (policy.localModifiers.some((m) => k.includes(m))) return 'local'
  return 'informational'
}

// ---- Per-page signals ----------------------------------------------------------

export type PageSignals = {
  path: string
  wpId: number | null
  title: string | null
  pageType: string
  primaryKeyword: string | null
  /** Position of the primary keyword when known, else the page's average. */
  position: number | null
  clicks: number
  impressions: number
  ctr: number
  expectedCtr: number | null
  prevClicks: number
  prevImpressions: number
  hasPrev: boolean
  lowConfidence: boolean
  conversions: number
  staleYears: number[]
  /** Other paths competing for the same primary keyword. */
  competingPaths: string[]
  /** Any clicks or impressions in the trailing pruneAfterMonths? */
  hadTrafficInPruneWindow: boolean
  /** Does GSC have ANY rows for this page, ever? No rows = unknown, not dead. */
  hasAnyGscRows: boolean
}

/**
 * Assemble per-page signals from raw rows. Current window = the most recent
 * `windowDays` of data; comparison window = the same span one year earlier when
 * that history exists, else the immediately prior span (marked low-confidence).
 */
export function buildPageSignals(
  gsc: GscRowLite[],
  ga4: Ga4RowLite[],
  pages: PageLite[],
  policy: ContentPolicy,
  now: Date = new Date(),
): PageSignals[] {
  const resolved = resolvedPages(pages)
  if (gsc.length === 0 && resolved.length === 0) return []

  let maxTs = 0
  for (const r of gsc) if (r.date.getTime() > maxTs) maxTs = r.date.getTime()
  const maxDate = maxTs > 0 ? new Date(maxTs) : now

  const curStart = addDays(maxDate, -(policy.windowDays - 1))
  const yoyEnd = addDays(maxDate, -policy.yoyOffsetDays)
  const yoyStart = addDays(curStart, -policy.yoyOffsetDays)
  const fbEnd = addDays(curStart, -1)
  const fbStart = addDays(fbEnd, -(policy.windowDays - 1))
  const pruneStart = addDays(maxDate, -Math.round(policy.pruneAfterMonths * 30.44))

  const hasYoY = gsc.some((r) => r.query === null && r.date >= yoyStart && r.date <= yoyEnd)
  const prevStart = hasYoY ? yoyStart : fbStart
  const prevEnd = hasYoY ? yoyEnd : fbEnd

  const cur = new Map<string, Agg>()
  const prev = new Map<string, Agg>()
  const pruneWindowTraffic = new Set<string>()
  const everSeen = new Set<string>()
  for (const r of gsc) {
    if (r.query !== null) continue
    const key = canonicalKey(r.page)
    everSeen.add(key)
    if (r.date >= pruneStart && (r.clicks > 0 || r.impressions > 0)) pruneWindowTraffic.add(key)
    const bucket = r.date >= curStart && r.date <= maxDate ? cur : r.date >= prevStart && r.date <= prevEnd ? prev : null
    if (!bucket) continue
    const a = bucket.get(key) ?? emptyAgg()
    a.clicks += r.clicks
    a.impr += r.impressions
    a.posw += r.position * r.impressions
    bucket.set(key, a)
  }

  const pathQueries = new Map<string, Map<string, Agg>>()
  for (const r of gsc) {
    if (r.query === null || r.date < curStart || r.date > maxDate) continue
    const key = canonicalKey(r.page)
    const pq = pathQueries.get(key) ?? new Map<string, Agg>()
    const a = pq.get(r.query) ?? emptyAgg()
    a.clicks += r.clicks
    a.impr += r.impressions
    a.posw += r.position * r.impressions
    pq.set(r.query, a)
    pathQueries.set(key, pq)
  }
  const primaryFor = new Map<string, { keyword: string; pos: number | null; impr: number }>()
  for (const [key, pq] of pathQueries) {
    let best: { keyword: string; pos: number | null; impr: number } | null = null
    for (const [keyword, a] of pq) {
      if (!best || a.impr > best.impr || (a.impr === best.impr && keyword < best.keyword)) {
        best = { keyword, pos: aggPos(a), impr: a.impr }
      }
    }
    if (best) primaryFor.set(key, best)
  }

  // wpId per canonical url — for same-post cannibalization suppression.
  const wpIdByUrl = new Map<string, number | null>()
  for (const p of resolved) wpIdByUrl.set(p.url!, p.wpId)

  // Competing paths per primary keyword — only resolved pages with GSC rows.
  const byKeyword = new Map<string, string[]>()
  for (const [key, p] of primaryFor) {
    if (p.impr < 30) continue
    if (!everSeen.has(key)) continue
    const list = byKeyword.get(p.keyword) ?? []
    list.push(key)
    byKeyword.set(p.keyword, list)
  }

  const convByPath = new Map<string, number>()
  for (const r of ga4) {
    if (r.date < curStart || r.date > maxDate) continue
    const key = canonicalKey(r.landingPage)
    convByPath.set(key, (convByPath.get(key) ?? 0) + r.conversions)
  }

  // Signals built ONLY from resolved WordPress pages — never synthesized /slug paths.
  const signals: PageSignals[] = []
  for (const p of resolved) {
    const path = p.url!
    const c = cur.get(path) ?? emptyAgg()
    const pv = prev.get(path) ?? emptyAgg()
    const primary = primaryFor.get(path) ?? null
    const pagePos = aggPos(c)
    const position = primary?.pos ?? pagePos
    const myWpId = p.wpId
    const rawCompeting = primary ? (byKeyword.get(primary.keyword) ?? []).filter((k) => k !== path) : []
    // Drop competitors on the same WordPress post or without GSC data.
    const competing = rawCompeting.filter((k) => {
      if (!everSeen.has(k)) return false
      const otherWpId = wpIdByUrl.get(k)
      if (myWpId != null && otherWpId != null && myWpId === otherWpId) return false
      return true
    })
    signals.push({
      path,
      wpId: p.wpId,
      title: p.title,
      pageType: p.type,
      primaryKeyword: primary?.keyword ?? null,
      position,
      clicks: c.clicks,
      impressions: c.impr,
      ctr: aggCtr(c),
      expectedCtr: position != null ? benchmarkCtr(position) : null,
      prevClicks: pv.clicks,
      prevImpressions: pv.impr,
      hasPrev: pv.impr > 0 || pv.clicks > 0,
      lowConfidence: !hasYoY,
      conversions: convByPath.get(path) ?? 0,
      staleYears: detectStaleYearReferences(p.contentHtml ?? null, now, policy.staleReferenceMonths),
      competingPaths: competing,
      hadTrafficInPruneWindow: pruneWindowTraffic.has(path),
      hasAnyGscRows: everSeen.has(path),
    })
  }
  return signals
}

// ---- Trigger rules (each fires on its condition only) ---------------------------

export function ruleLeaveAlone(s: PageSignals, p: ContentPolicy): FiredTrigger | null {
  if (s.position == null || s.impressions === 0) return null
  if (s.position > p.leaveAloneMaxPosition) return null
  // "Stable" = clicks have not decayed by the decay threshold.
  const decayed = s.hasPrev && s.prevClicks > 0 && s.clicks <= s.prevClicks * (1 - p.decayClicksDropPct)
  if (decayed) return null
  return {
    id: 'leave_alone_stable',
    reason: `Position ${s.position.toFixed(1)} and stable — do nothing. Re-check in ${p.leaveAloneReviewMonths} months.`,
  }
}

export function rulePrune(s: PageSignals, p: ContentPolicy): FiredTrigger | null {
  if (s.hadTrafficInPruneWindow) return null
  if (s.clicks > 0 || s.impressions > 0) return null
  return {
    id: 'prune_dead',
    reason: `Zero clicks and zero impressions in the last ${p.pruneAfterMonths} months of Search Console history — prune or noindex.`,
  }
}

export function ruleConsolidate(s: PageSignals): FiredTrigger | null {
  if (!s.hasAnyGscRows) return null
  if (s.competingPaths.length === 0 || !s.primaryKeyword) return null
  return {
    id: 'consolidate_cannibal',
    reason: `Competes with ${s.competingPaths.map(urlPath).join(', ')} for "${s.primaryKeyword}" — consolidate into the stronger URL.`,
  }
}

export function ruleRewrite(s: PageSignals, p: ContentPolicy): FiredTrigger | null {
  if (s.position == null || s.impressions === 0) return null
  if (s.position <= p.rewriteAbovePosition) return null
  return {
    id: 'rewrite_deep',
    reason: `Average position ${s.position.toFixed(1)} — beyond ${p.rewriteAbovePosition}, a refresh won't recover it. Rewrite from scratch.`,
  }
}

export function ruleStrikingDistance(s: PageSignals, p: ContentPolicy): FiredTrigger | null {
  if (s.position == null) return null
  if (s.position < p.strikingDistance.min || s.position > p.strikingDistance.max) return null
  const kw = s.primaryKeyword ? `"${s.primaryKeyword}"` : 'the primary keyword'
  return {
    id: 'striking_distance',
    reason: `${kw} sits at position ${s.position.toFixed(1)} — striking distance. A refresh moves faster and cheaper than a new URL.`,
  }
}

export function ruleCtrDecay(s: PageSignals, p: ContentPolicy): FiredTrigger | null {
  if (!s.hasPrev || s.prevClicks <= 0) return null
  const clicksDropped = s.clicks <= s.prevClicks * (1 - p.decayClicksDropPct)
  const imprHolding = s.impressions >= s.prevImpressions * (1 - p.decayImpressionsTolerancePct)
  if (!clicksDropped || !imprHolding) return null
  const pct = Math.round((1 - s.clicks / s.prevClicks) * 100)
  return {
    id: 'ctr_decay',
    reason: `Clicks down ${pct}% year over year while impressions held — usually a title/meta problem, not a ranking problem.`,
  }
}

export function ruleCtrBelowCurve(s: PageSignals, p: ContentPolicy): FiredTrigger | null {
  if (s.expectedCtr == null || s.impressions < p.minImpressionsForCtrRules) return null
  if (s.ctr >= s.expectedCtr * p.ctrBelowCurveRatio) return null
  return {
    id: 'ctr_below_curve',
    reason: `CTR ${(s.ctr * 100).toFixed(1)}% vs ~${(s.expectedCtr * 100).toFixed(1)}% expected at position ${s.position?.toFixed(1)} — the snippet isn't earning its ranking.`,
  }
}

export function ruleStaleReferences(s: PageSignals, p: ContentPolicy): FiredTrigger | null {
  if (s.staleYears.length === 0) return null
  return {
    id: 'stale_references',
    reason: `Content references ${s.staleYears.join(', ')} — older than ${p.staleReferenceMonths} months. Update stats, pricing, and year mentions.`,
  }
}

// ---- Evaluation: precedence + prioritization -----------------------------------

function estMonthlyUpside(s: PageSignals, triggers: FiredTrigger[], p: ContentPolicy): number {
  const monthly = 30 / p.windowDays
  let gain = 0
  const has = (id: TriggerId) => triggers.some((t) => t.id === id)
  if ((has('ctr_decay') || has('ctr_below_curve')) && s.expectedCtr != null) {
    gain = Math.max(gain, s.impressions * Math.max(0, s.expectedCtr - s.ctr) * 0.6)
  }
  if (has('striking_distance')) {
    gain = Math.max(gain, s.impressions * Math.max(0, benchmarkCtr(p.strikingDistance.min) - s.ctr) * 0.5)
  }
  if (has('stale_references') && s.expectedCtr != null) {
    gain = Math.max(gain, s.impressions * s.expectedCtr * 0.1)
  }
  return Math.round(gain * monthly)
}

function effortFor(action: RefreshAction, triggers: FiredTrigger[]): 'Low' | 'Medium' | 'High' {
  if (action === 'rewrite') return 'High'
  if (action === 'consolidate') return 'Medium'
  if (action === 'prune' || action === 'leave_alone' || action === 'insufficient_data') return 'Low'
  // refresh: title/meta and date fixes are cheap; on-page content work is medium.
  const onlyCheap = triggers.every((t) => t.id === 'ctr_decay' || t.id === 'ctr_below_curve' || t.id === 'stale_references')
  return onlyCheap ? 'Low' : 'Medium'
}

/**
 * Priority = intent weight × page value × (1 + upside) ÷ effort.
 * Page value folds in GA4 conversions so a page driving 200 buyer visits
 * outranks one driving 2,000 browser visits, plus a service-page bonus
 * (per-treatment pages support revenue directly; posts are the fifth lever).
 */
export function priorityScore(
  s: PageSignals,
  action: RefreshAction,
  effort: 'Low' | 'Medium' | 'High',
  upside: number,
  intent: 'transactional' | 'local' | 'informational',
  p: ContentPolicy,
  useConversionWeighting = true,
): number {
  if (action === 'leave_alone' || action === 'insufficient_data') return 0
  // With no conversion tracking, revenue weighting is noise — fall back to a
  // traffic-and-intent-only score (the caller labels this on screen).
  const value =
    (useConversionWeighting ? 1 + Math.log10(1 + s.conversions) : 1) *
    (s.pageType === 'page' ? p.servicePageBonus : 1)
  const intentW = p.intentWeights[intent]
  return (intentW * value * (1 + upside / 50)) / p.effortWeights[effort]
}

/** Permissive default keeps evaluatePage usable standalone; evaluateSite always
 *  passes the real, computed context. */
const PERMISSIVE_CTX: SufficiencyContext = { historyMonths: 999, pruneWindowGaps: [] }

export function evaluatePage(
  s: PageSignals,
  p: ContentPolicy,
  now: Date = new Date(),
  ctx: SufficiencyContext = PERMISSIVE_CTX,
  useConversionWeighting = true,
): RefreshRecommendation | null {
  const leaveAlone = ruleLeaveAlone(s, p)
  const prune = rulePrune(s, p)
  const consolidate = ruleConsolidate(s)
  const rewrite = ruleRewrite(s, p)
  const refreshTriggers = [
    ruleStrikingDistance(s, p),
    ruleCtrDecay(s, p),
    ruleCtrBelowCurve(s, p),
    ruleStaleReferences(s, p),
  ].filter((t): t is FiredTrigger => t !== null)

  // A destructive rule that fires without enough data is not dropped silently —
  // it downgrades to insufficient_data with a reason naming exactly what's missing.
  const insufficient = (reason: string): { action: RefreshAction; triggers: FiredTrigger[] } => ({
    action: 'insufficient_data',
    triggers: [{ id: 'insufficient_data', reason }],
  })

  let action: RefreshAction | null = null
  let triggers: FiredTrigger[] = []
  if (leaveAlone) {
    action = 'leave_alone'
    triggers = [leaveAlone]
  } else if (prune) {
    if (!s.hasAnyGscRows) {
      ;({ action, triggers } = insufficient(
        'No Search Console rows exist for this page — status is unknown, not dead. Never prune on absent data.',
      ))
    } else if (ctx.historyMonths < p.pruneMinHistoryMonths) {
      ;({ action, triggers } = insufficient(
        `Prune suppressed: only ${Math.floor(ctx.historyMonths)} months of GSC history, ${p.pruneMinHistoryMonths} required.`,
      ))
    } else if (ctx.pruneWindowGaps.length > 0) {
      ;({ action, triggers } = insufficient(
        `Prune suppressed: GSC coverage gaps inside the ${p.pruneAfterMonths}-month window (${ctx.pruneWindowGaps.join(', ')}).`,
      ))
    } else {
      action = 'prune'
      triggers = [prune]
    }
  } else if (consolidate) {
    if (ctx.historyMonths < p.consolidateMinHistoryMonths) {
      ;({ action, triggers } = insufficient(
        `Consolidate suppressed: only ${Math.floor(ctx.historyMonths)} months of GSC history, ${p.consolidateMinHistoryMonths} required for a destructive merge.`,
      ))
    } else {
      action = 'consolidate'
      triggers = [consolidate]
    }
  } else if (rewrite) {
    if (ctx.historyMonths < p.rewriteMinHistoryMonths) {
      ;({ action, triggers } = insufficient(
        `Rewrite suppressed: only ${Math.floor(ctx.historyMonths)} months of GSC history, ${p.rewriteMinHistoryMonths} required.`,
      ))
    } else {
      action = 'rewrite'
      triggers = [rewrite]
    }
  } else if (refreshTriggers.length > 0) {
    action = 'refresh'
    triggers = refreshTriggers
  } else if (!s.hasAnyGscRows) {
    ;({ action, triggers } = insufficient(
      'No Search Console rows exist for this page — status is unknown, not dead. Never prune on absent data.',
    ))
  }
  if (!action) return null

  const intent = intentOf(s.primaryKeyword, p)
  const effort = effortFor(action, triggers)
  const upside = action === 'refresh' || action === 'rewrite' ? estMonthlyUpside(s, triggers, p) : 0
  const reviewAfter =
    action === 'leave_alone'
      ? new Date(now.getTime() + p.leaveAloneReviewMonths * 30.44 * DAY).toISOString().slice(0, 10)
      : null

  return {
    path: s.path,
    title: s.title,
    pageType: s.pageType,
    action,
    triggers,
    reason: triggers[0].reason,
    effort,
    priority: priorityScore(s, action, effort, upside, intent, p, useConversionWeighting),
    intent,
    primaryKeyword: s.primaryKeyword,
    position: s.position,
    clicks: s.clicks,
    conversions: s.conversions,
    estMonthlyUpside: upside,
    lowConfidence: s.lowConfidence,
    reviewAfter,
    consolidateInto: null,
  }
}

/** The refresh queue: every page with a recommendation, ranked by priority.
 *  Destructive rules are gated on the client's real data sufficiency, and the
 *  priority score drops conversion weighting when GA4 tracking isn't firing. */
export function evaluateSite(
  gsc: GscRowLite[],
  ga4: Ga4RowLite[],
  pages: PageLite[],
  p: ContentPolicy,
  now: Date = new Date(),
): RefreshRecommendation[] {
  const signals = buildPageSignals(gsc, ga4, pages, p, now)
  const sufficiency = computeDataSufficiency(gsc, ga4, pages, p)
  const ctx: SufficiencyContext = {
    historyMonths: sufficiency.gscHistoryMonths,
    pruneWindowGaps: sufficiency.pruneWindowGaps,
  }
  const useConversionWeighting = sufficiency.ga4Status !== 'none'

  const bySignalPath = new Map(signals.map((s) => [s.path, s]))
  const queue = signals
    .map((s) => evaluatePage(s, p, now, ctx, useConversionWeighting))
    .filter((r): r is RefreshRecommendation => r !== null)

  // Consolidation: winner must have GSC data; contenders already filtered in buildPageSignals.
  for (const rec of queue) {
    if (rec.action !== 'consolidate') continue
    const sig = bySignalPath.get(rec.path)
    if (!sig || !sig.hasAnyGscRows) {
      rec.action = 'insufficient_data'
      rec.triggers = [{ id: 'insufficient_data', reason: 'Consolidate suppressed: this page has no Search Console data.' }]
      rec.reason = rec.triggers[0].reason
      rec.consolidateInto = null
      continue
    }
    const contenders = [rec.path, ...sig.competingPaths]
    let winner = rec.path
    let best = -1
    for (const path of contenders) {
      const contender = bySignalPath.get(path)
      if (!contender?.hasAnyGscRows) continue
      const impr = contender.impressions
      if (impr > best || (impr === best && path < winner)) {
        best = impr
        winner = path
      }
    }
    if (best < 0) {
      rec.action = 'insufficient_data'
      rec.triggers = [{ id: 'insufficient_data', reason: 'Consolidate suppressed: no competing page has Search Console data.' }]
      rec.reason = rec.triggers[0].reason
      rec.consolidateInto = null
      continue
    }
    rec.consolidateInto = winner === rec.path ? null : winner
  }

  return queue.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.estMonthlyUpside - a.estMonthlyUpside ||
      a.path.localeCompare(b.path),
  )
}

// ---- Topic supply governor -------------------------------------------------------

export type QueryAggLite = { query: string; impressions: number; position: number }

/**
 * Keyword-universe coverage: of the queries with real demand, how many does the
 * site already cover (ranks on page 1, or has a page whose slug matches the
 * query's terms)? Above the saturation threshold, further publishing risks
 * cannibalization more than it adds reach — recommend zero new posts.
 */
export function computeGovernor(
  queries: QueryAggLite[],
  pages: PageLite[],
  postsLast30d: number,
  p: ContentPolicy,
): ContentGovernor {
  const pathTokens = new Set<string>()
  for (const pg of resolvedPages(pages)) {
    const segments = urlPath(pg.url!).split('/').filter(Boolean)
    for (const seg of segments) for (const t of keywordTokens(seg.replace(/-/g, ' '))) pathTokens.add(t)
  }

  const universe = queries.filter((q) => q.impressions >= p.minUniverseImpressions)
  let covered = 0
  for (const q of universe) {
    if (q.position > 0 && q.position <= p.coveredAtPosition) {
      covered++
      continue
    }
    const toks = keywordTokens(q.query)
    if (toks.length > 0 && toks.every((t) => pathTokens.has(t))) covered++
  }
  const coveragePct = universe.length > 0 ? Math.round((covered / universe.length) * 100) : 0
  const saturated = universe.length > 0 && coveragePct >= p.saturationThresholdPct
  const velocityExceeded = postsLast30d >= p.maxNewPostsPerMonth

  let reason: string | null = null
  if (saturated) {
    reason = `Topic coverage is at ${coveragePct}% of the keyword universe (${covered} of ${universe.length} demand queries). Publishing more risks cannibalizing existing pages — invest in the refresh queue instead.`
  } else if (velocityExceeded) {
    reason = `${postsLast30d} new posts in the last 30 days is at or above the ${p.maxNewPostsPerMonth}/month ceiling for a local business. Sustained high-velocity publishing is a scaled-content risk pattern — pause new posts.`
  }

  return {
    coveragePct,
    universeSize: universe.length,
    coveredCount: covered,
    saturated,
    postsLast30d,
    velocityExceeded,
    allowNewPosts: !saturated && !velocityExceeded,
    reason,
  }
}

// ---- Reconciliation gate -------------------------------------------------------

const MISSING_GSC_REASON =
  'No Search Console rows exist for this page — status is unknown, not dead. Never prune on absent data.'

/** Post-audit sanity check: recommendation counts must balance against page reality. */
export function reconcile(
  queue: RefreshRecommendation[],
  pages: PageLite[],
): ReconciliationResult {
  const resolved = resolvedPages(pages)
  const resolvedUrls = new Set(resolved.map((p) => p.url!))
  const failures: string[] = []

  const totalRecs = queue.length
  const resolvedPagesCount = resolved.length

  if (totalRecs > resolvedPagesCount) {
    failures.push(`Recommendations (${totalRecs}) exceed resolved pages (${resolvedPagesCount})`)
  }

  const unknownPages = resolved.filter((p) => {
    const rec = queue.find((r) => r.path === p.url)
    return rec?.action === 'insufficient_data' && rec.reason.includes(MISSING_GSC_REASON)
  }).length

  const insufficientMissingGsc = queue.filter(
    (r) => r.action === 'insufficient_data' && r.reason.includes(MISSING_GSC_REASON),
  ).length

  if (unknownPages !== insufficientMissingGsc) {
    failures.push(
      `Unknown pages (${unknownPages}) does not equal insufficient_data-for-missing-GSC (${insufficientMissingGsc})`,
    )
  }

  const unresolvedRecs = queue.filter((r) => !resolvedUrls.has(r.path))
  if (unresolvedRecs.length > 0) {
    failures.push(`${unresolvedRecs.length} recommendation(s) point at unresolved URLs`)
  }

  return {
    balanced: failures.length === 0,
    totalRecs,
    resolvedPages: resolvedPagesCount,
    unknownPages,
    insufficientMissingGsc,
    allRecsResolved: unresolvedRecs.length === 0,
    failures,
  }
}

// ---- Consolidate target validation (async, lives outside pure engine) ------------

export type UrlVerifier = (url: string) => Promise<boolean>

/** Default verifier: HEAD request, fall back to GET; true only on 200. */
export async function defaultUrlVerifier(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000), redirect: 'follow' })
    if (head.status === 200) return true
    if (head.status === 405 || head.status === 501) {
      const get = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000), redirect: 'follow' })
      return get.status === 200
    }
    return false
  } catch {
    return false
  }
}

/**
 * Suppress consolidate recommendations whose proposed 301 target does not
 * return HTTP 200. Runs after evaluateSite in the API layer.
 */
export async function validateConsolidateTargets(
  queue: RefreshRecommendation[],
  verify: UrlVerifier = defaultUrlVerifier,
): Promise<RefreshRecommendation[]> {
  const out: RefreshRecommendation[] = []
  for (const rec of queue) {
    if (rec.action !== 'consolidate' || !rec.consolidateInto) {
      out.push(rec)
      continue
    }
    const ok = await verify(rec.consolidateInto)
    if (ok) {
      out.push(rec)
    } else {
      out.push({
        ...rec,
        action: 'insufficient_data',
        triggers: [
          {
            id: 'insufficient_data',
            reason: `Consolidate suppressed: proposed 301 target ${rec.consolidateInto} does not return HTTP 200.`,
          },
        ],
        reason: `Consolidate suppressed: proposed 301 target ${urlPath(rec.consolidateInto)} does not return HTTP 200.`,
        consolidateInto: null,
      })
    }
  }
  return out
}
