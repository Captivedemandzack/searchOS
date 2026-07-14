/**
 * Internal linking standards — codifies current (2025-2026) Google guidance so
 * generation and placement improve SEO instead of stalling it. Sources:
 * Google Search Central (updated Apr 2026: "the number of links matters less
 * than whether they help users find content"), Zyppy's 23M-link study, and the
 * 2026 SEO consensus on contextual placement.
 *
 * Principles enforced here:
 *  - Quantity is intent-based, not a fixed count: ~2-5 contextual links per
 *    1,000 words of body copy is the evidence-backed range for blog content.
 *  - Links must live in the BODY (contextual), not an appended "related" dump —
 *    body links carry far more weight (Reasonable Surfer) and appended lists
 *    read as link stuffing.
 *  - Anchor text is descriptive/entity-rich (3-8 words), describes the
 *    DESTINATION, and is NOT exact-match-repeated across links.
 *  - Never link the same destination twice from one page; vary anchors.
 */

/** Words of body copy each contextual internal link should be "earned" by. */
const WORDS_PER_LINK = 250

/** Hard floor/ceiling for contextual internal links on a single blog page. */
const MIN_LINKS = 2
const MAX_LINKS = 8

/** 2-5 links per 1,000 words, clamped — the healthy contextual range. */
export function maxContextualLinksForWordCount(wordCount: number): number {
  if (wordCount <= 0) return MIN_LINKS
  const byLength = Math.round(wordCount / WORDS_PER_LINK)
  return Math.max(MIN_LINKS, Math.min(MAX_LINKS, byLength))
}

/** Count words in a plain-text (already HTML-stripped) string. */
export function countWords(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

const GENERIC_ANCHORS = new Set([
  'click here',
  'read more',
  'here',
  'this',
  'learn more',
  'this page',
  'this post',
  'link',
  'read this',
  'more',
])

export type AnchorQuality = {
  ok: boolean
  reason?: string
}

/**
 * Validate an anchor against the descriptive/entity-rich standard: 3-8 words,
 * not generic, not a bare URL. Used to reject low-signal anchors before push.
 */
export function assessAnchorText(anchor: string): AnchorQuality {
  const a = anchor.trim()
  if (!a) return { ok: false, reason: 'empty anchor' }
  if (GENERIC_ANCHORS.has(a.toLowerCase())) return { ok: false, reason: 'generic anchor' }
  if (/^https?:\/\//i.test(a)) return { ok: false, reason: 'anchor is a URL' }
  const words = a.split(/\s+/).filter(Boolean).length
  if (words < 2) return { ok: false, reason: 'anchor too short (min 2 words)' }
  if (words > 10) return { ok: false, reason: 'anchor too long (max ~8 words)' }
  return { ok: true }
}

/**
 * Enforce anchor diversity per Google over-optimization guidance: drop repeat
 * destinations and case-insensitive duplicate anchors. Preserves input order.
 */
export function dedupeLinkPlan<T extends { anchor: string; target: string }>(rows: T[]): T[] {
  const seenTargets = new Set<string>()
  const seenAnchors = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    const target = row.target.trim().toLowerCase()
    const anchor = row.anchor.trim().toLowerCase()
    if (!target || !anchor) continue
    if (seenTargets.has(target)) continue
    if (seenAnchors.has(anchor)) continue
    seenTargets.add(target)
    seenAnchors.add(anchor)
    out.push(row)
  }
  return out
}
