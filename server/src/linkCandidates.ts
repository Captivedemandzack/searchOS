import { parseLinkSuggestions } from './elementorPatch.ts'
import { pageDisplayPath, resolveAliasedPath } from './url.ts'
import { significantTokens } from './textTokens.ts'

export type RankedLinkCandidate = {
  path: string
  title: string | null
  snippet: string
  score: number
  matchedTerms: string[]
}

type PageRow = {
  slug: string
  title: string | null
  contentHtml: string | null
  url?: string | null
  type?: string | null
}

// Generic comparison / marketing / superlative words that carry no topical
// meaning for internal linking. Without this, a "Which Botox Lasts Longest"
// article matches every other "Which X is Best" title on the site. These are
// stripped from the topic vector so only genuine SUBJECT nouns drive matches.
const GENERIC_TOPIC_STOPWORDS = new Set([
  'which', 'best', 'top', 'better', 'right', 'one', 'guide', 'complete', 'ultimate',
  'type', 'types', 'compared', 'comparison', 'compare', 'versus', 'longest', 'longer',
  'lasts', 'last', 'lasting', 'long', 'most', 'more', 'less', 'need', 'needs', 'know',
  'should', 'will', 'can', 'why', 'when', 'where', 'who', 'about', 'into', 'out', 'made',
  'make', 'making', 'using', 'use', 'used', 'new', 'all', 'two', 'three', 'four', 'five',
  'non', 'affordable', 'cheap', 'price', 'pricing', 'cost', 'costs', 'near', 'benefits',
  'benefit', 'everything', 'things', 'ways', 'tips', 'find', 'finding', 'right',
])

function topicVector(s: string): string[] {
  return significantTokens(s).filter((t) => !GENERIC_TOPIC_STOPWORDS.has(t))
}

/**
 * Topical relevance between this page and other site pages, scored by how much
 * a candidate shares THIS page's dominant subject — not by rarity across the
 * site. The source's subject term ("botox") is heaviest because it recurs in
 * the title + queries + headings; a candidate that shares it (botox-nashville,
 * why-botox-alone) beats one that only shares a generic word. Site-common topic
 * terms are NOT penalized: within a med-spa the Botox money pages ARE the right
 * links for a Botox article. Rare subtopic terms (dysport, xeomin, wrinkle) add
 * a bonus so the most specifically-related article rises among same-topic peers.
 */
export function rankLinkCandidates(
  sourceText: string,
  pages: PageRow[],
  excludeSlug: string,
  opts?: { titleText?: string },
): RankedLinkCandidate[] {
  const others = pages.filter((p) => p.slug !== excludeSlug)
  const labels = others.map((p) => `${p.slug.replace(/-/g, ' ')} ${p.title ?? ''}`.toLowerCase())
  const bodies = others.map((p) => stripHtml(p.contentHtml ?? '').toLowerCase())

  // Source-centrality weight: how central each term is to THIS page. A term that
  // recurs across title + queries + headings (its true subject) weighs most.
  const sourceTokens = topicVector(sourceText)
  const titleTerms = new Set(topicVector(opts?.titleText ?? ''))
  const weight = new Map<string, number>()
  for (const t of sourceTokens) weight.set(t, (weight.get(t) ?? 0) + 1)
  for (const t of titleTerms) weight.set(t, (weight.get(t) ?? 0) + 2) // title = subject
  const topicTerms = [...weight.keys()]

  // Label document-frequency → a small bonus for rare subtopic terms (never a
  // penalty on common-but-on-topic terms like the subject noun itself).
  const N = Math.max(labels.length, 1)
  const labelDf = new Map<string, number>()
  for (const term of topicTerms) {
    labelDf.set(term, labels.reduce((n, l) => (l.includes(term) ? n + 1 : n), 0))
  }
  const rarityBonus = (t: string) => ((labelDf.get(t) ?? 0) <= Math.max(1, N * 0.2) ? 1.5 : 1)

  return others
    .map((p, i) => {
      const label = labels[i]
      const body = bodies[i]
      // Title/slug match is the strongest signal a page is on the same subject.
      const labelMatched = topicTerms.filter((t) => label.includes(t))
      const labelScore = labelMatched.reduce(
        (sum, t) => sum + (weight.get(t) ?? 0) * 2 * rarityBonus(t),
        0,
      )
      // Body-only overlap: real but weaker signal, capped to the strongest few
      // terms so long pages can't accumulate score from incidental mentions.
      const bodyMatched = topicTerms
        .filter((t) => !label.includes(t) && body.includes(t))
        .sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0))
        .slice(0, 6)
      const bodyScore = bodyMatched.reduce(
        (sum, t) => sum + (weight.get(t) ?? 0) * 0.4 * rarityBonus(t),
        0,
      )

      const matchedTerms = [...new Set([...labelMatched, ...bodyMatched])].sort(
        (a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0),
      )
      return {
        path: pageDisplayPath(p),
        title: p.title,
        snippet: stripHtml(p.contentHtml ?? '').slice(0, 400),
        score: Math.round((labelScore + bodyScore) * 100) / 100,
        matchedTerms,
      }
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
}

/** Pick up to `max` targets. Same inputs always produce the same list. */
export function selectLinkTargets(candidates: RankedLinkCandidate[], max = 5): RankedLinkCandidate[] {
  const withOverlap = candidates.filter((c) => c.score > 0)
  if (withOverlap.length > 0) return withOverlap.slice(0, max)
  // No token overlap: fall back to first service pages, then any page (stable sort).
  const services = candidates.filter((c) => !c.path.startsWith('/blog/'))
  return (services.length ? services : candidates).slice(0, Math.min(3, max))
}

export function buildLinkEvidenceReason(
  selected: RankedLinkCandidate[],
  queries: { query: string; impressions: number }[],
): string {
  const querySample = queries
    .slice(0, 5)
    .map((q) => `"${q.query}" (${q.impressions.toLocaleString()} impr)`)
    .join(', ')
  const lines = selected.map((c, i) => {
    const overlap = c.matchedTerms.length ? c.matchedTerms.join(', ') : 'site structure fallback'
    return `${i + 1}. ${c.path} (${c.title ?? 'untitled'}) — topical overlap: ${overlap}`
  })
  return [
    'Targets ranked by shared terms with this page\'s Search Console queries and content.',
    querySample ? `Source queries: ${querySample}.` : 'Source queries: (none synced).',
    ...lines,
  ].join('\n')
}

/**
 * Constrain AI link output to real candidate targets and resolve permalinks.
 * The AI now selects only targets with a natural verbatim anchor (Google 2026
 * contextual guidance), so we TRUST its selection instead of forcing every
 * target. We validate each AI line against the candidate set (prevents
 * hallucinated paths), resolve to the canonical /blog/ permalink, and drop
 * duplicate targets/anchors. Targets the AI omitted are intentionally dropped.
 */
export function mergeLinkSuggestionsWithTargets(
  aiSuggested: string,
  selected: RankedLinkCandidate[],
  aliases: Map<string, string>,
): string {
  if (!selected.length) return ''
  // Canonical permalink → candidate, for validating AI-chosen paths.
  const byResolved = new Map<string, RankedLinkCandidate>()
  for (const c of selected) byResolved.set(resolveAliasedPath(c.path, aliases), c)

  const aiRows = parseLinkSuggestions(aiSuggested)
  const seenTargets = new Set<string>()
  const seenAnchors = new Set<string>()
  const lines: string[] = []

  for (const row of aiRows) {
    const path = resolveAliasedPath(row.target, aliases)
    if (!byResolved.has(path)) continue // ignore hallucinated / off-list targets
    const anchor = row.anchor?.trim()
    if (!anchor) continue
    const tKey = path.toLowerCase()
    const aKey = anchor.toLowerCase()
    if (seenTargets.has(tKey) || seenAnchors.has(aKey)) continue
    seenTargets.add(tKey)
    seenAnchors.add(aKey)
    lines.push(`"${anchor}" -> ${path}`)
  }
  return lines.join('\n')
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
