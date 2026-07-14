/**
 * Content Engine trigger rules — unit + integration tests.
 * Run: npx tsx --test tests/contentEngine.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPageSignals,
  computeDataSufficiency,
  computeGovernor,
  detectStaleYearReferences,
  evaluatePage,
  evaluateSite,
  intentOf,
  priorityScore,
  ruleConsolidate,
  ruleCtrBelowCurve,
  ruleCtrDecay,
  ruleLeaveAlone,
  rulePrune,
  ruleRewrite,
  ruleStrikingDistance,
  ruleStaleReferences,
  type GscRowLite,
  type PageLite,
  type PageSignals,
} from '../src/contentEngine.ts'
import { CONTENT_POLICY } from '../src/contentPolicy.ts'

const P = CONTENT_POLICY
const NOW = new Date('2026-07-13T00:00:00Z')
const HOST = 'https://x.com'

function pg(slug: string, path: string, wpId: number, over: Partial<PageLite> = {}): PageLite {
  const p = path.startsWith('/') ? path : `/${path}`
  return {
    slug,
    title: over.title ?? slug,
    type: over.type ?? 'page',
    contentHtml: over.contentHtml ?? '<p>Updated 2026</p>',
    url: `${HOST}${p}`,
    wpId,
    ...over,
  }
}

/** PageSignals factory with healthy defaults; override per case. */
function sig(over: Partial<PageSignals> = {}): PageSignals {
  return {
    path: `${HOST}/example`,
    wpId: 1,
    title: 'Example',
    pageType: 'page',
    primaryKeyword: 'example keyword',
    position: 12,
    clicks: 100,
    impressions: 1000,
    ctr: 0.1,
    expectedCtr: 0.018,
    prevClicks: 100,
    prevImpressions: 1000,
    hasPrev: true,
    lowConfidence: false,
    conversions: 0,
    staleYears: [],
    competingPaths: [],
    hadTrafficInPruneWindow: true,
    hasAnyGscRows: true,
    ...over,
  }
}

// ---- leave_alone -------------------------------------------------------------

test('leave_alone fires at position 1-3 with stable traffic', () => {
  const t = ruleLeaveAlone(sig({ position: 2, clicks: 500, prevClicks: 480 }), P)
  assert.ok(t)
  assert.equal(t.id, 'leave_alone_stable')
})

test('leave_alone does NOT fire at position 4', () => {
  assert.equal(ruleLeaveAlone(sig({ position: 4 }), P), null)
})

test('leave_alone does NOT fire when clicks decayed 30%+', () => {
  assert.equal(ruleLeaveAlone(sig({ position: 2, clicks: 60, prevClicks: 100 }), P), null)
})

test('leave_alone does NOT fire with zero impressions', () => {
  assert.equal(ruleLeaveAlone(sig({ position: 2, impressions: 0 }), P), null)
})

// ---- prune ---------------------------------------------------------------------

test('prune fires on zero clicks and zero impressions for 12 months', () => {
  const t = rulePrune(sig({ clicks: 0, impressions: 0, hadTrafficInPruneWindow: false }), P)
  assert.ok(t)
  assert.equal(t.id, 'prune_dead')
})

test('prune does NOT fire when the page had any traffic in the window', () => {
  assert.equal(rulePrune(sig({ clicks: 0, impressions: 0, hadTrafficInPruneWindow: true }), P), null)
})

// ---- consolidate ----------------------------------------------------------------

test('consolidate fires when 2+ URLs compete for the primary keyword', () => {
  const t = ruleConsolidate(sig({ competingPaths: ['/other-page'] }))
  assert.ok(t)
  assert.equal(t.id, 'consolidate_cannibal')
  assert.match(t.reason, /\/other-page/)
})

test('consolidate does NOT fire without competitors', () => {
  assert.equal(ruleConsolidate(sig({ competingPaths: [] })), null)
})

// ---- rewrite --------------------------------------------------------------------

test('rewrite fires above position 30', () => {
  const t = ruleRewrite(sig({ position: 35 }), P)
  assert.ok(t)
  assert.equal(t.id, 'rewrite_deep')
})

test('rewrite does NOT fire at position 30 or better', () => {
  assert.equal(ruleRewrite(sig({ position: 30 }), P), null)
  assert.equal(ruleRewrite(sig({ position: 12 }), P), null)
})

test('rewrite does NOT fire with zero impressions (no demand)', () => {
  assert.equal(ruleRewrite(sig({ position: 45, impressions: 0 }), P), null)
})

// ---- striking distance --------------------------------------------------------------

test('striking distance fires inside 5-20', () => {
  assert.ok(ruleStrikingDistance(sig({ position: 5 }), P))
  assert.ok(ruleStrikingDistance(sig({ position: 20 }), P))
  assert.ok(ruleStrikingDistance(sig({ position: 12.4 }), P))
})

test('striking distance does NOT fire outside 5-20', () => {
  assert.equal(ruleStrikingDistance(sig({ position: 4.9 }), P), null)
  assert.equal(ruleStrikingDistance(sig({ position: 20.1 }), P), null)
  assert.equal(ruleStrikingDistance(sig({ position: null }), P), null)
})

// ---- CTR decay -------------------------------------------------------------------------

test('ctr_decay fires when clicks drop 30%+ YoY and impressions hold', () => {
  const t = ruleCtrDecay(sig({ clicks: 60, prevClicks: 100, impressions: 1000, prevImpressions: 1000 }), P)
  assert.ok(t)
  assert.equal(t.id, 'ctr_decay')
})

test('ctr_decay fires when impressions actually rose', () => {
  assert.ok(ruleCtrDecay(sig({ clicks: 60, prevClicks: 100, impressions: 1500, prevImpressions: 1000 }), P))
})

test('ctr_decay does NOT fire on a 20% drop', () => {
  assert.equal(ruleCtrDecay(sig({ clicks: 80, prevClicks: 100, impressions: 1000, prevImpressions: 1000 }), P), null)
})

test('ctr_decay does NOT fire when impressions collapsed too (ranking loss, not CTR)', () => {
  assert.equal(ruleCtrDecay(sig({ clicks: 60, prevClicks: 100, impressions: 400, prevImpressions: 1000 }), P), null)
})

test('ctr_decay does NOT fire without a comparison period', () => {
  assert.equal(ruleCtrDecay(sig({ hasPrev: false, prevClicks: 0 }), P), null)
})

// ---- CTR below curve -------------------------------------------------------------------

test('ctr_below_curve fires when CTR is materially below expectations', () => {
  // expected 6.1% at pos 5; actual 2% < 70% of expected
  const t = ruleCtrBelowCurve(sig({ position: 5, impressions: 500, ctr: 0.02, expectedCtr: 0.061 }), P)
  assert.ok(t)
  assert.equal(t.id, 'ctr_below_curve')
})

test('ctr_below_curve does NOT fire when CTR is near the curve', () => {
  assert.equal(ruleCtrBelowCurve(sig({ position: 5, impressions: 500, ctr: 0.05, expectedCtr: 0.061 }), P), null)
})

test('ctr_below_curve does NOT fire below the impressions floor', () => {
  assert.equal(ruleCtrBelowCurve(sig({ position: 5, impressions: 50, ctr: 0.001, expectedCtr: 0.061 }), P), null)
})

// ---- stale references ----------------------------------------------------------------------

test('stale year detection flags years older than 18 months', () => {
  assert.deepEqual(detectStaleYearReferences('<p>Our 2023 pricing guide (updated 2024)</p>', NOW, 18), [2023, 2024])
})

test('stale year detection ignores recent years and non-years', () => {
  assert.deepEqual(detectStaleYearReferences('<p>Updated for 2026. Costs $2,500. 60 minutes.</p>', NOW, 18), [])
  assert.deepEqual(detectStaleYearReferences('<p>As of 2025 this holds.</p>', NOW, 18), [])
  assert.deepEqual(detectStaleYearReferences(null, NOW, 18), [])
})

test('stale_references rule fires only when stale years exist', () => {
  assert.ok(ruleStaleReferences(sig({ staleYears: [2023] }), P))
  assert.equal(ruleStaleReferences(sig({ staleYears: [] }), P), null)
})

// ---- precedence ----------------------------------------------------------------------------

test('position 2 with stable traffic returns leave_alone even when CTR is below curve', () => {
  const rec = evaluatePage(
    sig({ position: 2, clicks: 500, prevClicks: 500, impressions: 20000, ctr: 0.025, expectedCtr: 0.16 }),
    P,
    NOW,
  )
  assert.ok(rec)
  assert.equal(rec.action, 'leave_alone')
  assert.ok(rec.reviewAfter, 'leave_alone must carry a review date')
})

test('a healthy mid-table page with no triggers returns null (no recommendation)', () => {
  const rec = evaluatePage(
    sig({ position: 25, clicks: 20, prevClicks: 21, impressions: 2000, ctr: 0.01, expectedCtr: 0.007 }),
    P,
    NOW,
  )
  assert.equal(rec, null)
})

test('refresh action collects multiple fired refresh triggers', () => {
  const rec = evaluatePage(
    sig({ position: 8, impressions: 2000, ctr: 0.001, expectedCtr: 0.033, staleYears: [2023], clicks: 2, prevClicks: 2 }),
    P,
    NOW,
  )
  assert.ok(rec)
  assert.equal(rec.action, 'refresh')
  const ids = rec.triggers.map((t) => t.id)
  assert.ok(ids.includes('striking_distance'))
  assert.ok(ids.includes('ctr_below_curve'))
  assert.ok(ids.includes('stale_references'))
})

// ---- prioritization --------------------------------------------------------------------------

test('intent classification: transactional > local > informational', () => {
  assert.equal(intentOf('botox cost nashville', P), 'transactional')
  assert.equal(intentOf('botox nashville', P), 'local')
  assert.equal(intentOf('what is botox made of', P), 'informational')
  assert.equal(intentOf(null, P), 'informational')
})

test('a converting transactional page outranks a browser page with 10x traffic', () => {
  const buyer = sig({ conversions: 40, clicks: 200 })
  const browser = sig({ conversions: 0, clicks: 2000 })
  const a = priorityScore(buyer, 'refresh', 'Low', 50, 'transactional', P)
  const b = priorityScore(browser, 'refresh', 'Low', 50, 'informational', P)
  assert.ok(a > b, `expected buyer priority ${a} > browser ${b}`)
})

test('cheap title/meta fixes surface above heavy rewrites at equal value', () => {
  const s = sig({})
  const cheap = priorityScore(s, 'refresh', 'Low', 30, 'local', P)
  const heavy = priorityScore(s, 'rewrite', 'High', 30, 'local', P)
  assert.ok(cheap > heavy)
})

// ---- topic supply governor --------------------------------------------------------------------

const pagesFor = (slugs: string[]): PageLite[] =>
  slugs.map((slug, i) => pg(slug, `/${slug}`, i + 1))

test('90% keyword coverage → saturated, zero new posts allowed', () => {
  const queries = [
    ...Array.from({ length: 18 }, (_, i) => ({ query: `covered term ${i}`, impressions: 100, position: 5 })),
    { query: 'uncovered thing one', impressions: 100, position: 45 },
    { query: 'uncovered thing two', impressions: 100, position: 50 },
  ]
  const g = computeGovernor(queries, pagesFor(['home']), 2, P)
  assert.equal(g.coveragePct, 90)
  assert.equal(g.saturated, true)
  assert.equal(g.allowNewPosts, false)
  assert.match(g.reason ?? '', /cannibal/i)
})

test('50% coverage → not saturated, new posts allowed', () => {
  const queries = [
    ...Array.from({ length: 5 }, (_, i) => ({ query: `covered ${i}`, impressions: 100, position: 4 })),
    ...Array.from({ length: 5 }, (_, i) => ({ query: `uncovered ${i}`, impressions: 100, position: 40 })),
  ]
  const g = computeGovernor(queries, pagesFor(['home']), 2, P)
  assert.equal(g.saturated, false)
  assert.equal(g.allowNewPosts, true)
})

test('slug match counts as covered using full url path tokens', () => {
  const queries = [{ query: 'lip filler nashville', impressions: 100, position: 40 }]
  const g = computeGovernor(queries, [pg('lip-filler-nashville', '/services/lip-filler-nashville', 1)], 0, P)
  assert.equal(g.coveredCount, 1)
})

test('velocity at the ceiling blocks new posts with a plain-English reason', () => {
  const queries = [{ query: 'anything here', impressions: 100, position: 40 }]
  const g = computeGovernor(queries, pagesFor(['home']), P.maxNewPostsPerMonth, P)
  assert.equal(g.velocityExceeded, true)
  assert.equal(g.allowNewPosts, false)
  assert.match(g.reason ?? '', /ceiling/)
})

test('empty universe is not saturated', () => {
  const g = computeGovernor([], pagesFor(['home']), 0, P)
  assert.equal(g.saturated, false)
  assert.equal(g.coveragePct, 0)
})

// ---- integration: a seeded synthetic client through the full pipeline ---------------------------

function gscPage(path: string, date: string, clicks: number, impressions: number, position: number): GscRowLite {
  return { date: new Date(date), page: `https://x.com${path}`, query: null, clicks, impressions, position }
}
function gscQuery(path: string, query: string, date: string, clicks: number, impressions: number, position: number): GscRowLite {
  return { date: new Date(date), page: `https://x.com${path}`, query, clicks, impressions, position }
}

/** Monthly anchor rows give the synthetic client continuous 13+ month history
 *  (no coverage gaps), so the destructive gates are satisfied where intended. */
function monthlyAnchors(): GscRowLite[] {
  const rows: GscRowLite[] = []
  const months = [
    '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
  ]
  for (const m of months) rows.push(gscPage('/stable-top', `${m}-01`, 100, 1000, 2))
  rows.push(gscPage('/stable-top', '2026-07-13', 100, 1000, 2)) // anchors maxDate
  return rows
}

test('integration: each trigger produces the right recommendation for a seeded client', () => {
  const CUR = '2026-06-01'
  const YOY = '2025-06-15'
  const gsc: GscRowLite[] = [
    // stable top page (also provides continuous monthly history) → leave_alone
    ...monthlyAnchors(),
    // CTR decay: clicks down 40% YoY, impressions held, pos 4 (outside other bands)
    gscPage('/decayed', CUR, 60, 1000, 4),
    gscPage('/decayed', YOY, 100, 1000, 4),
    // striking distance at pos 9
    gscPage('/striking', CUR, 30, 900, 9),
    gscPage('/striking', YOY, 30, 900, 9),
    // deep page → rewrite (history clears the 6-month bar)
    gscPage('/deep', CUR, 2, 600, 45),
    gscPage('/deep', YOY, 2, 600, 45),
    // cannibalization pair on the same primary keyword
    gscPage('/cannibal-a', CUR, 20, 400, 8),
    gscPage('/cannibal-b', CUR, 10, 300, 11),
    gscQuery('/cannibal-a', 'botox nashville', CUR, 20, 400, 8),
    gscQuery('/cannibal-b', 'botox nashville', CUR, 10, 300, 11),
    // stale references only: pos 25 (no other trigger), decent CTR
    gscPage('/stale', CUR, 30, 2000, 25),
    gscPage('/stale', YOY, 30, 2000, 25),
    // genuinely dead: GSC knew this page, then 12+ months of silence
    gscPage('/dead-known', '2025-06-20', 5, 50, 20),
    gscPage('/dead-known', '2025-07-01', 3, 40, 22),
  ]
  const pages: PageLite[] = [
    pg('stable-top', '/stable-top', 1),
    pg('decayed', '/decayed', 2),
    pg('striking', '/striking', 3),
    pg('deep', '/deep', 4, { type: 'post' }),
    pg('cannibal-a', '/cannibal-a', 5),
    pg('cannibal-b', '/cannibal-b', 6),
    pg('stale', '/stale', 7, { type: 'post', contentHtml: '<p>Our 2023 pricing</p>' }),
    pg('dead-known', '/dead-known', 8, { type: 'post' }),
    pg('dead', '/dead', 9, { type: 'post' }),
  ]

  const queue = evaluateSite(gsc, [], pages, P, NOW)
  const byPath = new Map(queue.map((r) => [r.path, r]))

  assert.equal(byPath.get(`${HOST}/stable-top`)?.action, 'leave_alone')
  assert.ok(byPath.get(`${HOST}/stable-top`)?.reviewAfter)

  assert.equal(byPath.get(`${HOST}/decayed`)?.action, 'refresh')
  assert.deepEqual(byPath.get(`${HOST}/decayed`)?.triggers.map((t) => t.id), ['ctr_decay'])

  assert.equal(byPath.get(`${HOST}/striking`)?.action, 'refresh')
  assert.ok(byPath.get(`${HOST}/striking`)?.triggers.some((t) => t.id === 'striking_distance'))

  assert.equal(byPath.get(`${HOST}/deep`)?.action, 'rewrite')
  assert.equal(byPath.get(`${HOST}/deep`)?.effort, 'High')

  assert.equal(byPath.get(`${HOST}/cannibal-a`)?.action, 'consolidate')
  assert.equal(byPath.get(`${HOST}/cannibal-a`)?.consolidateInto, null)
  assert.equal(byPath.get(`${HOST}/cannibal-b`)?.action, 'consolidate')
  assert.equal(byPath.get(`${HOST}/cannibal-b`)?.consolidateInto, `${HOST}/cannibal-a`)

  assert.equal(byPath.get(`${HOST}/stale`)?.action, 'refresh')
  assert.deepEqual(byPath.get(`${HOST}/stale`)?.triggers.map((t) => t.id), ['stale_references'])
  assert.equal(byPath.get(`${HOST}/stale`)?.effort, 'Low')

  assert.equal(byPath.get(`${HOST}/dead-known`)?.action, 'prune')

  assert.equal(byPath.get(`${HOST}/dead`)?.action, 'insufficient_data')
  assert.match(byPath.get(`${HOST}/dead`)?.reason ?? '', /unknown, not dead/i)

  assert.equal(byPath.get(`${HOST}/striking`)?.lowConfidence, false)
})

test('integration: without a year of history the engine falls back and flags low confidence', () => {
  const gsc: GscRowLite[] = [
    gscPage('/striking', '2026-07-13', 30, 900, 9),
    gscPage('/striking', '2026-06-01', 30, 900, 9),
    // prior-window rows only (no YoY history)
    gscPage('/striking', '2026-03-01', 35, 950, 9),
  ]
  const pages: PageLite[] = [pg('striking', '/striking', 1)]
  const queue = evaluateSite(gsc, [], pages, P, NOW)
  const rec = queue.find((r) => r.path === `${HOST}/striking`)
  assert.ok(rec)
  assert.equal(rec.lowConfidence, true)
})

test('integration: buildPageSignals attaches GA4 conversions to the right path', () => {
  const gsc = [gscPage('/svc', '2026-07-13', 100, 1000, 8)]
  const ga4 = [{ date: new Date('2026-06-20'), landingPage: 'https://x.com/svc', conversions: 12 }]
  const signals = buildPageSignals(gsc, ga4, [pg('svc', '/svc', 1)], P, NOW)
  assert.equal(signals.find((s) => s.path === `${HOST}/svc`)?.conversions, 12)
})

// ---- data sufficiency gates ----------------------------------------------------

test('sufficiency: history months, coverage gaps, and page coverage are computed', () => {
  const gsc = [
    gscPage('/a', '2026-01-15', 10, 100, 5),
    // February missing entirely → coverage gap
    gscPage('/a', '2026-03-15', 10, 100, 5),
    gscPage('/a', '2026-07-13', 10, 100, 5),
  ]
  const pages: PageLite[] = [
    pg('a', '/a', 1),
    pg('b-no-data', '/b-no-data', 2),
  ]
  const s = computeDataSufficiency(gsc, [], pages, P)
  assert.ok(s.gscHistoryMonths > 5 && s.gscHistoryMonths < 7, `got ${s.gscHistoryMonths}`)
  assert.ok(s.gscCoverageGaps.includes('2026-02'))
  assert.equal(s.pagesTotal, 2)
  assert.equal(s.pagesWithGscData, 1)
})

test('sufficiency: GA4 status thresholds — active / partial / none', () => {
  const gsc = [gscPage('/a', '2026-07-13', 10, 100, 5)]
  const mk = (conv: number) => [{ date: new Date('2026-07-01'), landingPage: 'https://x.com/a', conversions: conv }]
  assert.equal(computeDataSufficiency(gsc, mk(50), [], P).ga4Status, 'active')
  assert.equal(computeDataSufficiency(gsc, mk(3), [], P).ga4Status, 'partial')
  assert.equal(computeDataSufficiency(gsc, mk(0), [], P).ga4Status, 'none')
})

test('gate: a client with ~7 months of history produces zero prunes — insufficient_data instead', () => {
  const gsc: GscRowLite[] = []
  // continuous 7½-month history (Dec 2025 – mid-Jul 2026)
  for (const m of ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']) {
    gsc.push(gscPage('/anchor', `${m}-01`, 50, 500, 3))
  }
  gsc.push(gscPage('/anchor', '2026-07-13', 50, 500, 3))
  // GSC rows exist for the page but show zero clicks and zero impressions
  gsc.push(gscPage('/dead-candidate', '2025-12-15', 0, 0, 0))
  const pages: PageLite[] = [
    pg('anchor', '/anchor', 1),
    pg('dead-candidate', '/dead-candidate', 2, { type: 'post' }),
  ]
  const queue = evaluateSite(gsc, [], pages, P, NOW)
  assert.equal(queue.filter((r) => r.action === 'prune').length, 0, 'no prunes below the 12-month bar')
  const rec = queue.find((r) => r.path === `${HOST}/dead-candidate`)
  assert.equal(rec?.action, 'insufficient_data')
  assert.match(rec?.reason ?? '', /only 7 months of GSC history, 12 required/)
})

test('gate: coverage gaps inside the prune window also suppress prune', () => {
  const gsc: GscRowLite[] = []
  // 14 months of history but October 2025 has no data at all
  for (const m of ['2025-06', '2025-07', '2025-08', '2025-09', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']) {
    gsc.push(gscPage('/anchor', `${m}-01`, 50, 500, 3))
  }
  gsc.push(gscPage('/anchor', '2026-07-13', 50, 500, 3))
  gsc.push(gscPage('/dead-candidate', '2025-06-20', 5, 50, 20))
  const pages: PageLite[] = [pg('dead-candidate', '/dead-candidate', 1, { type: 'post' })]
  const queue = evaluateSite(gsc, [], pages, P, NOW)
  const rec = queue.find((r) => r.path === `${HOST}/dead-candidate`)
  assert.equal(rec?.action, 'insufficient_data')
  assert.match(rec?.reason ?? '', /coverage gaps/)
  assert.match(rec?.reason ?? '', /2025-10/)
})

test('gate: rewrite below 6 months of history downgrades to insufficient_data', () => {
  const gsc: GscRowLite[] = [
    gscPage('/anchor', '2026-04-01', 50, 500, 3),
    gscPage('/anchor', '2026-07-13', 50, 500, 3),
    gscPage('/too-deep', '2026-06-01', 2, 600, 45),
  ]
  const queue = evaluateSite(gsc, [], [pg('too-deep', '/too-deep', 1, { type: 'post' })], P, NOW)
  const rec = queue.find((r) => r.path === `${HOST}/too-deep`)
  assert.equal(rec?.action, 'insufficient_data')
  assert.match(rec?.reason ?? '', /Rewrite suppressed/)
})

test('gate: rewrite fires normally once history clears the 6-month bar', () => {
  const gsc: GscRowLite[] = [
    gscPage('/anchor', '2025-11-01', 50, 500, 3),
    gscPage('/anchor', '2026-07-13', 50, 500, 3),
    gscPage('/too-deep', '2026-06-01', 2, 600, 45),
  ]
  const queue = evaluateSite(gsc, [], [pg('too-deep', '/too-deep', 1, { type: 'post' })], P, NOW)
  assert.equal(queue.find((r) => r.path === `${HOST}/too-deep`)?.action, 'rewrite')
})

test('gate: consolidate below its history bar downgrades to insufficient_data', () => {
  const gsc: GscRowLite[] = [
    gscPage('/anchor', '2026-05-01', 50, 500, 3),
    gscPage('/anchor', '2026-07-13', 50, 500, 3),
    gscPage('/cann-a', '2026-06-01', 20, 400, 8),
    gscPage('/cann-b', '2026-06-01', 10, 300, 11),
    gscQuery('/cann-a', 'same keyword here', '2026-06-01', 20, 400, 8),
    gscQuery('/cann-b', 'same keyword here', '2026-06-01', 10, 300, 11),
  ]
  const queue = evaluateSite(
    gsc,
    [],
    [pg('cann-a', '/cann-a', 1), pg('cann-b', '/cann-b', 2)],
    P,
    NOW,
  )
  const rec = queue.find((r) => r.path === `${HOST}/cann-b`)
  assert.equal(rec?.action, 'insufficient_data')
  assert.match(rec?.reason ?? '', /Consolidate suppressed/)
})

test('priority: with conversion weighting off, conversions no longer move the score', () => {
  const rich = sig({ conversions: 100 })
  const poor = sig({ conversions: 0 })
  assert.notEqual(
    priorityScore(rich, 'refresh', 'Low', 30, 'local', P, true),
    priorityScore(poor, 'refresh', 'Low', 30, 'local', P, true),
  )
  assert.equal(
    priorityScore(rich, 'refresh', 'Low', 30, 'local', P, false),
    priorityScore(poor, 'refresh', 'Low', 30, 'local', P, false),
  )
})
