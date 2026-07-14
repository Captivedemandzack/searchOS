/**
 * Patch existing Elementor page JSON in place — headings, body copy, and
 * internal links. Does not add sections or change layout (that stays manual).
 */

import {
  assessAnchorText,
  countWords,
  dedupeLinkPlan,
  maxContextualLinksForWordCount,
} from './linkingStandards.ts'
import { significantTokens } from './textTokens.ts'

export type ElementorNode = {
  id?: string
  elType?: string
  widgetType?: string
  settings?: Record<string, unknown>
  elements?: ElementorNode[]
  [key: string]: unknown
}

type Rec = { tab: string; current: string; suggested: string }

export type ElementorPatchResult = {
  elementorData: string
  summary: string[]
  patched: { headings: number; body: number; links: number }
}

type ParsedRoot = {
  root: ElementorNode[]
  wrap: 'array' | 'content' | 'single'
  envelope?: Record<string, unknown>
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseElementorRoot(raw: string): ParsedRoot {
  const parsed = JSON.parse(raw) as unknown
  if (Array.isArray(parsed)) return { root: parsed as ElementorNode[], wrap: 'array' }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as ElementorNode).content)) {
    const env = parsed as Record<string, unknown>
    return { root: env.content as ElementorNode[], wrap: 'content', envelope: env }
  }
  return { root: [parsed as ElementorNode], wrap: 'single' }
}

export function serializeElementorRoot(parsed: ParsedRoot, root: ElementorNode[]): string {
  if (parsed.wrap === 'array') return JSON.stringify(root)
  if (parsed.wrap === 'content' && parsed.envelope) {
    return JSON.stringify({ ...parsed.envelope, content: root })
  }
  return JSON.stringify(root[0] ?? root)
}

export function parseHeadingOutline(text: string): { level: number; text: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^H([1-6]):\s*(.+)$/i)
      if (m) return { level: Number.parseInt(m[1], 10), text: m[2].trim() }
      return { level: 2, text: line }
    })
}

export function collectHeadingWidgets(nodes: ElementorNode[]): ElementorNode[] {
  const out: ElementorNode[] = []
  const walk = (arr: ElementorNode[]) => {
    for (const n of arr) {
      if (
        (n.widgetType === 'heading' || n.widgetType === 'theme-post-title') &&
        n.settings?.title != null
      ) {
        out.push(n)
      }
      if (Array.isArray(n.elements)) walk(n.elements)
    }
  }
  walk(nodes)
  return out
}

export function collectTextEditors(nodes: ElementorNode[]): ElementorNode[] {
  const out: ElementorNode[] = []
  const walk = (arr: ElementorNode[]) => {
    for (const n of arr) {
      if (n.widgetType === 'text-editor' && n.settings?.editor != null) out.push(n)
      if (Array.isArray(n.elements)) walk(n.elements)
    }
  }
  walk(nodes)
  return out
}

export type LinkSuggestion = { anchor: string; target: string; append?: boolean; placement?: string }

function linkArrowRe(): RegExp {
  return /\s*(?:→|->|—>|–>)\s*/i
}

/** Parse AI / UI link strategy lines into anchor + target paths. */
export function parseLinkSuggestions(text: string): LinkSuggestion[] {
  const arrow = linkArrowRe()
  const rows: LinkSuggestion[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const addQuoted = line.match(/^Add\s+[""]([^""]+)[""]/i)
    if (addQuoted) {
      const rest = line.slice(addQuoted[0].length)
      const targetMatch = rest.match(new RegExp(`^${linkArrowRe().source}(\\S+)`, 'i'))
      if (targetMatch) {
        rows.push({
          anchor: addQuoted[1].trim(),
          target: normalizeLinkTarget(targetMatch[1]),
          append: /closing|end|footer|last|section|paragraph/i.test(line),
          placement: parsePlacementFromLine(line),
        })
      }
      continue
    }

    const parts = line.split(arrow)
    if (parts.length >= 2) {
      let anchor = parts[0]
        .replace(/^[""]|[""]$/g, '')
        .replace(/^…+/g, '')
        .replace(/\s*\(unlinked\)\s*$/i, '')
        .trim()
      if (anchor.startsWith('…')) anchor = anchor.slice(1).trim()
      let targetPart = parts[parts.length - 1].trim()
      const inIdx = targetPart.search(/\s+in\s+(?:the\s+)?/i)
      if (inIdx > 0) targetPart = targetPart.slice(0, inIdx).trim()
      rows.push({
        anchor,
        target: normalizeLinkTarget(targetPart),
        append: /closing|end|footer|last|section|paragraph/i.test(line),
        placement: parsePlacementFromLine(line),
      })
      continue
    }

    const dash = line.match(/^(\/\S+)\s*[—-]\s*[""]([^""]+)[""]\s*$/i)
    if (dash) {
      // Legacy inbound format (other page → this page). Outbound patch skips these.
      continue
    }
  }
  return rows.filter((r) => r.anchor && r.target)
}

function formatLinkLine(row: LinkSuggestion): string {
  if (row.append) {
    const place = row.placement
    if (place && place !== 'closing paragraph') {
      return `Add "${row.anchor}" -> ${row.target} in the ${place} section`
    }
    return `Add "${row.anchor}" -> ${row.target}`
  }
  return `"${row.anchor}" -> ${row.target}`
}

/** Rewrite link suggestion lines so targets use synced WordPress permalinks. */
export function resolveLinkSuggestionsText(text: string, aliases: Map<string, string>): string {
  if (!text.trim() || aliases.size === 0) return text
  return text
    .split('\n')
    .map((rawLine) => {
      const trimmed = rawLine.trim()
      if (!trimmed) return rawLine
      const rows = parseLinkSuggestions(trimmed)
      if (rows.length !== 1) return rawLine
      const row = rows[0]
      row.target = normalizeLinkTarget(row.target, aliases)
      return formatLinkLine(row)
    })
    .join('\n')
}

function normalizeLinkTarget(target: string, aliases?: Map<string, string>): string {
  const t = target.replace(/[.,;]+$/g, '').trim()
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      const path = new URL(t).pathname.replace(/\/$/, '') || '/'
      return aliases?.get(path) ?? path
    } catch {
      return t
    }
  }
  const withSlash = t.startsWith('/') ? t : `/${t}`
  return aliases?.get(withSlash) ?? withSlash
}

function parsePlacementFromLine(line: string): string | undefined {
  const arrow = linkArrowRe()
  const parts = line.split(arrow)
  if (parts.length < 2) return undefined
  const tail = parts[parts.length - 1].trim()
  const inSection = tail.match(/\s+in\s+(?:the\s+)?(.+)$/i)
  if (!inSection) return undefined
  const raw = inSection[1].trim()
  if (/^(?:closing|end|footer|last)\b/i.test(raw) || /^paragraph\b/i.test(raw)) {
    return 'closing paragraph'
  }
  return raw.replace(/\s+section$/i, '').trim() || raw
}

function toAbsoluteUrl(target: string, siteBaseUrl?: string | null): string {
  if (target.startsWith('http://') || target.startsWith('https://')) return target
  const base = (siteBaseUrl ?? '').replace(/\/+$/, '')
  return `${base}${target.startsWith('/') ? target : `/${target}`}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function proseToEditorHtml(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed
  return trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('')
}

export function extractH1FromOutline(text: string): string | null {
  return parseHeadingOutline(text).find((h) => h.level === 1)?.text ?? null
}

/** One H1 max in outline; extras demoted to H2. */
export function enforceSingleH1Outline(outline: { level: number; text: string }[]): { level: number; text: string }[] {
  let seenH1 = false
  return outline.map((entry) => {
    if (entry.level !== 1) return entry
    if (seenH1) return { ...entry, level: 2 }
    seenH1 = true
    return entry
  })
}

/**
 * Map AI heading outline to Elementor body widgets.
 * Blog posts: post title is the only H1; body widgets are H2+ only.
 */
export function outlineForBodyWidgets(
  text: string,
  opts: { externalH1: boolean },
): { level: number; text: string }[] {
  let outline = parseHeadingOutline(text)
  if (opts.externalH1) outline = outline.filter((h) => h.level !== 1)
  else outline = enforceSingleH1Outline(outline)
  return outline
}

export function patchHeadingWidgets(
  tree: ElementorNode[],
  suggestedOutline: string,
  opts?: { externalH1?: boolean },
): number {
  const outline = outlineForBodyWidgets(suggestedOutline, { externalH1: !!opts?.externalH1 })
  const widgets = collectHeadingWidgets(tree).filter((w) => w.widgetType !== 'theme-post-title')
  if (!outline.length || !widgets.length) return 0

  if (opts?.externalH1) {
    for (const w of widgets) {
      if (!w.settings) w.settings = {}
      if (w.settings.header_size === 'h1') {
        w.settings.header_size = 'h2'
      }
    }
  }

  let patched = 0
  const count = Math.min(widgets.length, outline.length)
  for (let i = 0; i < count; i++) {
    const widget = widgets[i]
    const entry = outline[i]
    const level = opts?.externalH1 ? Math.max(2, entry.level) : entry.level
    if (!widget.settings) widget.settings = {}
    const before = stripHtml(String(widget.settings.title ?? ''))
    const size = `h${level}`
    if (before !== entry.text || widget.settings.header_size !== size) {
      widget.settings.title = entry.text
      widget.settings.header_size = size
      patched++
    }
  }
  return patched
}

/** Replace the first text-editor widget (page intro) with suggested body copy. */
export function patchBodyWidget(tree: ElementorNode[], bodySuggested: string): number {
  const editors = collectTextEditors(tree)
  if (!editors.length || !bodySuggested.trim()) return 0
  const first = editors[0]
  if (!first.settings) first.settings = {}
  const html = proseToEditorHtml(bodySuggested)
  const before = stripHtml(String(first.settings.editor ?? ''))
  const after = stripHtml(html)
  if (!after || before === after) return 0
  first.settings.editor = html
  return 1
}

/** True when `index` falls inside an HTML tag `<...>`. */
function isIndexInsideTag(html: string, index: number): boolean {
  const lastOpen = html.lastIndexOf('<', index)
  if (lastOpen < 0) return false
  const lastClose = html.lastIndexOf('>', index)
  return lastOpen > lastClose
}

/** True when `index` sits between an open `<a` and its `</a>` (avoid nested links). */
function isIndexInsideAnchor(html: string, index: number): boolean {
  const before = html.slice(0, index).toLowerCase()
  return before.lastIndexOf('<a') > before.lastIndexOf('</a>')
}

/**
 * Locate an anchor phrase in editor HTML. Tries an exact match first, then a
 * case-insensitive, whitespace-flexible match so real prose variations still
 * link. Skips matches that land inside a tag or an existing anchor.
 */
function findAnchorInHtml(html: string, anchor: string): { index: number; length: number } | null {
  const trimmed = anchor.trim()
  if (!trimmed) return null

  const exact = html.indexOf(trimmed)
  if (exact >= 0 && !isIndexInsideTag(html, exact) && !isIndexInsideAnchor(html, exact)) {
    return { index: exact, length: trimmed.length }
  }

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const re = new RegExp(escaped, 'i')
  let m: RegExpExecArray | null
  re.lastIndex = 0
  // Walk matches so we can skip ones inside tags/anchors.
  const global = new RegExp(escaped, 'gi')
  while ((m = global.exec(html)) !== null) {
    if (!isIndexInsideTag(html, m.index) && !isIndexInsideAnchor(html, m.index)) {
      return { index: m.index, length: m[0].length }
    }
    if (m.index === global.lastIndex) global.lastIndex++
  }
  return null
}

/** Significant tokens from a target's last path segment (its descriptive slug). */
function slugTokensFromTarget(target: string): string[] {
  const seg = target.split(/[?#]/)[0].replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? ''
  return significantTokens(seg.replace(/-/g, ' '))
}

/** Consecutive token windows, longest (most specific) first, min 2 tokens. */
function tokenWindows(tokens: string[]): string[][] {
  const out: string[][] = []
  const maxSize = Math.min(4, tokens.length)
  for (let size = maxSize; size >= 2; size--) {
    for (let i = 0; i + size <= tokens.length; i++) out.push(tokens.slice(i, i + size))
  }
  return out
}

/**
 * Find an in-body phrase built from destination keywords, allowing up to two
 * short connector words between them (so "benefits of botox" matches slug
 * tokens ["benefits","botox"]). Returns a span that stays within visible text.
 */
function findPhraseByTokens(html: string, tokens: string[]): { index: number; length: number } | null {
  if (tokens.length === 0) return null
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Light stemming: drop a trailing plural "s" so "fillers"↔"filler",
  // "toxins"↔"toxin" match, and allow any inflection suffix via \w*.
  const stem = (t: string) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t)
  const joiner = '(?:\\s+\\w+){0,2}?\\s+'
  const core = tokens.map((t) => `${esc(stem(t))}\\w*`).join(joiner)
  const re = new RegExp(`\\b${core}\\b`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const slice = m[0]
    if (
      !isIndexInsideTag(html, m.index) &&
      !isIndexInsideAnchor(html, m.index) &&
      !slice.includes('<') &&
      !slice.includes('>')
    ) {
      return { index: m.index, length: slice.length }
    }
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return null
}

/** Grow a single-word match to a 2-word phrase using a real neighbouring word. */
function expandToPhrase(
  html: string,
  index: number,
  length: number,
): { index: number; length: number } {
  const end = index + length
  const right = html.slice(end).match(/^(\s+)([A-Za-z0-9''-]+)/)
  if (right && !right[0].includes('<')) {
    return { index, length: length + right[0].length }
  }
  const left = html.slice(0, index).match(/([A-Za-z0-9''-]+)(\s+)$/)
  if (left && !left[0].includes('<')) {
    return { index: index - left[0].length, length: length + left[0].length }
  }
  return { index, length }
}

/**
 * Locate the best real, descriptive anchor for a target inside body HTML.
 * Priority: the AI's suggested anchor → a sub-phrase of it → a phrase built from
 * the destination's own slug keywords → a single keyword grown to two words.
 * This makes placement reliable: if the body genuinely discusses the target,
 * a natural anchor is found; if it truly doesn't, we return null (never forced).
 */
function findNaturalAnchor(
  html: string,
  aiAnchor: string,
  target: string,
): { index: number; length: number } | null {
  const anchor = aiAnchor.trim()
  if (anchor) {
    const direct = findAnchorInHtml(html, anchor)
    if (direct) return direct
    const aiTokens = anchor.split(/\s+/).filter(Boolean)
    for (let size = aiTokens.length - 1; size >= 2; size--) {
      for (let i = 0; i + size <= aiTokens.length; i++) {
        const hit = findAnchorInHtml(html, aiTokens.slice(i, i + size).join(' '))
        if (hit) return hit
      }
    }
  }

  const slug = slugTokensFromTarget(target)
  for (const win of tokenWindows(slug)) {
    const hit = findPhraseByTokens(html, win)
    if (hit) return hit
  }

  for (const term of [...slug].sort((a, b) => b.length - a.length)) {
    const hit = findPhraseByTokens(html, [term])
    if (!hit) continue
    const span = expandToPhrase(html, hit.index, hit.length)
    const text = html.slice(span.index, span.index + span.length)
    // Require two real content words (rejects awkward "Botox is" / "the botox").
    if (!text.includes('<') && significantTokens(text).length >= 2) {
      return span
    }
  }
  return null
}

const RELATED_BLOCK_RE =
  /<!--\s*gw-related-reading\s*-->[\s\S]*?<!--\s*\/gw-related-reading\s*-->/gi

export type LinkHygieneResult = {
  removedRelatedBlocks: number
  rewrittenHrefs: number
  unwrappedDuplicates: number
}

/**
 * Repair internal links already living in the page content:
 *   - strip appended "Related reading" stuffing blocks (previous behavior),
 *   - rewrite bare-slug blog hrefs to their canonical /blog/ permalink,
 *   - unwrap duplicate links to the same destination (keep the first).
 * This fixes content pushed before the permalink-alias fix without waiting for
 * new recommendations. Mutates the tree in place.
 */
export function normalizeElementorLinks(
  tree: ElementorNode[],
  siteBaseUrl?: string | null,
  pathAliases?: Map<string, string>,
): LinkHygieneResult {
  const result: LinkHygieneResult = {
    removedRelatedBlocks: 0,
    rewrittenHrefs: 0,
    unwrappedDuplicates: 0,
  }
  const editors = collectTextEditors(tree)
  const seenTargets = new Set<string>()

  for (const ed of editors) {
    if (!ed.settings) continue
    let html = String(ed.settings.editor ?? '')
    if (!html) continue
    const original = html

    // 1) Remove appended "Related reading" stuffing blocks.
    html = html.replace(RELATED_BLOCK_RE, () => {
      result.removedRelatedBlocks++
      return ''
    })

    // 2) Rewrite each internal href to its canonical permalink.
    html = html.replace(/(<a\b[^>]*\bhref=")([^"]+)(")/gi, (full, pre: string, href: string, post: string) => {
      const canonical = canonicalizeHref(href, siteBaseUrl, pathAliases)
      if (canonical && canonical !== href) {
        result.rewrittenHrefs++
        return `${pre}${canonical}${post}`
      }
      return full
    })

    // 3) Unwrap duplicate links to the same destination (keep the first per page).
    html = html.replace(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (full, href: string, inner: string) => {
      const key = href.replace(/\/$/, '').toLowerCase()
      if (seenTargets.has(key)) {
        result.unwrappedDuplicates++
        return inner // drop the anchor wrapper, keep the words
      }
      seenTargets.add(key)
      return full
    })

    if (html !== original) ed.settings.editor = html
  }
  return result
}

/** Resolve any href (absolute or path) to its canonical permalink, else null. */
function canonicalizeHref(
  href: string,
  siteBaseUrl?: string | null,
  pathAliases?: Map<string, string>,
): string | null {
  if (!pathAliases || pathAliases.size === 0) return null
  if (/^(mailto:|tel:|#)/i.test(href)) return null

  let path: string
  let wasAbsolute = false
  if (/^https?:\/\//i.test(href)) {
    try {
      path = new URL(href).pathname.replace(/\/$/, '') || '/'
      wasAbsolute = true
    } catch {
      return null
    }
  } else if (href.startsWith('/')) {
    path = href.replace(/\/$/, '') || '/'
  } else {
    return null
  }

  const canonicalPath = pathAliases.get(path)
  if (!canonicalPath || canonicalPath === path) return null

  return wasAbsolute ? toAbsoluteUrl(canonicalPath, siteBaseUrl) : canonicalPath
}

export type LinkPlacement = {
  href: string
  anchor: string
  /** existing = already linked; inline = wrapped in body prose; skipped = no natural home. */
  mode: 'existing' | 'inline' | 'skipped'
  reason?: string
}

export type LinkPatchOutcome = {
  changed: number
  placements: LinkPlacement[]
}

/**
 * Place internal links the way Google's 2026 guidance rewards: CONTEXTUAL,
 * in-body, and capped to a healthy ratio. See linkingStandards.ts.
 *
 *   1. Already present (href in the HTML) → counted, nothing to write.
 *   2. Inline: wrap the anchor phrase where it genuinely appears in body prose.
 *   3. Otherwise SKIP — we never dump links into an appended "related" list,
 *      because that reads as link stuffing and carries little SEO weight.
 *
 * Also enforces anchor diversity (no duplicate destinations, no repeated
 * anchors) and a per-page cap derived from body word count.
 */
export function patchLinkWidgetsDetailed(
  tree: ElementorNode[],
  linksSuggested: string,
  siteBaseUrl?: string | null,
  pathAliases?: Map<string, string>,
): LinkPatchOutcome {
  const editors = collectTextEditors(tree)
  const parsed = parseLinkSuggestions(linksSuggested).map((row) => ({
    ...row,
    target: normalizeLinkTarget(row.target, pathAliases),
  }))
  const suggestions = dedupeLinkPlan(parsed)
  if (!suggestions.length || !editors.length) return { changed: 0, placements: [] }

  // Body word count drives the healthy contextual-link ceiling.
  const bodyWords = countWords(
    editors.map((ed) => stripHtml(String(ed.settings?.editor ?? ''))).join(' '),
  )
  const maxLinks = maxContextualLinksForWordCount(bodyWords)

  let changed = 0
  let placedCount = 0
  const placements: LinkPlacement[] = []

  for (const row of suggestions) {
    const href = toAbsoluteUrl(row.target, siteBaseUrl)

    const alreadyPresent = editors.some((ed) => {
      const html = String(ed.settings?.editor ?? '')
      return html.includes(`href="${href}"`) || html.includes(`href='${href}'`)
    })
    if (alreadyPresent) {
      placements.push({ href, anchor: row.anchor, mode: 'existing' })
      placedCount++
      continue
    }

    // Respect the word-count cap: extra relevant links are skipped, not stuffed.
    if (placedCount >= maxLinks) {
      placements.push({ href, anchor: row.anchor, mode: 'skipped', reason: 'link budget reached' })
      continue
    }

    // Place the link on a REAL, descriptive phrase already in the body — using
    // the AI anchor when it fits, else a phrase derived from the destination's
    // own keywords. This is what makes placement reliable instead of dropping.
    let inlined = false
    for (const ed of editors) {
      if (!ed.settings) ed.settings = {}
      const html = String(ed.settings.editor ?? '')
      if (!html.trim()) continue
      const match = findNaturalAnchor(html, row.anchor, row.target)
      if (!match) continue
      const matchedText = html.slice(match.index, match.index + match.length)
      // Final safety: the placed anchor must itself be descriptive (>= 2 words).
      if (assessAnchorText(matchedText).ok === false && matchedText.trim().split(/\s+/).length < 2) {
        continue
      }
      ed.settings.editor =
        html.slice(0, match.index) +
        `<a href="${href}">${matchedText}</a>` +
        html.slice(match.index + match.length)
      changed++
      placedCount++
      inlined = true
      placements.push({ href, anchor: matchedText.trim(), mode: 'inline' })
      break
    }

    if (!inlined) {
      placements.push({
        href,
        anchor: row.anchor,
        mode: 'skipped',
        reason: 'body does not mention this topic — not forced',
      })
    }
  }

  return { changed, placements }
}

/** Backwards-compatible wrapper: returns the number of editors changed. */
export function patchLinkWidgets(
  tree: ElementorNode[],
  linksSuggested: string,
  siteBaseUrl?: string | null,
  pathAliases?: Map<string, string>,
): number {
  return patchLinkWidgetsDetailed(tree, linksSuggested, siteBaseUrl, pathAliases).changed
}

/** Apply approved content recommendations to synced Elementor JSON. */
export function applyContentRecommendationsToElementor(
  elementorDataRaw: string,
  recs: Rec[],
  opts?: { siteBaseUrl?: string | null; externalH1?: boolean; pathAliases?: Map<string, string> },
): ElementorPatchResult {
  const parsed = parseElementorRoot(elementorDataRaw)
  const byTab = new Map(recs.map((r) => [r.tab, r]))
  const summary: string[] = []
  const patched = { headings: 0, body: 0, links: 0 }

  // Repair FIRST: strip old "Related reading" stuffing blocks and fix bare-slug
  // permalinks BEFORE placing new links. Otherwise a new link could attach to a
  // phrase inside the stuffing block we're about to remove.
  const hygiene = normalizeElementorLinks(parsed.root, opts?.siteBaseUrl, opts?.pathAliases)
  if (hygiene.rewrittenHrefs > 0) summary.push(`${hygiene.rewrittenHrefs} link(s) fixed to /blog/ permalink`)
  if (hygiene.removedRelatedBlocks > 0) summary.push('removed related-reading block')
  if (hygiene.unwrappedDuplicates > 0) summary.push(`${hygiene.unwrappedDuplicates} duplicate link(s) removed`)

  const headings = byTab.get('headings')
  if (headings?.suggested?.trim()) {
    const n = patchHeadingWidgets(parsed.root, headings.suggested, {
      externalH1: opts?.externalH1,
    })
    if (n > 0) {
      patched.headings = n
      summary.push(`${n} heading${n === 1 ? '' : 's'}`)
    }
  }

  const body = byTab.get('body')
  if (body?.suggested?.trim()) {
    const n = patchBodyWidget(parsed.root, body.suggested)
    if (n > 0) {
      patched.body = n
      summary.push('body intro')
    }
  }

  const links = byTab.get('links')
  if (links?.suggested?.trim()) {
    const outcome = patchLinkWidgetsDetailed(
      parsed.root,
      links.suggested,
      opts?.siteBaseUrl,
      opts?.pathAliases,
    )
    const inlineNow = outcome.placements.filter((p) => p.mode === 'inline').length
    if (outcome.changed > 0) {
      patched.links = inlineNow
      summary.push(`${inlineNow} internal link${inlineNow === 1 ? '' : 's'}`)
    }
  }

  return {
    elementorData: serializeElementorRoot(parsed, parsed.root),
    summary,
    patched,
  }
}
