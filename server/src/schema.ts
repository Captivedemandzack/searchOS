/** Live + delta structured data helpers (Yoast head JSON, body fallbacks, FAQPage). */

export type SchemaGraph = { '@context'?: string; '@graph'?: unknown[]; '@type'?: string }

export function parseExistingSchema(html: string | null | undefined): string | null {
  if (!html) return null
  const blocks: string[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim()
    if (!raw) continue
    try {
      JSON.parse(raw)
      blocks.push(raw)
    } catch {
      /* skip invalid JSON-LD */
    }
  }
  if (!blocks.length) return null
  return blocks.length === 1 ? blocks[0] : JSON.stringify(blocks.map((b) => JSON.parse(b)))
}

/** Pull JSON-LD graph from Yoast REST field (yoast_head_json.schema). */
export function extractLiveSchemaFromWpItem(item: Record<string, unknown>): string | null {
  const yoast = item.yoast_head_json as { schema?: unknown } | undefined
  if (yoast?.schema) return JSON.stringify(yoast.schema, null, 2)

  const rankSchema = item.rank_math_schema
  if (rankSchema != null && rankSchema !== '') {
    return typeof rankSchema === 'string' ? rankSchema : JSON.stringify(rankSchema, null, 2)
  }

  const content = item.content as { rendered?: string } | undefined
  return parseExistingSchema(content?.rendered ?? null)
}

export function resolvePageSchema(page: {
  liveSchemaJson?: string | null
  contentHtml?: string | null
} | null): string | null {
  if (!page) return null
  if (page.liveSchemaJson?.trim()) return page.liveSchemaJson
  return parseExistingSchema(page.contentHtml)
}

function parseGraph(raw: string | null | undefined): SchemaGraph | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as SchemaGraph
  } catch {
    return null
  }
}

function flattenTypes(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  const t = obj['@type']
  if (typeof t === 'string') out.add(t)
  if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') out.add(x)
  if (Array.isArray(obj['@graph'])) {
    for (const piece of obj['@graph']) flattenTypes(piece, out)
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') flattenTypes(v, out)
  }
}

/** Distinct schema.org @type values present in a graph (e.g. BlogPosting, FAQPage). */
export function collectSchemaTypes(schemaJson: string | null | undefined): string[] {
  const graph = parseGraph(schemaJson)
  if (!graph) return []
  const types = new Set<string>()
  flattenTypes(graph, types)
  return [...types].sort()
}

export function formatSchemaTypeSummary(types: string[]): string {
  if (!types.length) return 'No structured data detected'
  return types.join(', ')
}

/** Human-readable block for the Schema tab "live" column. */
export function formatLiveSchemaDisplay(schemaJson: string | null | undefined): string {
  if (!schemaJson?.trim()) {
    return 'No structured data detected on the live page (sync WordPress to refresh).'
  }
  const types = collectSchemaTypes(schemaJson)
  const header = `Live graph (${formatSchemaTypeSummary(types)})`
  try {
    const pretty = JSON.stringify(JSON.parse(schemaJson), null, 2)
    return `${header}\n\n${pretty}`
  } catch {
    return `${header}\n\n${schemaJson}`
  }
}

export type SchemaDeltaPlan = {
  present: string[]
  missing: string[]
  source: 'yoast' | 'body' | 'none'
}

/** What to add on top of Yoast's automatic graph — never duplicate Article/BlogPosting. */
export function planSchemaDelta(
  liveSchemaJson: string | null | undefined,
  opts: { pageType: string; hasFaqContent: boolean },
): SchemaDeltaPlan {
  const present = collectSchemaTypes(liveSchemaJson)
  const missing: string[] = []

  if (opts.hasFaqContent && !present.includes('FAQPage')) {
    missing.push('FAQPage')
  }

  if (
    opts.pageType === 'page' &&
    !present.some((t) => /MedicalBusiness|LocalBusiness|HealthAndBeautyBusiness/i.test(t))
  ) {
    missing.push('LocalBusiness')
  }

  return {
    present,
    missing,
    source: liveSchemaJson?.trim() ? 'yoast' : 'none',
  }
}

export function parseFaqPairs(text: string): { q: string; a: string }[] {
  const chunks = text.split(/\n(?=Q:\s)/i).filter((c) => c.trim())
  const pairs: { q: string; a: string }[] = []
  for (const chunk of chunks) {
    const m = chunk.match(/^Q:\s*(.+?)(?:\nA:\s*([\s\S]+))?$/i)
    if (m) pairs.push({ q: m[1].trim(), a: (m[2] ?? '').trim() })
  }
  return pairs.filter((p) => p.q && p.a)
}

/** Deterministic FAQPage JSON-LD from FAQ tab copy. */
export function buildFaqPageSchema(pairs: { q: string; a: string }[], pageUrl: string): string {
  const graph = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map((p) => ({
      '@type': 'Question',
      name: p.q,
      acceptedAnswer: { '@type': 'Answer', text: p.a },
    })),
    url: pageUrl,
  }
  return JSON.stringify(graph, null, 2)
}

export function wrapSchemaScript(json: string): string {
  const trimmed = json.trim()
  if (trimmed.includes('<script')) return trimmed
  return `<script type="application/ld+json">\n${trimmed}\n</script>`
}

export function stripSchemaScript(text: string): string {
  return text.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '').trim()
}
