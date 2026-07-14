/**
 * Phase 3 — the opportunity-scoring algorithm.
 *
 * Turns raw GSC/GA4 rows into ranked, diagnosed opportunities plus real Overview
 * metrics, using the signals the PRD (§5.2) calls for:
 *   - striking distance   (pages in position ~5-20: cheap wins Google already ranks)
 *   - CTR gap             (impressions with CTR below the position benchmark → meta fix)
 *   - content decay       (clicks falling period-over-period → refresh)
 *   - cannibalization     (multiple pages ranking for one query → consolidate)
 *
 * Two independent windows are used:
 *   - Opportunities are always diagnosed on the most-recent 28 days (vs the prior
 *     28) — the actionable horizon. They do NOT change with the Overview date
 *     toggle, so "act now" work stays stable.
 *   - Metrics / trend / score / losing pages are computed for a selectable
 *     `periodDays` window (28 / 90 / 365), which is what the Overview date range
 *     dropdown controls. Prior-period deltas appear only when a full prior window
 *     of data exists; otherwise the delta reads "—".
 *
 * The algorithm is fully deterministic: same rows in → identical output out,
 * every run. Every ranked list breaks ties on a stable key (score, then path,
 * then title) so ordering never depends on Map/insertion order.
 */

// ---- Inputs (minimal shapes; Prisma rows satisfy these) --------------------

export type GscInput = {
  date: Date
  page: string
  query: string | null
  clicks: number
  impressions: number
  position: number
}
export type Ga4Input = {
  date: Date
  landingPage: string
  sessions: number
  engagementRate: number
  conversions: number
}
export type PageInput = { slug: string; title: string | null }

// ---- Outputs ---------------------------------------------------------------

export type GeneratedOpportunity = {
  title: string
  page: string
  why: string
  expected: string
  impact: 'High' | 'Medium' | 'Low'
  confidence: number
  effort: 'Low' | 'Medium' | 'High'
  source: 'GSC' | 'GA4' | 'Crawl' | 'Competitor' | 'Manual'
  type: 'Metadata' | 'Content' | 'Internal links' | 'Schema' | 'Technical' | 'New page'
  score: number
  // Stable identity across re-audits: signal + page (or query). Same underlying
  // issue → same fingerprint every run, so the checklist merges instead of resets.
  fingerprint: string
}
export type MetricCard = { label: string; value: string; delta: string; up: boolean }
export type LosingPage = { path: string; delta: string }
export type ScorePart = { label: string; val: number; pct: string; color: string }
export type SeoScore = { overall: number; delta: number }
export type TrendMetricKey = 'clicks' | 'impressions' | 'position' | 'conversions' | 'engagementRate'
export type TrendSeries = {
  labels: string[]
  current: Record<TrendMetricKey, number[]>
  previous: Record<TrendMetricKey, number[]>
}
export type Trend = { current: number[]; previous: number[]; labels: string[] }
/** A real striking-distance query: we have impressions but aren't winning yet. */
export type QueryOpp = { query: string; impressions: number; position: number }
export type ScoringResult = {
  opportunities: GeneratedOpportunity[]
  metrics: MetricCard[]
  losingPages: LosingPage[]
  scoreParts: ScorePart[]
  seoScore: SeoScore
  trend: Trend
  trendSeries: TrendSeries
  queryOpps: QueryOpp[]
  periodDays: number
  hasPriorPeriod: boolean
}

export type ScoringOptions = {
  /** Window (in days) for metrics/trend/score. Opportunities always use 28. */
  periodDays?: number
}

// ---- Benchmark curves ------------------------------------------------------

// Approximate organic CTR by average position, from public aggregate studies.
// Used only as the reference for the CTR-gap signal; exact values vary by SERP.
const CTR_CURVE: Array<[number, number]> = [
  [1, 0.3], [2, 0.16], [3, 0.11], [4, 0.08], [5, 0.061], [6, 0.049],
  [7, 0.04], [8, 0.033], [9, 0.028], [10, 0.025], [11, 0.021], [12, 0.018],
  [13, 0.016], [15, 0.013], [20, 0.009], [30, 0.005], [50, 0.002], [100, 0.001],
]

export function benchmarkCtr(pos: number): number {
  if (pos <= CTR_CURVE[0][0]) return CTR_CURVE[0][1]
  const last = CTR_CURVE[CTR_CURVE.length - 1]
  if (pos >= last[0]) return last[1]
  for (let i = 1; i < CTR_CURVE.length; i++) {
    const [p1, c1] = CTR_CURVE[i]
    const [p0, c0] = CTR_CURVE[i - 1]
    if (pos <= p1) {
      const t = (pos - p0) / (p1 - p0)
      return c0 + (c1 - c0) * t
    }
  }
  return last[1]
}

// How much value there is in pushing a page up, by current position. Peaks in
// the 8-12 band (relevant but not yet winning), tapers to ~0 for top spots
// (already there) and deep results (too far to move cheaply).
function upliftPotential(pos: number): number {
  if (pos <= 3) return 0.15
  if (pos <= 5) return 0.55
  if (pos <= 8) return 0.9
  if (pos <= 12) return 1.0
  if (pos <= 15) return 0.8
  if (pos <= 20) return 0.5
  if (pos <= 30) return 0.2
  return 0.05
}

function ctrGapFactor(actualCtr: number, pos: number): number {
  const bench = benchmarkCtr(pos)
  if (bench <= 0) return 0
  return clamp((bench - actualCtr) / bench, 0, 1)
}

// ---- Small helpers ---------------------------------------------------------

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const DAY = 24 * 60 * 60 * 1000
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)

/** min/max of a big array via a loop — spreading 100k+ items into Math.max
 *  overflows the call stack, so never use `Math.max(...arr)` on GSC rows. */
function extentMs<T>(rows: T[], get: (r: T) => number): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const r of rows) {
    const v = get(r)
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}

import { normalizeUrl } from './url.ts'

/** Canonical page identity — delegates to normalizeUrl (single source of truth). */
export function pagePath(url: string): string {
  return normalizeUrl(url)
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(Math.round(n))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDay = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`

function pctDelta(cur: number, prev: number): { delta: string; up: boolean } {
  if (prev <= 0) return { delta: '—', up: true }
  const pct = ((cur - prev) / prev) * 100
  const sign = pct >= 0 ? '+' : '−'
  return { delta: `${sign}${Math.abs(pct).toFixed(1)}%`, up: pct >= 0 }
}

type Agg = { clicks: number; impr: number; posw: number }
const emptyAgg = (): Agg => ({ clicks: 0, impr: 0, posw: 0 })
const aggPos = (a: Agg) => (a.impr > 0 ? a.posw / a.impr : 0)
const aggCtr = (a: Agg) => (a.impr > 0 ? a.clicks / a.impr : 0)

/** Aggregate page-level rows (query === null) by normalized path within [start,end]. */
function aggregatePages(gsc: GscInput[], start: Date, end: Date): Map<string, Agg> {
  const out = new Map<string, Agg>()
  for (const r of gsc) {
    if (r.query !== null) continue
    if (r.date < start || r.date > end) continue
    const path = pagePath(r.page)
    const a = out.get(path) ?? emptyAgg()
    a.clicks += r.clicks
    a.impr += r.impressions
    a.posw += r.position * r.impressions
    out.set(path, a)
  }
  return out
}

// ---- Main ------------------------------------------------------------------

export function runScoring(
  gsc: GscInput[],
  ga4: Ga4Input[],
  pages: PageInput[],
  opts: ScoringOptions = {},
): ScoringResult {
  const periodDays = opts.periodDays ?? 28
  if (gsc.length === 0) {
    return {
      opportunities: [],
      metrics: [],
      losingPages: [],
      scoreParts: [],
      seoScore: { overall: 0, delta: 0 },
      trend: { current: [], previous: [], labels: [] },
      trendSeries: emptyTrendSeries(28),
      queryOpps: [],
      periodDays,
      hasPriorPeriod: false,
    }
  }

  const ext = extentMs(gsc, (r) => r.date.getTime())
  const maxDate = new Date(ext.max)
  const minDate = new Date(ext.min)

  // Metric window (selectable): most-recent `periodDays` = current, prior = the
  // `periodDays` before that.
  const metCurStart = addDays(maxDate, -(periodDays - 1))
  const metPrevEnd = addDays(maxDate, -periodDays)
  const metPrevStart = addDays(maxDate, -(2 * periodDays - 1))
  const hasPriorPeriod = minDate.getTime() <= metPrevStart.getTime() + DAY

  const metCur = aggregatePages(gsc, metCurStart, maxDate)
  const metPrev = aggregatePages(gsc, metPrevStart, metPrevEnd)

  // Opportunity window (fixed 28 days) — the actionable horizon.
  const OPP_DAYS = 28
  const oppCurStart = addDays(maxDate, -(OPP_DAYS - 1))
  const oppPrevEnd = addDays(maxDate, -OPP_DAYS)
  const oppPrevStart = addDays(maxDate, -(2 * OPP_DAYS - 1))
  const oppHasPrior = minDate.getTime() <= oppPrevStart.getTime() + DAY
  const oppMonthly = 30 / OPP_DAYS

  const curPages = aggregatePages(gsc, oppCurStart, maxDate)
  const prevPages = aggregatePages(gsc, oppPrevStart, oppPrevEnd)

  const inOppCur = (d: Date) => d >= oppCurStart && d <= maxDate

  // Per-path top query + per-query paths (opportunity window, page+query rows).
  const pathQuery = new Map<string, Map<string, Agg>>()
  const queryPaths = new Map<string, Map<string, Agg>>()
  const queryAgg = new Map<string, Agg>() // site-wide per-query, for query opportunities
  for (const r of gsc) {
    if (r.query === null || !inOppCur(r.date)) continue
    const path = pagePath(r.page)
    const pq = pathQuery.get(path) ?? new Map<string, Agg>()
    const a = pq.get(r.query) ?? emptyAgg()
    a.clicks += r.clicks
    a.impr += r.impressions
    a.posw += r.position * r.impressions
    pq.set(r.query, a)
    pathQuery.set(path, pq)

    const qp = queryPaths.get(r.query) ?? new Map<string, Agg>()
    const b = qp.get(path) ?? emptyAgg()
    b.clicks += r.clicks
    b.impr += r.impressions
    b.posw += r.position * r.impressions
    qp.set(path, b)
    queryPaths.set(r.query, qp)

    const q = queryAgg.get(r.query) ?? emptyAgg()
    q.clicks += r.clicks
    q.impr += r.impressions
    q.posw += r.position * r.impressions
    queryAgg.set(r.query, q)
  }

  const topQueryFor = (path: string): { query: string; pos: number; impr: number } | null => {
    const pq = pathQuery.get(path)
    if (!pq) return null
    let best: { query: string; pos: number; impr: number } | null = null
    for (const [query, a] of pq) {
      // Tie-break on query text so the "top" query is deterministic.
      if (!best || a.impr > best.impr || (a.impr === best.impr && query < best.query)) {
        best = { query, pos: aggPos(a), impr: a.impr }
      }
    }
    return best
  }

  const opportunities: GeneratedOpportunity[] = []

  for (const [path, cur] of curPages) {
    const impr = cur.impr
    const pos = aggPos(cur)
    const ctr = aggCtr(cur)
    const top = topQueryFor(path)
    const prev = prevPages.get(path)

    // Leave clearly-winning pages alone (position 1-4 with healthy CTR).
    const winning = pos > 0 && pos <= 4 && ctr >= benchmarkCtr(pos) * 0.8

    // --- CTR gap → metadata rewrite ---
    const gap = ctrGapFactor(ctr, pos)
    if (!winning && impr >= 100 && gap >= 0.3 && pos <= 20) {
      // Assume a rewrite closes ~60% of the gap to benchmark, not 100%.
      const gainPerPeriod = Math.max(0, impr * (benchmarkCtr(pos) - ctr)) * 0.6
      const monthlyGain = Math.round(gainPerPeriod * oppMonthly)
      if (monthlyGain >= 8) {
        opportunities.push({
          // The target page lives in `page` — titles describe the action only.
          title: top ? `Rewrite title & meta for "${top.query}"` : 'Rewrite title & meta to lift CTR',
          page: path,
          why: `${fmtCompact(impr)} impressions at ${(ctr * 100).toFixed(1)}% CTR — position ${pos.toFixed(1)} typically earns ~${(benchmarkCtr(pos) * 100).toFixed(1)}%${top ? ` (top query: "${top.query}")` : ''}`,
          expected: `+${monthlyGain} clicks/mo`,
          impact: impactFromClicks(monthlyGain),
          confidence: confidenceFrom(impr, gap),
          effort: 'Low',
          source: 'GSC',
          type: 'Metadata',
          score: impr * gap,
          fingerprint: `ctrgap:${path}`,
        })
      }
    }

    // --- Striking distance → on-page / content ---
    if (!winning && pos >= 5 && pos <= 20 && impr >= 80) {
      // Model a realistic move to ~position 5 (not #1), capturing ~half of the
      // resulting CTR headroom — an achievable target, not a best case.
      const targetCtr = benchmarkCtr(5)
      const gainPerPeriod = Math.max(0, impr * (targetCtr - ctr)) * 0.5
      const monthlyGain = Math.round(gainPerPeriod * oppMonthly)
      const score = impr * upliftPotential(pos)
      if (monthlyGain >= 10) {
        opportunities.push({
          title: top ? `Improve ranking for "${top.query}"` : 'Improve striking-distance ranking',
          page: path,
          why: `${top ? `"${top.query}" ` : ''}at position ${pos.toFixed(1)} with ${fmtCompact(impr)} impressions — striking distance, Google already ranks it`,
          expected: `+${monthlyGain} clicks/mo`,
          impact: impactFromClicks(monthlyGain),
          confidence: confidenceFrom(impr, upliftPotential(pos)),
          effort: 'Medium',
          source: 'GSC',
          type: 'Content',
          score,
          fingerprint: `strike:${path}`,
        })
      }
    }

    // --- Content decay → refresh ---
    if (oppHasPrior && prev) {
      const loss = prev.clicks - cur.clicks
      const ratio = prev.clicks > 0 ? loss / prev.clicks : 0
      if (loss >= 12 && ratio >= 0.25 && prev.clicks >= 20) {
        opportunities.push({
          title: 'Refresh declining content',
          page: path,
          why: `Clicks fell from ${prev.clicks} to ${cur.clicks} vs the prior 28 days (−${Math.round(ratio * 100)}%)`,
          expected: `Recover ~${Math.round(loss * oppMonthly)} clicks/mo`,
          impact: impactFromClicks(loss * oppMonthly),
          confidence: confidenceFrom(prev.impr, ratio),
          effort: 'Medium',
          source: 'GSC',
          type: 'Content',
          score: loss * 10,
          fingerprint: `decay:${path}`,
        })
      }
    }
  }

  // --- Cannibalization → consolidate/redirect ---
  const cannibal: GeneratedOpportunity[] = []
  for (const [query, paths] of queryPaths) {
    const ranked = [...paths.entries()]
      .map(([path, a]) => ({ path, impr: a.impr, pos: aggPos(a) }))
      .filter((p) => p.impr >= 30 && p.pos <= 20)
    if (ranked.length >= 2) {
      const totalImpr = ranked.reduce((s, p) => s + p.impr, 0)
      ranked.sort((a, b) => b.impr - a.impr || a.path.localeCompare(b.path))
      cannibal.push({
        title: `Resolve cannibalization for "${query}"`,
        page: `${ranked[0].path} +${ranked.length - 1} more`,
        why: `${ranked.length} pages compete for "${query}" (${fmtCompact(totalImpr)} impressions) — consolidate or redirect to concentrate authority`,
        expected: 'Consolidate ranking signals',
        impact: totalImpr >= 500 ? 'Medium' : 'Low',
        confidence: confidenceFrom(totalImpr, 0.6),
        effort: 'Medium',
        source: 'GSC',
        type: 'Technical',
        score: totalImpr * 0.4,
        fingerprint: `cannibal:${query}`,
      })
    }
  }
  cannibal.sort((a, b) => b.score - a.score || a.page.localeCompare(b.page))
  opportunities.push(...cannibal.slice(0, 5))

  // Deterministic final ordering: score desc, then page, then title.
  opportunities.sort(
    (a, b) => b.score - a.score || a.page.localeCompare(b.page) || a.title.localeCompare(b.title),
  )
  const top = opportunities.slice(0, 30)

  // Real "query opportunities": striking-distance queries (pos 6-20) with volume.
  const queryOpps: QueryOpp[] = [...queryAgg.entries()]
    .map(([query, a]) => ({ query, impressions: a.impr, position: aggPos(a) }))
    .filter((q) => q.position >= 6 && q.position <= 20 && q.impressions >= 50)
    .sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query))
    .slice(0, 6)

  const { scoreParts, seoScore } = computeScore(metCur, metPrev, ga4, pages.length, hasPriorPeriod, periodDays)

  const trend = computeTrend(gsc, maxDate, periodDays)
  const trendSeries = computeTrendSeries(gsc, ga4, maxDate, periodDays)

  return {
    opportunities: top,
    metrics: computeMetrics(metCur, metPrev, ga4, hasPriorPeriod, periodDays),
    losingPages: computeLosingPages(metCur, metPrev),
    scoreParts,
    seoScore,
    trend,
    trendSeries,
    queryOpps,
    periodDays,
    hasPriorPeriod,
  }
}

// ---- Impact / confidence heuristics ----------------------------------------

function impactFromClicks(monthlyClicks: number): 'High' | 'Medium' | 'Low' {
  if (monthlyClicks >= 120) return 'High'
  if (monthlyClicks >= 40) return 'Medium'
  return 'Low'
}

function confidenceFrom(impressions: number, signalStrength: number): number {
  const volume = 12 * Math.log10(Math.max(impressions, 10) / 50) // more data → more confident
  return clamp(Math.round(66 + volume + signalStrength * 10), 60, 96)
}

// ---- Overview metrics + losing pages ---------------------------------------

function totals(pages: Map<string, Agg>): Agg {
  const t = emptyAgg()
  for (const a of pages.values()) {
    t.clicks += a.clicks
    t.impr += a.impr
    t.posw += a.posw
  }
  return t
}

function computeMetrics(
  curPages: Map<string, Agg>,
  prevPages: Map<string, Agg>,
  ga4: Ga4Input[],
  hasPrior: boolean,
  periodDays: number,
): MetricCard[] {
  const cur = totals(curPages)
  const prev = totals(prevPages)
  const { cur: ga4Cur, prev: ga4Prev } = ga4Periods(ga4, periodDays)

  const noDelta = { delta: '—', up: true }
  const clicksD = hasPrior ? pctDelta(cur.clicks, prev.clicks) : noDelta
  const imprD = hasPrior ? pctDelta(cur.impr, prev.impr) : noDelta
  const curPos = aggPos(cur)
  const prevPos = aggPos(prev)
  // Position: lower is better, so an improvement (decrease) is "up"/green.
  const posD = hasPrior && prevPos > 0
    ? { delta: `${curPos <= prevPos ? '−' : '+'}${Math.abs(curPos - prevPos).toFixed(1)}`, up: curPos <= prevPos }
    : noDelta
  const convD = hasPrior ? pctDelta(ga4Cur.conversions, ga4Prev.conversions) : noDelta
  const engCur = ga4Cur.sessions > 0 ? ga4Cur.engw / ga4Cur.sessions : 0
  const engPrev = ga4Prev.sessions > 0 ? ga4Prev.engw / ga4Prev.sessions : 0
  const engD = hasPrior && engPrev > 0 ? pctDelta(engCur, engPrev) : noDelta

  return [
    { label: 'Organic clicks', value: cur.clicks.toLocaleString(), delta: clicksD.delta, up: clicksD.up },
    { label: 'Impressions', value: fmtCompact(cur.impr), delta: imprD.delta, up: imprD.up },
    { label: 'Avg. position', value: curPos.toFixed(1), delta: posD.delta, up: posD.up },
    { label: 'Organic conversions', value: ga4Cur.conversions.toLocaleString(), delta: convD.delta, up: convD.up },
    { label: 'Avg. engagement rate', value: `${(engCur * 100).toFixed(0)}%`, delta: engD.delta, up: engD.up },
  ]
}

function computeLosingPages(curPages: Map<string, Agg>, prevPages: Map<string, Agg>): LosingPage[] {
  const rows: { path: string; loss: number; pct: number }[] = []
  for (const [path, prev] of prevPages) {
    if (prev.clicks < 10) continue
    const cur = curPages.get(path)?.clicks ?? 0
    const loss = prev.clicks - cur
    if (loss > 0) rows.push({ path, loss, pct: loss / prev.clicks })
  }
  rows.sort((a, b) => b.loss - a.loss || a.path.localeCompare(b.path))
  return rows.slice(0, 3).map((r) => ({ path: r.path, delta: `−${Math.round(r.pct * 100)}%` }))
}

// ---- SEO Operating Score (real, from GSC/GA4/Page data) ---------------------

type Ga4Period = { sessions: number; conversions: number; engw: number }
function ga4Periods(ga4: Ga4Input[], periodDays: number): { cur: Ga4Period; prev: Ga4Period } {
  const cur: Ga4Period = { sessions: 0, conversions: 0, engw: 0 }
  const prev: Ga4Period = { sessions: 0, conversions: 0, engw: 0 }
  if (!ga4.length) return { cur, prev }
  const gMax = new Date(extentMs(ga4, (r) => r.date.getTime()).max)
  const gCurStart = addDays(gMax, -(periodDays - 1))
  const gPrevEnd = addDays(gMax, -periodDays)
  const gPrevStart = addDays(gMax, -(2 * periodDays - 1))
  for (const r of ga4) {
    const bucket =
      r.date >= gCurStart && r.date <= gMax
        ? cur
        : r.date >= gPrevStart && r.date <= gPrevEnd
          ? prev
          : null
    if (!bucket) continue
    bucket.sessions += r.sessions
    bucket.conversions += r.conversions
    bucket.engw += r.engagementRate * r.sessions
  }
  return { cur, prev }
}

const ACCENT = '#3b5bdb'

/** Composite 0-100 score from four real sub-signals. */
function scoreParts(
  pages: Map<string, Agg>,
  ga4: Ga4Period,
  totalSyncedPages: number,
): { parts: ScorePart[]; overall: number } {
  const t = totals(pages)
  const avgPos = aggPos(t)
  const siteCtr = aggCtr(t)

  // Content: rank health (position) blended with CTR vs the position benchmark.
  const positionScore = clamp(100 - (avgPos - 1) * 3.5, 20, 100)
  const bench = benchmarkCtr(avgPos)
  const ctrHealth = bench > 0 ? clamp((siteCtr / bench) * 100, 0, 100) : 50
  const content = Math.round(0.6 * positionScore + 0.4 * ctrHealth)

  // Technical: share of synced pages that are actually visible in search.
  const visible = pages.size
  const technical =
    totalSyncedPages > 0 ? Math.round(clamp((visible / totalSyncedPages) * 100, 0, 100)) : 50

  // Authority: organic click volume on a log scale (proxy — no backlink data).
  const authority = clamp(
    Math.round((Math.log10(t.clicks + 1) / Math.log10(50_000)) * 100),
    0,
    100,
  )

  // Experience: GA4 session-weighted engagement rate.
  const engagement = ga4.sessions > 0 ? ga4.engw / ga4.sessions : 0
  const experience = Math.round(clamp(engagement * 100, 0, 100))

  const overall = Math.round(0.35 * content + 0.25 * technical + 0.2 * authority + 0.2 * experience)
  return {
    overall,
    parts: [
      { label: 'Content', val: content, pct: `${content}%`, color: ACCENT },
      { label: 'Technical', val: technical, pct: `${technical}%`, color: ACCENT },
      { label: 'Authority', val: authority, pct: `${authority}% (GSC clicks, not backlinks)`, color: ACCENT },
      { label: 'Experience', val: experience, pct: `${experience}%`, color: ACCENT },
    ],
  }
}

function computeScore(
  curPages: Map<string, Agg>,
  prevPages: Map<string, Agg>,
  ga4: Ga4Input[],
  totalSyncedPages: number,
  hasPrior: boolean,
  periodDays: number,
): { scoreParts: ScorePart[]; seoScore: SeoScore } {
  const g = ga4Periods(ga4, periodDays)
  const now = scoreParts(curPages, g.cur, totalSyncedPages)
  const before = hasPrior ? scoreParts(prevPages, g.prev, totalSyncedPages) : now
  return {
    scoreParts: now.parts,
    seoScore: { overall: now.overall, delta: hasPrior ? now.overall - before.overall : 0 },
  }
}

/**
 * Daily organic clicks for the current and prior `periodDays` windows, aligned
 * by day index, plus 5 evenly-spaced date labels across the current window.
 */
function computeTrend(gsc: GscInput[], maxDate: Date, periodDays: number): Trend {
  const current = new Array(periodDays).fill(0)
  const previous = new Array(periodDays).fill(0)
  const curStart = addDays(maxDate, -(periodDays - 1))
  const prevStart = addDays(maxDate, -(2 * periodDays - 1))
  const dayIndex = (d: Date, start: Date) => Math.round((d.getTime() - start.getTime()) / DAY)
  for (const r of gsc) {
    if (r.query !== null) continue // page-level rows only, avoid double-counting
    const ci = dayIndex(r.date, curStart)
    if (ci >= 0 && ci < periodDays) current[ci] += r.clicks
    const pi = dayIndex(r.date, prevStart)
    if (pi >= 0 && pi < periodDays) previous[pi] += r.clicks
  }
  const labels = Array.from({ length: 5 }, (_, i) =>
    fmtDay(addDays(curStart, Math.round((i * (periodDays - 1)) / 4))),
  )
  return { current, previous, labels }
}

function emptyTrendSeries(periodDays: number): TrendSeries {
  const zero = () => new Array(periodDays).fill(0)
  return {
    labels: [],
    current: {
      clicks: zero(),
      impressions: zero(),
      position: zero(),
      conversions: zero(),
      engagementRate: zero(),
    },
    previous: {
      clicks: zero(),
      impressions: zero(),
      position: zero(),
      conversions: zero(),
      engagementRate: zero(),
    },
  }
}

/**
 * Per-metric daily series for current and prior windows (GSC + GA4).
 */
function computeTrendSeries(gsc: GscInput[], ga4: Ga4Input[], maxDate: Date, periodDays: number): TrendSeries {
  const curStart = addDays(maxDate, -(periodDays - 1))
  const prevStart = addDays(maxDate, -(2 * periodDays - 1))
  const dayIndex = (d: Date, start: Date) => Math.round((d.getTime() - start.getTime()) / DAY)

  const gscCur = {
    clicks: new Array(periodDays).fill(0),
    impressions: new Array(periodDays).fill(0),
    posw: new Array(periodDays).fill(0),
    imprForPos: new Array(periodDays).fill(0),
  }
  const gscPrev = {
    clicks: new Array(periodDays).fill(0),
    impressions: new Array(periodDays).fill(0),
    posw: new Array(periodDays).fill(0),
    imprForPos: new Array(periodDays).fill(0),
  }

  for (const r of gsc) {
    if (r.query !== null) continue
    const ci = dayIndex(r.date, curStart)
    if (ci >= 0 && ci < periodDays) {
      gscCur.clicks[ci] += r.clicks
      gscCur.impressions[ci] += r.impressions
      gscCur.posw[ci] += r.position * r.impressions
      gscCur.imprForPos[ci] += r.impressions
    }
    const pi = dayIndex(r.date, prevStart)
    if (pi >= 0 && pi < periodDays) {
      gscPrev.clicks[pi] += r.clicks
      gscPrev.impressions[pi] += r.impressions
      gscPrev.posw[pi] += r.position * r.impressions
      gscPrev.imprForPos[pi] += r.impressions
    }
  }

  const ga4Cur = {
    conversions: new Array(periodDays).fill(0),
    engw: new Array(periodDays).fill(0),
    sessions: new Array(periodDays).fill(0),
  }
  const ga4Prev = {
    conversions: new Array(periodDays).fill(0),
    engw: new Array(periodDays).fill(0),
    sessions: new Array(periodDays).fill(0),
  }

  for (const r of ga4) {
    const ci = dayIndex(r.date, curStart)
    if (ci >= 0 && ci < periodDays) {
      ga4Cur.conversions[ci] += r.conversions
      ga4Cur.sessions[ci] += r.sessions
      ga4Cur.engw[ci] += r.engagementRate * r.sessions
    }
    const pi = dayIndex(r.date, prevStart)
    if (pi >= 0 && pi < periodDays) {
      ga4Prev.conversions[pi] += r.conversions
      ga4Prev.sessions[pi] += r.sessions
      ga4Prev.engw[pi] += r.engagementRate * r.sessions
    }
  }

  const positionFrom = (posw: number[], impr: number[]) =>
    impr.map((i, idx) => (i > 0 ? posw[idx]! / i : 0))
  const engagementFrom = (engw: number[], sessions: number[]) =>
    sessions.map((s, idx) => (s > 0 ? engw[idx]! / s : 0))

  const labels = Array.from({ length: 5 }, (_, i) =>
    fmtDay(addDays(curStart, Math.round((i * (periodDays - 1)) / 4))),
  )

  return {
    labels,
    current: {
      clicks: gscCur.clicks,
      impressions: gscCur.impressions,
      position: positionFrom(gscCur.posw, gscCur.imprForPos),
      conversions: ga4Cur.conversions,
      engagementRate: engagementFrom(ga4Cur.engw, ga4Cur.sessions),
    },
    previous: {
      clicks: gscPrev.clicks,
      impressions: gscPrev.impressions,
      position: positionFrom(gscPrev.posw, gscPrev.imprForPos),
      conversions: ga4Prev.conversions,
      engagementRate: engagementFrom(ga4Prev.engw, ga4Prev.sessions),
    },
  }
}
