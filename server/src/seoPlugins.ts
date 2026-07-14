/** Known WordPress SEO plugins and how Groundwork can interact with them. */

export type SeoMetaAdapter = 'yoast' | 'rank-math' | 'seopress' | 'aioseo'
export type SeoRedirectAdapter = 'rank-math' | 'redirection' | 'yoast-premium'

export type SeoPluginCatalogEntry = {
  id: string
  displayName: string
  role: 'primary' | 'extension' | 'redirect'
  patterns: RegExp[]
  metaAdapter?: SeoMetaAdapter
  /** REST redirect publish is implemented in redirectFacts.ts for these adapters. */
  redirectAdapter?: SeoRedirectAdapter
  redirectImplemented?: boolean
}

export const SEO_PLUGIN_CATALOG: SeoPluginCatalogEntry[] = [
  {
    id: 'yoast-premium',
    displayName: 'Yoast SEO Premium',
    role: 'extension',
    patterns: [/wordpress-seo-premium/i, /yoast seo premium/i],
    redirectAdapter: 'yoast-premium',
    redirectImplemented: false,
  },
  {
    id: 'yoast-local',
    displayName: 'Yoast Local',
    role: 'extension',
    patterns: [/wpseo-local/i, /yoast seo:\s*local/i],
  },
  {
    id: 'yoast-video',
    displayName: 'Yoast Video',
    role: 'extension',
    patterns: [/wpseo-video/i, /yoast seo:\s*video/i],
  },
  {
    id: 'yoast-news',
    displayName: 'Yoast News',
    role: 'extension',
    patterns: [/wpseo-news/i],
  },
  {
    id: 'yoast-woocommerce',
    displayName: 'Yoast WooCommerce',
    role: 'extension',
    patterns: [/wpseo-woocommerce/i],
  },
  {
    id: 'yoast',
    displayName: 'Yoast SEO',
    role: 'primary',
    patterns: [/wordpress-seo\/wp-seo/i, /^yoast seo$/i],
    metaAdapter: 'yoast',
  },
  {
    id: 'rank-math-pro',
    displayName: 'Rank Math Pro',
    role: 'extension',
    patterns: [/rank-math-pro/i],
  },
  {
    id: 'rank-math',
    displayName: 'Rank Math',
    role: 'primary',
    patterns: [/seo-by-rank-math\/rank-math/i, /\brank math\b/i],
    metaAdapter: 'rank-math',
    redirectAdapter: 'rank-math',
    redirectImplemented: true,
  },
  {
    id: 'seopress-pro',
    displayName: 'SEOPress Pro',
    role: 'extension',
    patterns: [/wp-seopress-pro/i, /seopress pro/i],
  },
  {
    id: 'seopress',
    displayName: 'SEOPress',
    role: 'primary',
    patterns: [/wp-seopress\/seopress/i, /\bseopress\b/i],
    metaAdapter: 'seopress',
  },
  {
    id: 'aioseo',
    displayName: 'All in One SEO',
    role: 'primary',
    patterns: [/all-in-one-seo/i, /\baioseo\b/i],
    metaAdapter: 'aioseo',
  },
  {
    id: 'tsf',
    displayName: 'The SEO Framework',
    role: 'primary',
    patterns: [/autodescription/i, /the seo framework/i],
  },
  {
    id: 'squirrly',
    displayName: 'Squirrly SEO',
    role: 'primary',
    patterns: [/squirrly/i],
  },
  {
    id: 'redirection',
    displayName: 'Redirection',
    role: 'redirect',
    patterns: [/redirection\/redirection/i, /\bredirection plugin\b/i],
    redirectAdapter: 'redirection',
    redirectImplemented: true,
  },
]

export type WpPluginFact = {
  key: string
  value: string
}

export type DetectedSeoPlugin = {
  id: string
  name: string
  slug: string
  role: SeoPluginCatalogEntry['role']
  status?: string
}

export type SeoPluginSummary = {
  detected: boolean
  detail: string
  primary: DetectedSeoPlugin | null
  extensions: DetectedSeoPlugin[]
  redirectTools: DetectedSeoPlugin[]
  capabilities: {
    metaWrite: boolean
    metaAdapters: SeoMetaAdapter[]
    redirects: boolean
    redirectAdapters: SeoRedirectAdapter[]
    redirectPublish: boolean
  }
}

function parsePluginValue(raw: string): { name?: string; status?: string; slug?: string } {
  try {
    return JSON.parse(raw) as { name?: string; status?: string; slug?: string }
  } catch {
    return { name: raw }
  }
}

function pluginHaystack(fact: WpPluginFact): string {
  const v = parsePluginValue(fact.value)
  return `${fact.key} ${v.slug ?? ''} ${v.name ?? ''}`.toLowerCase()
}

function matchCatalogEntry(fact: WpPluginFact, entry: SeoPluginCatalogEntry): boolean {
  const hay = pluginHaystack(fact)
  return entry.patterns.some((re) => re.test(hay))
}

/** Classify wp_plugin SiteFacts into a client SEO stack summary. */
export function summarizeSeoPlugins(pluginFacts: WpPluginFact[]): SeoPluginSummary {
  const detected: DetectedSeoPlugin[] = []

  for (const fact of pluginFacts) {
    for (const entry of SEO_PLUGIN_CATALOG) {
      if (!matchCatalogEntry(fact, entry)) continue
      const v = parsePluginValue(fact.value)
      if (detected.some((d) => d.id === entry.id)) break
      detected.push({
        id: entry.id,
        name: v.name?.replace(/&amp;/g, '&') ?? entry.displayName,
        slug: v.slug ?? fact.key,
        role: entry.role,
        status: v.status,
      })
      break
    }
  }

  const primary =
    detected.find((d) => SEO_PLUGIN_CATALOG.find((c) => c.id === d.id)?.role === 'primary') ?? null
  const extensions = detected.filter((d) => d.role === 'extension')
  const redirectTools = detected.filter((d) => d.role === 'redirect')

  const metaAdapters = new Set<SeoMetaAdapter>()
  const redirectAdapters = new Set<SeoRedirectAdapter>()
  let redirectPublish = false

  for (const d of detected) {
    const entry = SEO_PLUGIN_CATALOG.find((c) => c.id === d.id)
    if (!entry) continue
    if (entry.metaAdapter) metaAdapters.add(entry.metaAdapter)
    if (entry.redirectAdapter) {
      redirectAdapters.add(entry.redirectAdapter)
      if (entry.redirectImplemented) redirectPublish = true
    }
  }

  const metaWrite = metaAdapters.size > 0
  const redirects = redirectAdapters.size > 0

  const detail = buildDetail(primary, extensions, metaWrite, redirects, redirectPublish)

  return {
    detected: detected.length > 0,
    detail,
    primary,
    extensions,
    redirectTools,
    capabilities: {
      metaWrite,
      metaAdapters: [...metaAdapters],
      redirects,
      redirectAdapters: [...redirectAdapters],
      redirectPublish,
    },
  }
}

function buildDetail(
  primary: DetectedSeoPlugin | null,
  extensions: DetectedSeoPlugin[],
  metaWrite: boolean,
  redirects: boolean,
  redirectPublish: boolean,
): string {
  if (!primary && extensions.length === 0) {
    return 'Not detected yet — sync WordPress to scan plugins'
  }

  const parts: string[] = []
  if (primary) parts.push(primary.name)
  if (extensions.length) {
    const short = extensions.map((e) =>
      e.name
        .replace(/^Yoast SEO:?\s*/i, '')
        .replace(/^Rank Math\s*/i, '')
        .replace(/^SEOPress\s*/i, '')
        .trim(),
    )
    parts.push(short.join(' + '))
  }

  const caps: string[] = []
  if (metaWrite) caps.push('meta write')
  if (redirectPublish) caps.push('redirect publish')
  else if (redirects) caps.push('redirects (manual)')

  const stack = parts.filter(Boolean).join(' · ')
  if (!caps.length) return stack || 'SEO plugins detected'
  return `${stack} · ${caps.join(', ')}`
}

/** Publish destination label for review items (e.g. "WordPress · Yoast SEO"). */
export function seoPublishDest(summary: SeoPluginSummary): string {
  if (summary.primary) return `WordPress · ${summary.primary.name}`
  if (summary.redirectTools[0]) return `WordPress · ${summary.redirectTools[0].name}`
  return 'WordPress · SEO plugin'
}

/** Meta fields to write for each supported adapter (inactive plugins ignore extras). */
export function metaFieldsForAdapters(
  adapters: SeoMetaAdapter[],
  meta: { title?: string | null; description?: string | null },
): Record<string, string> {
  const fields: Record<string, string> = {}
  const title = meta.title?.trim()
  const description = meta.description?.trim()
  if (!title && !description) return fields

  const writeAll = adapters.length === 0

  if (title && (writeAll || adapters.includes('yoast'))) {
    fields._yoast_wpseo_title = title
  }
  if (description && (writeAll || adapters.includes('yoast'))) {
    fields._yoast_wpseo_metadesc = description
  }
  if (title && (writeAll || adapters.includes('rank-math'))) {
    fields.rank_math_title = title
  }
  if (description && (writeAll || adapters.includes('rank-math'))) {
    fields.rank_math_description = description
  }
  if (title && (writeAll || adapters.includes('seopress'))) {
    fields._seopress_titles_title = title
  }
  if (description && (writeAll || adapters.includes('seopress'))) {
    fields._seopress_titles_desc = description
  }
  if (title && (writeAll || adapters.includes('aioseo'))) {
    fields._aioseo_title = title
  }
  if (description && (writeAll || adapters.includes('aioseo'))) {
    fields._aioseo_description = description
  }

  return fields
}

/** Whether any synced plugin looks SEO-related (for technical audit). */
export function hasSeoPluginFacts(pluginFacts: WpPluginFact[]): boolean {
  return summarizeSeoPlugins(pluginFacts).detected
}
