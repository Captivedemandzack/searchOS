/**
 * Content Engine policy — every threshold in one place (per the July 2026
 * research review). The trigger rules and governor in contentEngine.ts take
 * this object as a parameter; nothing in the logic hardcodes these numbers.
 */
import { prisma } from './db.ts'

export type ContentPolicy = {
  /** Comparison window length in days (current period, and the YoY mirror). */
  windowDays: number
  /** Days back from the current window to the year-over-year mirror window. */
  yoyOffsetDays: number

  // ---- Trigger thresholds ----------------------------------------------------
  /** Striking distance band on the primary keyword: refresh candidates. */
  strikingDistance: { min: number; max: number }
  /** Positions above this are a rewrite, not a refresh. */
  rewriteAbovePosition: number
  /** "Leave alone" band: top positions with stable traffic. */
  leaveAloneMaxPosition: number
  /** Clicks down this fraction YoY (with impressions holding) = CTR decay. */
  decayClicksDropPct: number
  /** Impressions within this fraction of prior period still count as "holding". */
  decayImpressionsTolerancePct: number
  /** CTR materially below curve: actual < expected × this ratio. */
  ctrBelowCurveRatio: number
  /** Minimum impressions in the window before CTR-based triggers may fire. */
  minImpressionsForCtrRules: number
  /** Content references (years, stats, prices) older than this are stale. */
  staleReferenceMonths: number
  /** Zero clicks AND zero impressions for this long = prune candidate. */
  pruneAfterMonths: number
  /** Review-again horizon for leave-alone pages, in months. */
  leaveAloneReviewMonths: number

  // ---- Data sufficiency gates (destructive actions need real history) ---------
  /** Prune requires this much continuous GSC history. Absent data ≠ dead. */
  pruneMinHistoryMonths: number
  /** Rewrite requires at least this much history. */
  rewriteMinHistoryMonths: number
  /** Consolidate (destructive) requires at least this much history. */
  consolidateMinHistoryMonths: number
  /** Site-wide GA4 conversions in the window at/above this = "active" tracking. */
  ga4ActiveMinConversions: number
  /** Above zero but below the active bar = "partial" tracking. */
  ga4PartialMinConversions: number

  // ---- Topic supply governor ---------------------------------------------------
  /** Above this keyword-universe coverage, stop recommending new posts. */
  saturationThresholdPct: number
  /** Warn (and stop auto-writing) above this many new posts in 30 days. */
  maxNewPostsPerMonth: number
  /** A query needs at least this many impressions in the window to count in the universe. */
  minUniverseImpressions: number
  /** A query ranking at or better than this is considered "covered". */
  coveredAtPosition: number

  // ---- Prioritization ----------------------------------------------------------
  /** Keyword modifiers marking transactional/commercial intent. */
  transactionalModifiers: string[]
  /** Keyword modifiers marking local-commercial intent. */
  localModifiers: string[]
  /** Intent weights: a page driving buyers outranks one driving browsers. */
  intentWeights: { transactional: number; local: number; informational: number }
  /** Effort divisor — cheap fixes surface high. */
  effortWeights: { Low: number; Medium: number; High: number }
  /** Bonus multiplier for service pages (they support revenue directly). */
  servicePageBonus: number
}

/** Per-site policy overrides (e.g. SLK cadence = 2 posts/month). */
export function getContentPolicyForSite(domain: string): ContentPolicy {
  if (/slkclinic/i.test(domain)) {
    return { ...CONTENT_POLICY, maxNewPostsPerMonth: 2 }
  }
  return CONTENT_POLICY
}

/** DB-backed per-site policy (SiteSettings + domain defaults). */
export async function resolveContentPolicy(siteId: string): Promise<ContentPolicy> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { settings: true },
  })
  if (!site) return CONTENT_POLICY
  let policy = getContentPolicyForSite(site.domain)
  const s = site.settings
  if (s?.maxNewPostsPerMonth != null) {
    policy = { ...policy, maxNewPostsPerMonth: s.maxNewPostsPerMonth }
  }
  if (s?.policyJson) {
    try {
      const overrides = JSON.parse(s.policyJson) as Partial<ContentPolicy>
      policy = { ...policy, ...overrides }
    } catch {
      /* skip invalid JSON */
    }
  }
  if (s?.localModifiersJson) {
    try {
      const mods = JSON.parse(s.localModifiersJson) as string[]
      if (Array.isArray(mods) && mods.length) {
        policy = { ...policy, localModifiers: mods }
      }
    } catch {
      /* skip */
    }
  }
  return policy
}

export const CONTENT_POLICY: ContentPolicy = {
  windowDays: 91,
  yoyOffsetDays: 365,

  strikingDistance: { min: 5, max: 20 },
  rewriteAbovePosition: 30,
  leaveAloneMaxPosition: 3,
  decayClicksDropPct: 0.3,
  decayImpressionsTolerancePct: 0.1,
  ctrBelowCurveRatio: 0.7,
  minImpressionsForCtrRules: 100,
  staleReferenceMonths: 18,
  pruneAfterMonths: 12,
  leaveAloneReviewMonths: 6,

  pruneMinHistoryMonths: 12,
  rewriteMinHistoryMonths: 6,
  consolidateMinHistoryMonths: 6,
  ga4ActiveMinConversions: 10,
  ga4PartialMinConversions: 1,

  saturationThresholdPct: 85,
  maxNewPostsPerMonth: 8,
  minUniverseImpressions: 50,
  coveredAtPosition: 10,

  transactionalModifiers: [
    'cost', 'price', 'pricing', 'deal', 'deals', 'special', 'specials', 'book',
    'appointment', 'consultation', 'financing', 'buy', 'cheap', 'affordable',
  ],
  localModifiers: ['near me', 'nashville', 'chattanooga', 'franklin', 'brentwood', 'tn', 'tennessee'],
  intentWeights: { transactional: 2.0, local: 1.5, informational: 1.0 },
  effortWeights: { Low: 1, Medium: 2, High: 3.2 },
  servicePageBonus: 1.5,
}
