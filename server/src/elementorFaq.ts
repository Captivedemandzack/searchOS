/**
 * Build and append FAQ sections as native Elementor container JSON.
 * Q&A copy comes from AI; layout is deterministic and styled from the synced page.
 */

import {
  type ElementorNode,
  parseElementorRoot,
  serializeElementorRoot,
  stripHtml,
} from './elementorPatch.ts'

export type FaqPair = { q: string; a: string }

/**
 * Style tokens for a native Elementor accordion FAQ. Defaults are the site's
 * real brand values (lifted from an on-brand FAQ the client exported): Modny
 * display font, Quasimoda body, warm stone palette. Extraction prefers an
 * existing accordion on the page so it always tracks the live brand.
 */
export type FaqStyleTokens = {
  /** Stone background on the accordion block only, not the full section. */
  faqBlockBg: string
  boxedWidth: number
  headingColor: string
  headingFont: string
  titleColor: string
  titleActiveColor: string
  titleFont: string
  contentColor: string
  contentFont: string
  borderColor: string
}

// Kept for back-compat with existing imports.
export type ElementorStyleTokens = FaqStyleTokens

const DEFAULT_TOKENS: FaqStyleTokens = {
  faqBlockBg: '#ECEBE8',
  boxedWidth: 1100,
  headingColor: '#322C2D',
  headingFont: 'Modny',
  titleColor: '#322C2D',
  titleActiveColor: '#58585B',
  titleFont: 'Modny',
  contentColor: '#58585B',
  contentFont: 'Quasimoda',
  borderColor: '#D2D2D2',
}

const FAQ_MARKER = '_groundwork_faq_section'

function elId(): string {
  return Math.random().toString(36).slice(2, 9)
}

function zeroBox() {
  return { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true }
}

function box(top: string, right: string, bottom: string, left: string, linked = false) {
  return { unit: 'px', top, right, bottom, left, isLinked: linked }
}

function sizePx(size: number) {
  return { unit: 'px', size, sizes: [] }
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

function readColor(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value
  return null
}

function readFontFamily(settings: Record<string, unknown> | undefined): string | null {
  if (!settings) return null
  const fam = settings.typography_font_family
  return typeof fam === 'string' && fam.trim() ? fam.trim() : null
}

function familyFromTypography(s: Record<string, unknown>, prefix: string): string | null {
  const fam = s[`${prefix}_font_family`]
  return typeof fam === 'string' && fam.trim() ? fam.trim() : null
}

/**
 * Derive on-brand FAQ styling. We prefer an existing accordion widget on the
 * page — that is the exact, proven FAQ styling the site already uses — and only
 * fall back to brand defaults when none exists. This is why the old approach
 * failed: it scraped a random dark section background instead of the FAQ style.
 */
export function extractElementorStyleTokens(elementorDataRaw: string | null): FaqStyleTokens {
  const tokens = { ...DEFAULT_TOKENS }
  if (!elementorDataRaw?.trim()) return tokens

  let parsed: ReturnType<typeof parseElementorRoot>
  try {
    parsed = parseElementorRoot(elementorDataRaw)
  } catch {
    return tokens
  }

  // Pass 1: find an existing accordion and lift its exact styling + the
  // background/width of its containing section.
  let foundAccordion = false
  const walk = (
    nodes: ElementorNode[],
    containerBg: string | null,
    parent: ElementorNode | null,
    boxedWidth: number | null,
  ) => {
    for (const n of nodes) {
      const s = n.settings ?? {}
      let nextBg = containerBg
      let nextBoxed = boxedWidth
      if (n.elType === 'container') {
        const bg = readColor(s.background_color)
        if (bg && bg.toLowerCase() !== '#ffffff') nextBg = bg
        const bw = s.boxed_width as { size?: number } | undefined
        if (typeof bw?.size === 'number' && bw.size >= 600 && bw.size <= 1300) nextBoxed = bw.size
      }

      if (!foundAccordion && (n.widgetType === 'accordion' || n.widgetType === 'toggle')) {
        foundAccordion = true
        const titleColor = readColor(s.title_color)
        const activeColor = readColor(s.tab_active_color)
        const contentColor = readColor(s.content_color)
        const border = readColor(s.border_color)
        const titleFont = familyFromTypography(s, 'title_typography')
        const contentFont = familyFromTypography(s, 'content_typography')
        const blockBg =
          readColor(s.background_color) ??
          (parent?.elType === 'container' ? readColor(parent.settings?.background_color) : null) ??
          nextBg
        if (titleColor) tokens.titleColor = titleColor
        if (activeColor) tokens.titleActiveColor = activeColor
        if (contentColor) tokens.contentColor = contentColor
        if (border) tokens.borderColor = border
        if (titleFont) {
          tokens.titleFont = titleFont
          tokens.headingFont = titleFont
        }
        if (contentFont) tokens.contentFont = contentFont
        if (titleColor) tokens.headingColor = titleColor
        if (blockBg && blockBg.toLowerCase() !== '#ffffff') tokens.faqBlockBg = blockBg
        if (nextBoxed) tokens.boxedWidth = nextBoxed
      }

      if (Array.isArray(n.elements)) walk(n.elements, nextBg, n, nextBoxed)
    }
  }
  walk(parsed.root, null, null, null)
  if (foundAccordion) return tokens

  // Pass 2 (no accordion on this page): keep brand defaults, but adopt the
  // heading font if the page clearly uses a custom display font.
  for (const n of collectHeadings(parsed.root)) {
    const fam = readFontFamily(n.settings)
    if (fam) {
      tokens.headingFont = fam
      tokens.titleFont = fam
      break
    }
  }
  return tokens
}

function collectHeadings(nodes: ElementorNode[]): ElementorNode[] {
  const out: ElementorNode[] = []
  const walk = (arr: ElementorNode[]) => {
    for (const n of arr) {
      if (n.widgetType === 'heading') out.push(n)
      if (Array.isArray(n.elements)) walk(n.elements)
    }
  }
  walk(nodes)
  return out
}

function faqHeadingWidget(title: string, tokens: FaqStyleTokens): ElementorNode {
  return {
    id: elId(),
    elType: 'widget',
    widgetType: 'heading',
    isInner: false,
    settings: {
      title,
      header_size: 'h2',
      align: 'center',
      title_color: tokens.headingColor,
      typography_typography: 'custom',
      typography_font_family: tokens.headingFont,
      typography_font_size: sizePx(42),
      typography_font_size_tablet: sizePx(38),
      typography_font_size_mobile: sizePx(30),
      typography_font_weight: '200',
      typography_text_transform: 'uppercase',
      typography_line_height: { unit: 'em', size: 1.08, sizes: [] },
      typography_letter_spacing: { unit: 'px', size: 0.1, sizes: [] },
      _margin: zeroBox(),
      _padding: zeroBox(),
    },
    elements: [],
  }
}

/**
 * Native Elementor Accordion widget. This is what the site actually uses for
 * FAQs: collapsible rows, brand typography, and `faq_schema: yes` so Elementor
 * emits FAQPage structured data automatically. Fully editable after push.
 */
function faqAccordionWidget(pairs: FaqPair[], tokens: FaqStyleTokens): ElementorNode {
  return {
    id: elId(),
    elType: 'widget',
    widgetType: 'accordion',
    isInner: false,
    settings: {
      tabs: pairs.map((p) => ({
        tab_title: stripHtml(p.q).trim(),
        tab_content: proseToEditorHtml(p.a),
        _id: elId(),
      })),
      faq_schema: 'yes',
      border_width: sizePx(1),
      border_color: tokens.borderColor,
      title_color: tokens.titleColor,
      tab_active_color: tokens.titleActiveColor,
      title_typography_typography: 'custom',
      title_typography_font_family: tokens.titleFont,
      title_typography_font_size: sizePx(24),
      title_typography_font_size_mobile: sizePx(18),
      title_typography_font_weight: '300',
      title_typography_text_transform: 'uppercase',
      title_typography_line_height: sizePx(34),
      content_color: tokens.contentColor,
      content_typography_typography: 'custom',
      content_typography_font_family: tokens.contentFont,
      content_typography_font_size: sizePx(16),
      content_typography_line_height: sizePx(28),
      icon_space: sizePx(10),
      _margin: zeroBox(),
      _padding: zeroBox(),
    },
    elements: [],
  }
}

/**
 * Inner container carrying the stone background — only the accordion block is
 * tinted so the FAQ feels like part of the blog, not a separate page band.
 */
function faqAccordionBlockContainer(accordion: ElementorNode, tokens: FaqStyleTokens): ElementorNode {
  return {
    id: elId(),
    elType: 'container',
    isInner: true,
    settings: {
      content_width: 'full',
      flex_direction: 'column',
      background_background: 'classic',
      background_color: tokens.faqBlockBg,
      padding: box('8', '24', '8', '24'),
      padding_mobile: box('8', '16', '8', '16'),
      margin: zeroBox(),
    },
    elements: [accordion],
  }
}

/**
 * Blog-native FAQ section: heading on the page canvas, accordion in a tinted
 * block. No full-width section background — matches the SLK blog pattern.
 */
export function buildFaqElementorSection(
  pairs: FaqPair[],
  opts?: { styleReference?: string | null; sectionTitle?: string },
): ElementorNode {
  const tokens = extractElementorStyleTokens(opts?.styleReference ?? null)
  const title = opts?.sectionTitle?.trim() || 'Frequently Asked Questions'
  const accordion = faqAccordionWidget(pairs, tokens)

  return {
    id: elId(),
    elType: 'container',
    isInner: false,
    settings: {
      [FAQ_MARKER]: '1',
      content_width: 'boxed',
      boxed_width: sizePx(tokens.boxedWidth),
      flex_direction: 'column',
      flex_gap: { unit: 'px', column: '24', row: '24', isLinked: true, size: 24 },
      // No section padding: the FAQ flows inline with blog content like any
      // other post section. Only the inner accordion block carries a background.
      padding: zeroBox(),
      margin: zeroBox(),
    },
    elements: [faqHeadingWidget(title, tokens), faqAccordionBlockContainer(accordion, tokens)],
  }
}

export function findGroundworkFaqContainer(nodes: ElementorNode[]): ElementorNode | null {
  for (const n of nodes) {
    if (n.elType === 'container' && n.settings?.[FAQ_MARKER] === '1') return n
    if (Array.isArray(n.elements)) {
      const found = findGroundworkFaqContainer(n.elements)
      if (found) return found
    }
  }
  return null
}

export function hasFaqSectionMarker(nodes: ElementorNode[]): boolean {
  return !!findGroundworkFaqContainer(nodes)
}

export type FaqAppendResult = {
  elementorData: string
  summary: string[]
  action: 'appended' | 'replaced' | 'skipped'
  insertIndex?: number
}

/** Collect visible copy from a node tree (headings, text editors, buttons). */
export function collectNodeText(node: ElementorNode): string {
  const s = node.settings ?? {}
  const parts: string[] = []
  if (s.title) parts.push(stripHtml(String(s.title)))
  if (s.editor) parts.push(stripHtml(String(s.editor)))
  if (s.text) parts.push(stripHtml(String(s.text)))
  for (const child of node.elements ?? []) parts.push(collectNodeText(child))
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

const FINAL_CTA_COPY_RE =
  /book\s+(your\s+)?free\s+consultation|book\s+(a|your)\s+consultation|schedule\s+(your\s+)?(free\s+)?consultation|book\s+an?\s+appointment/i

function nodeHasWidget(node: ElementorNode, widgetType: string): boolean {
  if (node.widgetType === widgetType) return true
  return (node.elements ?? []).some((c) => nodeHasWidget(c, widgetType))
}

function isReferencesSection(node: ElementorNode): boolean {
  const text = collectNodeText(node)
  if (!text) return false
  if (/^(references|sources)\b/i.test(text)) return true
  return text.length < 400 && /\b(references|sources)\b/i.test(text) && !/\?/.test(text)
}

/** Final CTA copy block, e.g. "BOOK YOUR FREE CONSULTATION at our Nashville location". */
function isStrongFinalCtaSection(node: ElementorNode): boolean {
  return FINAL_CTA_COPY_RE.test(collectNodeText(node))
}

/** Trailing button row paired with the consultation CTA (Book / Schedule). */
function isCtaButtonSection(node: ElementorNode): boolean {
  if (!nodeHasWidget(node, 'button')) return false
  const text = collectNodeText(node).toLowerCase()
  if (text.length > 120) return false
  return /book|consultation|appointment|schedule/.test(text)
}

/**
 * Where to insert the FAQ section among root-level Elementor nodes.
 * Rule: immediately before the final on-page CTA block (consultation copy +
 * its button), and always before references/sources. Early "Book Now" hooks
 * near the top of the post are ignored.
 */
export function findFaqInsertIndex(roots: ElementorNode[]): number {
  const nodes = roots.filter((n) => n.settings?.[FAQ_MARKER] !== '1')

  let i = nodes.length - 1
  while (i >= 0 && isReferencesSection(nodes[i])) i--

  let ctaBlockStart = -1
  while (i >= 0 && (isStrongFinalCtaSection(nodes[i]) || isCtaButtonSection(nodes[i]))) {
    ctaBlockStart = i
    i--
  }
  if (ctaBlockStart >= 0) return ctaBlockStart

  const refIdx = nodes.findIndex(isReferencesSection)
  if (refIdx >= 0) return refIdx

  return nodes.length
}

/** Merge a Groundwork FAQ container into synced page Elementor JSON. */
export function appendFaqSectionToElementor(
  elementorDataRaw: string,
  faqSection: ElementorNode,
): FaqAppendResult {
  const parsed = parseElementorRoot(elementorDataRaw)
  const roots = [...parsed.root]

  const existingIdx = roots.findIndex((n) => n.settings?.[FAQ_MARKER] === '1')
  const existing = existingIdx >= 0 ? roots[existingIdx] : null
  if (existingIdx >= 0) roots.splice(existingIdx, 1)

  const sectionToInsert = existing
    ? { ...faqSection, id: existing.id ?? faqSection.id }
    : faqSection

  const insertAt = findFaqInsertIndex(roots)
  roots.splice(insertAt, 0, sectionToInsert)

  return {
    elementorData: serializeElementorRoot(parsed, roots),
    summary: [
      existing
        ? 'FAQ section (updated, placed before final CTA)'
        : 'FAQ section (placed before final CTA)',
    ],
    action: existing ? 'replaced' : 'appended',
    insertIndex: insertAt,
  }
}

/** Serialize a FAQ section for storage on the recommendation row. */
export function serializeFaqSectionForStorage(section: ElementorNode): string {
  return JSON.stringify(section, null, 2)
}

export function parseFaqSectionFromStorage(raw: string | null | undefined): ElementorNode | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as ElementorNode
  } catch {
    return null
  }
}

const FAQ_HTML_START = '<!-- groundwork-faq -->'
const FAQ_HTML_END = '<!-- /groundwork-faq -->'

/**
 * Route FAQ by how the page/post actually renders, NOT by post vs page.
 * If it has its own Elementor builder data, the frontend renders that data
 * (even for posts built directly in Elementor), so FAQ must append there.
 * Only pages/posts with no builder data fall back to post_content HTML.
 */
export function faqUsesElementorSection(page: {
  type: string
  elementorData: string | null
}): boolean {
  return !!page.elementorData?.trim()
}

/** Semantic FAQ HTML for post_content (renders inside Theme Builder Post Content widget). */
export function buildFaqPostContentHtml(pairs: FaqPair[]): string {
  const items = pairs
    .map(
      (p) =>
        `<div class="gw-faq-item">\n<h3 class="gw-faq-question">${escapeHtml(p.q)}</h3>\n<p class="gw-faq-answer">${escapeHtml(p.a)}</p>\n</div>`,
    )
    .join('\n')
  return `${FAQ_HTML_START}
<section class="gw-faq-section" aria-label="Frequently Asked Questions">
<h2 class="gw-faq-heading">Frequently Asked Questions</h2>
<div class="gw-faq-list">
${items}
</div>
</section>
${FAQ_HTML_END}`
}

const FAQ_HTML_BLOCK_RE = /<!--\s*groundwork-faq\s*-->[\s\S]*?<!--\s*\/groundwork-faq\s*-->/i

const FINAL_CTA_HTML_RE =
  /<(?:p|h[1-6])[^>]*>[\s\S]*?book\s+(your\s+)?free\s+consultation[\s\S]*?<\/(?:p|h[1-6])>/i

const REFERENCES_HTML_RE = /<h[1-6][^>]*>\s*(?:references|sources)\s*<\/h[1-6]>/i

function insertFaqBlockBeforeAnchor(html: string, block: string): string {
  const ctaMatch = html.search(FINAL_CTA_HTML_RE)
  if (ctaMatch >= 0) {
    return `${html.slice(0, ctaMatch).trimEnd()}\n\n${block}\n\n${html.slice(ctaMatch).trimStart()}`
  }
  const refMatch = html.search(REFERENCES_HTML_RE)
  if (refMatch >= 0) {
    return `${html.slice(0, refMatch).trimEnd()}\n\n${block}\n\n${html.slice(refMatch).trimStart()}`
  }
  const trimmed = html.trim()
  return trimmed ? `${trimmed}\n\n${block}` : block
}

export function mergeFaqIntoPostContent(baseHtml: string, pairs: FaqPair[]): string {
  if (!pairs.length) return baseHtml
  const block = buildFaqPostContentHtml(pairs)
  const withoutFaq = FAQ_HTML_BLOCK_RE.test(baseHtml)
    ? baseHtml.replace(FAQ_HTML_BLOCK_RE, '').trim()
    : baseHtml.trim()
  return insertFaqBlockBeforeAnchor(withoutFaq, block)
}

export function detectExistingFaqInHtml(html: string | null | undefined): string {
  if (!html?.trim()) return ''
  if (FAQ_HTML_BLOCK_RE.test(html)) return 'FAQ section in post content'
  if (/<h[1-4][^>]*>[^<]*frequently asked/i.test(html)) return 'FAQ section in post content'
  return ''
}

/** Detect whether the page already has visible FAQ copy in Elementor widgets. */
export function detectExistingFaqCopy(nodes: ElementorNode[]): string {
  const headings = collectFaqHeadings(nodes)
  if (headings.length) return headings.join('\n')
  return ''
}

function collectFaqHeadings(nodes: ElementorNode[]): string[] {
  const out: string[] = []
  const walk = (arr: ElementorNode[]) => {
    for (const n of arr) {
      if (n.widgetType === 'heading' && n.settings?.title != null) {
        const t = stripHtml(String(n.settings.title))
        if (/frequently asked|faq/i.test(t)) out.push(t)
      }
      if (Array.isArray(n.elements)) walk(n.elements)
    }
  }
  walk(nodes)
  return out
}
