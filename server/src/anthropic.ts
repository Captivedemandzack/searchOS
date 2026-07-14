/**
 * Claude-powered generation (Phase 4).
 *
 * Produces SEO title/meta rewrites grounded in a page's real content and its
 * actual Search Console queries — not generic copy. Uses claude-opus-4-8 with
 * adaptive thinking and a JSON-schema-constrained response so the output is
 * always parseable.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  authorContextPromptBlock,
  MED_SPA_VOICE_RULES,
  SEO_HEADING_RULES,
  YMYL_EEAT_RULES,
  type AuthorContext,
} from './medicalCopyStandards.ts'

// Lazy singleton: the client reads ANTHROPIC_API_KEY (or an `ant auth login`
// profile) from the environment, which index.ts loads from .env.local *after*
// modules are imported — so construct on first use, not at module load.
let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error(
        'No Anthropic credentials found. Set ANTHROPIC_API_KEY in server/.env.local (or run `ant auth login`).',
      )
    }
    client = new Anthropic()
  }
  return client
}

export type GscQuerySample = {
  query: string
  impressions: number
  clicks: number
  ctr: number
  position: number
}

export type MetaRewriteInput = {
  path: string
  pageTitle: string | null
  currentMetaTitle: string | null
  currentMetaDesc: string | null
  contentSnippet: string | null
  diagnosis: string // the opportunity's "why"
  queries: GscQuerySample[]
  authorContext?: AuthorContext | null
}

export type MetaRewriteResult = {
  titleTag: string
  metaDescription: string
  titleReason: string
  metaReason: string
  targetQueries: string[]
}

const SYSTEM_PROMPT = `You are a senior technical SEO copywriter for a multi-location medical spa in Nashville, TN. You rewrite page title tags and meta descriptions to win more organic clicks.

${MED_SPA_VOICE_RULES}

${YMYL_EEAT_RULES}

Rules:
- Title tag: <= 60 characters. Lead with the primary query intent. Include the city ("Nashville") when the queries show local intent. Keep the brand ("SLK Clinic" or "SLK") only if it fits.
- Meta description: <= 155 characters. Active voice, one concrete hook (price anchor, duration, availability, or credential), and a soft call to action. Never keyword-stuff.
- Ground every choice in the provided Search Console queries. Target the highest-impression, lowest-CTR queries the page already ranks for.
- Match the intent of the query, don't invent facts. If you don't know a price or detail, don't state one.
- Reasoning must reference the specific queries/metrics you optimized for.
- For WordPress blog posts: you are rewriting the SEO title tag (Yoast/Rank Math field shown in Google search results), NOT the WordPress post title. The post title is the on-page H1 and its URL slug are left unchanged by this tool.`

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    titleTag: { type: 'string' },
    metaDescription: { type: 'string' },
    titleReason: { type: 'string' },
    metaReason: { type: 'string' },
    targetQueries: { type: 'array', items: { type: 'string' } },
  },
  required: ['titleTag', 'metaDescription', 'titleReason', 'metaReason', 'targetQueries'],
  additionalProperties: false,
} as const

function buildUserPrompt(input: MetaRewriteInput): string {
  const queryLines = input.queries.length
    ? input.queries
        .map(
          (q) =>
            `- "${q.query}": ${q.impressions.toLocaleString()} impressions, ${(q.ctr * 100).toFixed(1)}% CTR, avg position ${q.position.toFixed(1)}`,
        )
        .join('\n')
    : '(no query data available)'

  return [
    `Page: ${input.path}`,
    `Current <title>: ${input.currentMetaTitle ?? input.pageTitle ?? '(none)'}`,
    `Current meta description: ${input.currentMetaDesc ?? '(none)'}`,
    '',
    `Diagnosis / opportunity: ${input.diagnosis}`,
    '',
    'Top Search Console queries this page ranks for (optimize the title & meta for these):',
    queryLines,
    '',
    input.contentSnippet
      ? `Page content (for tone and factual grounding — do not invent facts beyond this):\n${input.contentSnippet}`
      : '(no page content available)',
    '',
    input.authorContext ? `\n${authorContextPromptBlock(input.authorContext)}` : '',
    'Rewrite the title tag and meta description per the rules.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Elementor JSON section generation (Phase 5)
// ---------------------------------------------------------------------------

export type ElementorGenInput = {
  request: string // what section to build
  placement: string | null
  styleReference: string | null // an excerpt of the site's existing _elementor_data
}

export type ElementorGenResult = {
  name: string
  placement: string
  rationale: string
  notes: string
  useCase: string
  elementor: unknown // the importable Elementor template object
}

const ELEMENTOR_SYSTEM = `You generate import-ready Elementor JSON sections for WordPress (Elementor 3.21+, container-based).

## Build rules (canonical — follow strictly)
- Use native Elementor settings first. Only reach for custom CSS/JS when Elementor cannot express the result.
- ZEROED SPACING DEFAULT: every container and widget starts with padding and margin zeroed; add spacing back deliberately via Elementor controls only where the section needs it.
- Put ALL styling on the element that owns it (heading typography on the heading widget, button colors on the button widget, container background/layout on the container). Never move normal widget styling into custom CSS.
- Build layout with containers (elType "container") and widgets (elType "widget"); no legacy sections/columns.

## Exact JSON structure
Return an object shaped like:
{
  "content": [ <top-level container> ],
  "page_settings": { "margin": <box>, "padding": <box> },
  "version": "0.4",
  "title": "<section name>",
  "type": "container"
}

Container: { "id": "<7-char unique id>", "settings": { ... }, "elements": [ ... ], "isInner": <bool>, "elType": "container" }
Widget:    { "id": "<7-char unique id>", "settings": { ... }, "elements": [], "isInner": false, "widgetType": "<heading|text-editor|button|image|icon-list|...>", "elType": "widget" }

Helpers used inside settings:
- box value: { "unit": "px", "top": "0", "right": "0", "bottom": "0", "left": "0", "isLinked": false }
- size value: { "unit": "px", "size": 48, "sizes": [] }
- Common container settings: content_width ("boxed"|"full"), boxed_width (size), flex_direction, flex_align_items, flex_gap ({column,row,isLinked,unit,size}), background_background ("classic"), background_color, padding, padding_tablet, padding_mobile, margin.
- Common widget settings: heading → title, header_size, align, title_color, typography_typography ("custom"), typography_font_family, typography_font_size (size), typography_font_weight; text-editor → editor ("<p>…</p>"), align, text_color; button → text, link ({url,is_external,nofollow,custom_attributes}), size, button_text_color, background_color, border_radius (box), text_padding (box), typography_*.
- Include responsive per-breakpoint values (…_tablet, …_mobile) for font sizes and padding.
- Every id must be unique. Use real, on-brand copy — never lorem ipsum.

If a style reference from the site's existing Elementor data is provided, MATCH its colors, font families, border radii, and spacing rhythm so the new section looks native to the site.

Return ONLY a JSON object with these keys: "name" (short section name), "placement" (where on the page), "rationale" (SEO reason), "notes" (design notes), "useCase" (one line), "elementor" (the template object above). No prose outside the JSON.`

export async function generateElementorSection(
  input: ElementorGenInput,
): Promise<ElementorGenResult> {
  const userPrompt = [
    `Build this Elementor section: ${input.request}`,
    input.placement ? `Target placement: ${input.placement}` : '',
    '',
    input.styleReference
      ? `Style reference — the site's existing Elementor data (match its colors, fonts, radii, spacing):\n${input.styleReference.slice(0, 6000)}`
      : 'No style reference available — use a clean, modern med-spa aesthetic.',
  ].join('\n')

  const response = await getClient().messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 12000,
    thinking: { type: 'adaptive' },
    system: ELEMENTOR_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to generate this section.')
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) throw new Error('Claude returned no text output.')

  // Extract the JSON object (tolerate any stray prose around it).
  const raw = textBlock.text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('No JSON found in the response.')
  const parsed = JSON.parse(raw.slice(start, end + 1)) as ElementorGenResult

  // Validate the importable template shape.
  const el = parsed.elementor as { content?: unknown; version?: unknown; type?: unknown } | undefined
  if (!el || !Array.isArray(el.content) || el.content.length === 0) {
    throw new Error('Generated Elementor JSON is missing a valid content array.')
  }
  if (el.version == null) (el as Record<string, unknown>).version = '0.4'
  if (el.type == null) (el as Record<string, unknown>).type = 'container'
  return parsed
}

// ---------------------------------------------------------------------------
// Competitor analysis (Phase 5)
// ---------------------------------------------------------------------------

export type CompetitorPage = {
  url: string
  title: string | null
  metaDesc: string | null
  headings: string[]
  wordCount: number
  textSnippet: string
}

export type CompetitorAnalysisInput = {
  targetKeyword: string
  ourPath: string | null
  ourTitle: string | null
  ourSnippet: string | null
  competitors: CompetitorPage[]
}

export type CompetitorGap = { title: string; detail: string; priority: 'High' | 'Medium' | 'Low' }
export type CompetitorAnalysisResult = {
  summary: string
  gaps: CompetitorGap[]
  recommendedSections: string[]
  competitorNotes: { url: string; observation: string }[]
}

const COMPETITOR_SYSTEM = `You are an SEO content strategist. You compare a client's page against the pages currently ranking for a target keyword and identify the concrete gaps the client must close to compete.

Rules:
- Be specific and actionable: name the sections, topics, schema, and conversion elements competitors have that the client lacks.
- Ground every gap in what the competitor pages actually contain (provided below). Do not invent competitor features.
- Prioritize gaps by likely ranking/conversion impact.
- "recommendedSections" should be concrete, buildable page sections (e.g. "Pricing table with per-unit cost", "FAQ answering 'how long does it last'").`

const COMPETITOR_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
        },
        required: ['title', 'detail', 'priority'],
        additionalProperties: false,
      },
    },
    recommendedSections: { type: 'array', items: { type: 'string' } },
    competitorNotes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { url: { type: 'string' }, observation: { type: 'string' } },
        required: ['url', 'observation'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'gaps', 'recommendedSections', 'competitorNotes'],
  additionalProperties: false,
} as const

export async function analyzeCompetitors(
  input: CompetitorAnalysisInput,
): Promise<CompetitorAnalysisResult> {
  const compBlocks = input.competitors
    .map((c, i) =>
      [
        `Competitor ${i + 1}: ${c.url}`,
        `  Title: ${c.title ?? '(none)'}`,
        `  Meta: ${c.metaDesc ?? '(none)'}`,
        `  Word count: ~${c.wordCount}`,
        `  Headings: ${c.headings.slice(0, 25).join(' | ') || '(none)'}`,
        `  Content excerpt: ${c.textSnippet.slice(0, 900)}`,
      ].join('\n'),
    )
    .join('\n\n')

  const userPrompt = [
    `Target keyword: "${input.targetKeyword}"`,
    '',
    `OUR page: ${input.ourPath ?? '(not specified)'}`,
    `OUR title: ${input.ourTitle ?? '(unknown)'}`,
    input.ourSnippet ? `OUR content excerpt: ${input.ourSnippet.slice(0, 900)}` : '',
    '',
    'COMPETITOR PAGES currently ranking:',
    compBlocks,
    '',
    'Analyze what these competitors do that our page does not, and how we close the gap.',
  ].join('\n')

  const response = await getClient().messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 6000,
    thinking: { type: 'adaptive' },
    system: COMPETITOR_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: COMPETITOR_SCHEMA } },
    messages: [{ role: 'user', content: userPrompt }],
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude declined this analysis.')
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) throw new Error('Claude returned no text output.')
  return JSON.parse(textBlock.text) as CompetitorAnalysisResult
}

export async function generateMetaRewrite(input: MetaRewriteInput): Promise<MetaRewriteResult> {
  const response = await getClient().messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate this rewrite (safety refusal).')
  }
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) throw new Error('Claude returned no text output.')

  const parsed = JSON.parse(textBlock.text) as MetaRewriteResult
  parsed.titleTag = humanizeText(parsed.titleTag)
  parsed.metaDescription = humanizeText(parsed.metaDescription)
  parsed.titleReason = humanizeText(parsed.titleReason)
  parsed.metaReason = humanizeText(parsed.metaReason)
  return parsed
}

// ---------------------------------------------------------------------------
// On-page content generation (Phase 6) — H1/H2s, body, FAQ, schema, links.
// Each produces a current→suggested diff grounded in the page's real data.
// ---------------------------------------------------------------------------

export type ContentUpdateType = 'headings' | 'body' | 'faq' | 'schema' | 'links'

export type ContentGenInput = {
  path: string
  pageTitle: string | null
  pageType: string // 'page' | 'post'
  contentSnippet: string | null
  headings: { tag: string; text: string }[]
  queries: GscQuerySample[]
  uncoveredQueries: string[]
  existingSchema: string | null
  /** @type values already on the live page (Yoast graph). */
  schemaTypesPresent?: string[]
  linkCandidates: {
    path: string
    title: string | null
    snippet: string
    score: number
    matchedTerms: string[]
  }[]
  authorContext?: AuthorContext | null
}

export type ContentUpdateResult = {
  current: string
  suggested: string
  reason: string
  targetQueries: string[]
}

const CONTENT_SCHEMA = {
  type: 'object',
  properties: {
    current: { type: 'string' },
    suggested: { type: 'string' },
    reason: { type: 'string' },
    targetQueries: { type: 'array', items: { type: 'string' } },
  },
  required: ['current', 'suggested', 'reason', 'targetQueries'],
  additionalProperties: false,
} as const

const CONTENT_BASE = `You are a senior technical SEO + content strategist for a multi-location medical spa in Nashville, TN (brand "SLK Clinic"). You produce concrete, on-brand, ready-to-paste on-page changes grounded in real Search Console data and the page's real content.

${MED_SPA_VOICE_RULES}

${YMYL_EEAT_RULES}

${SEO_HEADING_RULES}

Never invent facts (prices, credentials, results) beyond what the page content provides. Reference the specific queries/metrics you optimized for in your reasoning. Return "current" = what the page has today and "suggested" = the improved version.`

const HEADINGS_TASK_PAGE = `${CONTENT_BASE}

SEO heading rules (non-negotiable):
- Exactly one H1 per page. Multiple H1s hurt SEO and accessibility.
- On service/landing pages: exactly one H1 line in the outline; all section headings are H2 or H3.

Preserve headings that already cover real topics; add or refine only where needed. Use natural, benefit-led headings (not keyword-stuffed). "current" = the current outline, one line per heading prefixed "H1: ", "H2: ", "H3: ". "suggested" = the improved outline in the same format. "reason" names which uncovered searches the new/renamed headings now address.`

const HEADINGS_TASK_POST = `${CONTENT_BASE}

SEO heading rules for WordPress blog posts (non-negotiable):
- The WordPress post title is the only on-page H1. It is NOT edited here and the URL slug does not change.
- SEO title and meta description are handled in a separate step (Yoast/Rank Math). Do not duplicate them in this outline.
- Suggest H2 and H3 headings ONLY. Do NOT include any "H1:" lines in current or suggested.

Preserve headings that already cover real topics; add or refine only where needed. "current" = current in-body outline (H2/H3 only, prefix "H2: " or "H3: "). "suggested" = improved in-body outline (H2/H3 only). "reason" names which uncovered searches the new/renamed headings now address.`

const CONTENT_SYSTEM: Record<ContentUpdateType, string> = {
  headings: HEADINGS_TASK_PAGE,
  body: `${CONTENT_BASE}
Task: ADDITIVELY improve the page's opening/intro section so the first ~60 words lead with the primary query intent and the city when local. Preserve all existing facts, stats, studies, credentials, and pricing already in the current opening. Do not delete or replace clinical details. "current" = the current opening text (verbatim from the content). "suggested" = the improved opening (2-4 sentences) that keeps existing factual content and adds clarity/coverage. If no credentialed byline exists in the current opening, end "suggested" with: By <a href="TEAM_PAGE_PATH">Author Name, credentials</a> (use the author context provided). "reason" cites the queries it now speaks to.`,
  faq: `${CONTENT_BASE}
Task: write an FAQ section from the page's real question-style queries. "current" = "(no FAQ section)" unless the content already has one; if one exists, preserve existing Q&A and add new pairs. "suggested" = 4-6 Q&A pairs formatted "Q: …\\nA: …", each separated by a blank line, answering an actual question query. Keep answers factual, short, and aligned with E-E-A-T. Do not contradict studies or stats already on the page. "reason" lists the question queries covered. Also implies FAQPage schema eligibility.`,
  schema: `${CONTENT_BASE}
Task: suggest ONLY structured data types missing from the live Yoast SEO graph. Yoast already outputs Article/BlogPosting, WebPage, Organization, and BreadcrumbList for most pages — do NOT duplicate those. "current" = summary of what the live page already outputs (provided). "suggested" = JSON-LD for the missing type(s) ONLY (raw JSON, no <script> wrapper). For FAQPage, use exact Q&A from the FAQ section when provided. For service/location pages, LocalBusiness or MedicalBusiness only when absent. "reason" = which rich result each missing type targets.`,
  links: `${CONTENT_BASE}
Task: choose CONTEXTUAL internal links for THIS page, following current (2026) Google guidance. Candidate targets are pre-ranked by topical overlap and listed below. Rules:
- The anchor phrase MUST be copied VERBATIM from the "Page content" body copy below (exact words, same order), so it can be linked in place. Never invent an anchor that is not already in the body.
- Only link a target when the body genuinely discusses that topic near a phrase that describes the DESTINATION. If no natural, relevant phrase exists for a candidate, OMIT that target entirely — do not force it.
- Anchor text is descriptive and entity-rich: 3-8 words that describe the linked page. Never generic ("click here", "read more", "learn more").
- Vary anchors: never reuse the same anchor phrase, and never link the same destination twice.
- Prefer links in the first half of the body. Do NOT append a "related reading" list or a block of links — links must sit inside sentences.
- Quantity is intent-based: aim for roughly 2-5 links per 1,000 words of body copy. Fewer excellent contextual links beat more forced ones.
Output one line per link you actually place: "verbatim anchor from body" -> /path-from-list. Use each path exactly as shown; omit candidates you do not link. "current" = a short note on outbound internal links already in the body (or "No outbound internal links in body copy yet"). "reason" = one short sentence per link explaining the reader benefit.`,
}

function buildContentPrompt(type: ContentUpdateType, input: ContentGenInput): string {
  const queryLines = input.queries.length
    ? input.queries
        .map((q) => `- "${q.query}": ${q.impressions.toLocaleString()} impr, ${(q.ctr * 100).toFixed(1)}% CTR, pos ${q.position.toFixed(1)}`)
        .join('\n')
    : '(no query data)'
  const headingLines = input.headings.length
    ? input.headings.map((h) => `${h.tag}: ${h.text}`).join('\n')
    : '(no headings found)'

  const parts = [
    `Page: ${input.path} (${input.pageType})`,
    `Title: ${input.pageTitle ?? '(none)'}`,
    input.pageType === 'post'
      ? 'Page type note: WordPress blog post. Post title = on-page H1 (unchanged here). SEO title/meta = separate Yoast fields. Headings below must be H2/H3 only.'
      : '',
    '',
    'Current heading outline:',
    headingLines,
    '',
    'Top Search Console queries this page ranks for:',
    queryLines,
  ]
  if (input.uncoveredQueries.length && (type === 'headings' || type === 'faq' || type === 'body')) {
    parts.push('', `High-volume searches NO heading currently addresses: ${input.uncoveredQueries.join(', ')}`)
  }
  if (type === 'schema') {
    const present = input.schemaTypesPresent?.length
      ? input.schemaTypesPresent.join(', ')
      : '(unknown — sync WordPress)'
    parts.push('', `Live schema types already on this page (Yoast): ${present}`)
    if (input.existingSchema) {
      parts.push('', `Live JSON-LD graph (truncated):\n${input.existingSchema.slice(0, 2000)}`)
    }
    parts.push(
      '',
      'Only suggest JSON-LD for types NOT already listed above. Never output BlogPosting, Article, WebPage, Organization, or BreadcrumbList unless explicitly missing from the live list.',
    )
  }
  if (type === 'links') {
    parts.push(
      '',
      'Candidate link targets (pre-ranked by topical overlap; link ONLY the ones with a natural verbatim anchor in the body — omit the rest):',
      input.linkCandidates.length
        ? input.linkCandidates
            .map(
              (c, i) =>
                `${i + 1}. ${c.path}: ${c.title ?? ''} — overlap: ${c.matchedTerms.length ? c.matchedTerms.join(', ') : 'site structure'} (score ${c.score})`,
            )
            .join('\n')
        : '(no candidate target pages)',
    )
  }
  if (input.contentSnippet) {
    parts.push('', `Page content (for grounding, do not invent beyond this):\n${input.contentSnippet}`)
  }
  if (input.authorContext) {
    parts.push('', authorContextPromptBlock(input.authorContext))
  }
  parts.push('', 'Produce the change per the rules.')
  return parts.join('\n')
}

export async function generateContentUpdate(
  type: ContentUpdateType,
  input: ContentGenInput,
): Promise<ContentUpdateResult> {
  const system =
    type === 'headings' && input.pageType === 'post' ? HEADINGS_TASK_POST : CONTENT_SYSTEM[type]
  const response = await getClient().messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system,
    output_config: { format: { type: 'json_schema', schema: CONTENT_SCHEMA } },
    messages: [{ role: 'user', content: buildContentPrompt(type, input) }],
  })
  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate this content (safety refusal).')
  }
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) throw new Error('Claude returned no text output.')
  const parsed = JSON.parse(textBlock.text) as ContentUpdateResult
  if (type === 'headings' && input.pageType === 'post') {
    parsed.current = stripH1LinesFromOutline(parsed.current)
    parsed.suggested = stripH1LinesFromOutline(parsed.suggested)
  }
  return humanizeContentUpdate(parsed)
}

/** Remove H1 lines from a heading outline (blog posts use post title as the only H1). */
export function stripH1LinesFromOutline(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^H1:\s*/i.test(line.trim()))
    .join('\n')
    .trim()
}

function humanizeContentUpdate(res: ContentUpdateResult): ContentUpdateResult {
  return {
    current: humanizeText(res.current),
    suggested: humanizeText(res.suggested),
    reason: humanizeText(res.reason),
    targetQueries: res.targetQueries.map((q) => humanizeText(q)),
  }
}

// ---------------------------------------------------------------------------
// Blog post generation (Phase 6, Content Studio) — a full net-new article
// grounded in a real search gap, ready to publish to WordPress.
// ---------------------------------------------------------------------------

export type BlogGenInput = {
  targetKeyword: string
  angle: string | null // optional user steer
  relatedQueries: GscQuerySample[] // real GSC demand around the topic
  internalLinkTargets: { path: string; title: string | null }[] // existing pages to link to
  competitorNotes: string | null // gaps from a competitor scan, if any
  authorContext?: AuthorContext | null
}

export type BlogGenResult = {
  title: string
  metaTitle: string
  metaDescription: string
  slug: string
  excerpt: string
  bodyHtml: string
  faqs: { q: string; a: string }[]
  keywordCluster: { primary: string; supporting: string[] }
  internalLinks: { path: string; anchor: string }[] // this post → existing pages
  inboundLinks: { path: string; anchor: string }[] // existing pages → this post
  categories: string[]
  imageQuery: string
  targetQueries: string[]
}

const LINK_ITEMS = {
  type: 'array',
  items: {
    type: 'object',
    properties: { path: { type: 'string' }, anchor: { type: 'string' } },
    required: ['path', 'anchor'],
    additionalProperties: false,
  },
} as const

const BLOG_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    metaTitle: { type: 'string' },
    metaDescription: { type: 'string' },
    slug: { type: 'string' },
    excerpt: { type: 'string' },
    bodyHtml: { type: 'string' },
    faqs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { q: { type: 'string' }, a: { type: 'string' } },
        required: ['q', 'a'],
        additionalProperties: false,
      },
    },
    keywordCluster: {
      type: 'object',
      properties: {
        primary: { type: 'string' },
        supporting: { type: 'array', items: { type: 'string' } },
      },
      required: ['primary', 'supporting'],
      additionalProperties: false,
    },
    internalLinks: LINK_ITEMS,
    inboundLinks: LINK_ITEMS,
    categories: { type: 'array', items: { type: 'string' } },
    imageQuery: { type: 'string' },
    targetQueries: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'title', 'metaTitle', 'metaDescription', 'slug', 'excerpt', 'bodyHtml',
    'faqs', 'keywordCluster', 'internalLinks', 'inboundLinks', 'categories',
    'imageQuery', 'targetQueries',
  ],
  additionalProperties: false,
} as const

const BLOG_SYSTEM = `You are a senior SEO content writer for a multi-location medical spa in Nashville, TN (brand "SLK Clinic"). You write net-new blog posts that rank and convert, grounded in real Search Console demand. You are factual and never invent prices, medical claims, or results not generally established. When medical, stay accurate and add a light "consult a licensed provider" note where appropriate.

${MED_SPA_VOICE_RULES}

${YMYL_EEAT_RULES}

Output requirements:
- title: compelling H1/post title, includes the primary keyword naturally.
- metaTitle: <= 60 chars, primary keyword first, city when local intent, brand if it fits.
- metaDescription: <= 155 chars, active voice, one concrete hook + soft CTA.
- slug: lowercase, hyphenated, <= 6 words, from the primary keyword.
- excerpt: 1-2 sentence summary.
- bodyHtml: the full article as clean WordPress-ready HTML. Use <h2>/<h3> headings that target the cluster's supporting keywords, <p>, <ul>/<li>, and <strong>. Open by answering the query intent in the first ~50 words. After the intro, include a credentialed author byline linked to the team page (use author context when provided). 700-1200 words. Do NOT include the H1 (WordPress renders the title). No inline styles, no <html>/<body> wrappers, no markdown.
- faqs: 3-5 Q&A pairs from real question-style queries.
- keywordCluster: the topical cluster this post targets — { primary: the main keyword, supporting: 4-8 closely-related/semantic keywords the article should and does cover }. Build supporting from the provided Search Console queries plus obvious close variants; every supporting keyword must be genuinely covered by a heading or section in bodyHtml.
- internalLinks (OUTBOUND — from this new post to existing pages): 2-5 links {path, anchor}, choosing ONLY from the provided existing pages where topically relevant, woven naturally.
- inboundLinks (INBOUND — existing pages that should add a link pointing TO this new post): 2-4 {path, anchor}, choosing ONLY from the provided existing pages whose content is topically related, with the anchor text those pages should use. This builds the hub/spoke internal-link strategy.
- categories: 1-2 WordPress category names (e.g. "Injectables", "Skin", "Body Contouring").
- imageQuery: a concise stock-photo search phrase for a fitting featured image (e.g. "med spa botox treatment").
- Ground headings and FAQ in the provided Search Console queries.`

function buildBlogPrompt(input: BlogGenInput): string {
  const queryLines = input.relatedQueries.length
    ? input.relatedQueries
        .map((q) => `- "${q.query}": ${q.impressions.toLocaleString()} impr, ${(q.ctr * 100).toFixed(1)}% CTR, pos ${q.position.toFixed(1)}`)
        .join('\n')
    : '(no direct query data — write to the primary keyword intent)'
  const linkLines = input.internalLinkTargets.length
    ? input.internalLinkTargets.map((p) => `- ${p.path}: ${p.title ?? ''}`).join('\n')
    : '(no internal pages provided)'

  return [
    `Primary keyword / topic: ${input.targetKeyword}`,
    input.angle ? `Requested angle: ${input.angle}` : '',
    '',
    'Real Search Console demand around this topic (target these in headings & FAQ):',
    queryLines,
    '',
    'Existing pages on the site (use for BOTH internalLinks [this post → these] and inboundLinks [these → this post]):',
    linkLines,
    input.competitorNotes ? `\nCompetitor gaps to beat:\n${input.competitorNotes}` : '',
    input.authorContext ? `\n${authorContextPromptBlock(input.authorContext)}` : '',
    '',
    'Write the complete blog post per the rules.',
  ].join('\n')
}

export async function generateBlogPost(input: BlogGenInput): Promise<BlogGenResult> {
  const response = await getClient().messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    thinking: { type: 'adaptive' },
    system: BLOG_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: BLOG_SCHEMA } },
    messages: [{ role: 'user', content: buildBlogPrompt(input) }],
  })
  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate this post (safety refusal).')
  }
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) throw new Error('Claude returned no text output.')
  const parsed = JSON.parse(textBlock.text) as BlogGenResult

  // Belt-and-suspenders: strip any em/en dashes the model still slipped in so the
  // copy always reads naturally.
  parsed.title = humanizeText(parsed.title)
  parsed.metaTitle = humanizeText(parsed.metaTitle)
  parsed.metaDescription = humanizeText(parsed.metaDescription)
  parsed.excerpt = humanizeText(parsed.excerpt)
  parsed.bodyHtml = humanizeText(parsed.bodyHtml)
  parsed.faqs = parsed.faqs.map((f) => ({ q: humanizeText(f.q), a: humanizeText(f.a) }))
  return parsed
}

/**
 * Normalize AI-tell punctuation to natural human writing: no em/en dashes.
 * Number ranges become hyphens ("6-10"); clause-break dashes become commas.
 */
export function humanizeText(s: string): string {
  if (!s) return s
  return s
    .replace(/(\$?\d[\d,]*)\s*[—–]\s*(\$?\d[\d,]*)/g, '$1-$2') // ranges: 6–10, $240–$480
    .replace(/(\d)\s*[—–]\s*(\d)/g, '$1-$2') // simple digit ranges
    .replace(/\s*[—–]\s*/g, ', ') // clause breaks → comma
    .replace(/,\s*,/g, ',') // tidy any doubled commas
    .replace(/\s+,/g, ',')
    .replace(/,(\s*[.!?;:])/g, '$1') // comma immediately before end punctuation
    .replace(/ {2,}/g, ' ')
}
