/**
 * WordPress REST client — Application Password (HTTP Basic Auth) over the
 * standard /wp/v2 endpoints, plus the `groundwork_elementor` field added by
 * the mu-plugin in wordpress-connector/. Read-only: no endpoint here ever
 * issues a POST/PUT/DELETE against the site.
 */
import { captureRedirectFacts } from './redirectFacts.ts'
import { extractLiveSchemaFromWpItem } from './schema.ts'
import { metaFieldsForAdapters, type SeoMetaAdapter } from './seoPlugins.ts'

export type WpAuth = { baseUrl: string; username: string; appPassword: string }

export type WpPage = {
  id: number
  slug: string
  contentType: 'page' | 'post'
  title: string
  status: string
  link: string
  contentHtml: string
  metaTitle: string | null
  metaDesc: string | null
  liveSchemaJson: string | null
  elementorData: string | null
  elementorVersion: string | null
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function authHeader(auth: WpAuth): string {
  const token = Buffer.from(`${auth.username}:${auth.appPassword}`).toString('base64')
  return `Basic ${token}`
}

export async function testWpConnection(auth: WpAuth) {
  const base = normalizeBaseUrl(auth.baseUrl)
  const res = await fetch(`${base}/wp-json/wp/v2/users/me?context=edit`, {
    headers: { Authorization: authHeader(auth) },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText)
    throw new Error(`WordPress authentication failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const me = (await res.json()) as { id: number; name: string; capabilities?: Record<string, boolean> }
  if (!me.capabilities?.edit_posts) {
    throw new Error(
      `Connected as "${me.name}", but this user cannot edit posts — the Elementor field won't be visible. Use an Editor (or higher) account.`,
    )
  }
  return { id: me.id, name: me.name }
}

/** True when the Groundwork Connector mu-plugin is installed (SEO write + Elementor read). */
export async function probeGroundworkConnector(auth: WpAuth): Promise<{
  installed: boolean
  version: string | null
  seoWrite: boolean
  elementorWrite: boolean
  schemaWrite: boolean
}> {
  const base = normalizeBaseUrl(auth.baseUrl)
  try {
    const res = await fetch(`${base}/wp-json/groundwork/v1/status`, {
      headers: { Authorization: authHeader(auth) },
    })
    if (!res.ok) return { installed: false, version: null, seoWrite: false, elementorWrite: false, schemaWrite: false }
    const data = (await res.json()) as {
      version?: string
      seo_write?: boolean
      elementor_write?: boolean
      schema_write?: boolean
    }
    return {
      installed: true,
      version: data.version ?? null,
      seoWrite: data.seo_write === true,
      elementorWrite: data.elementor_write === true,
      schemaWrite: data.schema_write === true,
    }
  } catch {
    return { installed: false, version: null, seoWrite: false, elementorWrite: false, schemaWrite: false }
  }
}

async function fetchAllOfType(auth: WpAuth, type: 'pages' | 'posts'): Promise<Record<string, unknown>[]> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const perPage = 50
  const items: Record<string, unknown>[] = []
  let page = 1

  while (true) {
    const url = `${base}/wp-json/wp/v2/${type}?per_page=${perPage}&page=${page}&context=edit`
    const res = await fetch(url, { headers: { Authorization: authHeader(auth) } })

    if (!res.ok) {
      // WP returns 400 rest_post_invalid_page_number once you page past the end.
      if (res.status === 400 && page > 1) break
      const body = await res.text().catch(() => res.statusText)
      throw new Error(`WordPress ${type} fetch failed (${res.status}) on page ${page}: ${body.slice(0, 300)}`)
    }

    const batch = (await res.json()) as Record<string, unknown>[]
    items.push(...batch)

    const totalPages = Number(res.headers.get('X-WP-TotalPages') ?? '1')
    if (page >= totalPages || batch.length === 0) break
    page++
  }

  return items
}

// Rendered <title>/description meta fields depend on which SEO plugin is
// installed (Yoast exposes yoast_head_json, Rank Math exposes rank_math_title
// etc. only if their REST support is enabled). Read what's there; leave null
// otherwise rather than guessing — a real per-plugin adapter is a later pass.
function extractMeta(item: Record<string, unknown>): { title: string | null; desc: string | null } {
  const yoast = item.yoast_head_json as { title?: string; description?: string } | undefined
  if (yoast) return { title: yoast.title ?? null, desc: yoast.description ?? null }
  const rankMathTitle = item.rank_math_title as string | undefined
  const rankMathDesc = item.rank_math_description as string | undefined
  if (rankMathTitle || rankMathDesc) return { title: rankMathTitle ?? null, desc: rankMathDesc ?? null }
  return { title: null, desc: null }
}

export async function fetchWpContent(auth: WpAuth): Promise<WpPage[]> {
  const [pages, posts] = await Promise.all([
    fetchAllOfType(auth, 'pages'),
    fetchAllOfType(auth, 'posts'),
  ])

  const toWpPage = (contentType: 'page' | 'post') => (item: Record<string, unknown>): WpPage => {
    const title = item.title as { rendered?: string; raw?: string } | undefined
    const content = item.content as { rendered?: string; raw?: string } | undefined
    const elementor = item.groundwork_elementor as
      | { data?: string | null; version?: string | null }
      | undefined
    const meta = extractMeta(item)

    return {
      id: item.id as number,
      slug: item.slug as string,
      contentType,
      title: title?.rendered ?? title?.raw ?? '',
      status: item.status as string,
      link: item.link as string,
      contentHtml: content?.rendered ?? content?.raw ?? '',
      metaTitle: meta.title,
      metaDesc: meta.desc,
      liveSchemaJson: extractLiveSchemaFromWpItem(item),
      elementorData: elementor?.data ?? null,
      elementorVersion: elementor?.version ?? null,
    }
  }

  return [...pages.map(toWpPage('page')), ...posts.map(toWpPage('post'))]
}

export { normalizeBaseUrl }

// ---------------------------------------------------------------------------
// Write-back (Phase 6): upload media + create a draft post.
// ---------------------------------------------------------------------------

/** Resolve category names to WordPress category IDs, creating any that don't
 *  exist. Best-effort — returns the ids it could resolve. */
async function resolveCategoryIds(auth: WpAuth, names: string[]): Promise<number[]> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const ids: number[] = []
  for (const name of names) {
    try {
      const found = await fetch(
        `${base}/wp-json/wp/v2/categories?search=${encodeURIComponent(name)}`,
        { headers: { Authorization: authHeader(auth) } },
      )
      const list = (await found.json()) as { id: number; name: string }[]
      const match = Array.isArray(list) ? list.find((c) => c.name.toLowerCase() === name.toLowerCase()) : null
      if (match) {
        ids.push(match.id)
        continue
      }
      const created = await fetch(`${base}/wp-json/wp/v2/categories`, {
        method: 'POST',
        headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (created.ok) ids.push(((await created.json()) as { id: number }).id)
    } catch {
      // skip a category we can't resolve rather than fail the whole publish
    }
  }
  return ids
}

/** Upload an image (fetched from `imageUrl`) to the WP media library. */
export async function uploadWpMedia(
  auth: WpAuth,
  imageUrl: string,
  filename: string,
  altText: string,
): Promise<{ id: number; sourceUrl: string }> {
  const base = normalizeBaseUrl(auth.baseUrl)

  // Accept either a remote URL (Pexels) or a base64 data URL (manual upload).
  let bytes: Buffer
  let contentType: string
  const dataMatch = imageUrl.match(/^data:(image\/[a-z]+);base64,(.*)$/s)
  if (dataMatch) {
    contentType = dataMatch[1]
    bytes = Buffer.from(dataMatch[2], 'base64')
  } else {
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`Couldn't download the image (${imgRes.status})`)
    contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
    bytes = Buffer.from(await imgRes.arrayBuffer())
  }

  const res = await fetch(`${base}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(auth),
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: new Uint8Array(bytes),
  })
  if (!res.ok) throw new Error(`WordPress media upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const media = (await res.json()) as { id: number; source_url: string }
  // Set alt text (separate PATCH; non-fatal if it fails).
  try {
    await fetch(`${base}/wp-json/wp/v2/media/${media.id}`, {
      method: 'POST',
      headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt_text: altText }),
    })
  } catch {
    /* alt text is a nice-to-have */
  }
  return { id: media.id, sourceUrl: media.source_url }
}

export type WpDraftInput = {
  title: string
  content: string // HTML
  excerpt: string
  slug: string
  categories: string[]
  featuredMediaId: number | null
  existingId?: number | null // update this post in place instead of creating a new one
}

/**
 * Wrap our flat generated HTML (p / h2-h4 / ul / ol / blockquote) in Gutenberg
 * block markup so WordPress themes style it exactly like an editor-authored post
 * (correct line-height, paragraph spacing, list/heading typography). Inserting
 * raw HTML skips the theme's block styles and renders with collapsed spacing.
 */
export function toGutenbergBlocks(html: string): string {
  const out: string[] = []
  const re = /<(p|h2|h3|h4|ul|ol|blockquote)\b([^>]*)>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase()
    const inner = m[3].trim()
    if (!inner) continue
    if (tag === 'p') {
      out.push(`<!-- wp:paragraph -->\n<p>${inner}</p>\n<!-- /wp:paragraph -->`)
    } else if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const level = tag[1]
      const attr = level === '2' ? '' : ` {"level":${level}}`
      out.push(`<!-- wp:heading${attr} -->\n<${tag} class="wp-block-heading">${inner}</${tag}>\n<!-- /wp:heading -->`)
    } else if (tag === 'ul' || tag === 'ol') {
      const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((li) => `<!-- wp:list-item -->\n<li>${li[1].trim()}</li>\n<!-- /wp:list-item -->`)
        .join('\n')
      const ordered = tag === 'ol' ? ' {"ordered":true}' : ''
      out.push(`<!-- wp:list${ordered} -->\n<${tag} class="wp-block-list">\n${items}\n</${tag}>\n<!-- /wp:list -->`)
    } else if (tag === 'blockquote') {
      out.push(`<!-- wp:quote -->\n<blockquote class="wp-block-quote">${inner}</blockquote>\n<!-- /wp:quote -->`)
    }
  }
  // Fallback: nothing matched (plain text) → one paragraph block.
  if (out.length === 0 && html.trim()) {
    return `<!-- wp:paragraph -->\n<p>${html.trim()}</p>\n<!-- /wp:paragraph -->`
  }
  return out.join('\n\n')
}

/** Create OR update a WordPress **draft** post. Returns its id + edit URL. */
export async function createWpDraftPost(
  auth: WpAuth,
  input: WpDraftInput,
): Promise<{ id: number; editUrl: string; link: string }> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const categoryIds = input.categories.length ? await resolveCategoryIds(auth, input.categories) : []
  const body: Record<string, unknown> = {
    title: input.title,
    content: toGutenbergBlocks(input.content),
    excerpt: input.excerpt,
    slug: input.slug,
    status: 'draft',
  }
  if (categoryIds.length) body.categories = categoryIds
  if (input.featuredMediaId) body.featured_media = input.featuredMediaId

  // Update in place if we've published this post before (avoids duplicates).
  const url = input.existingId
    ? `${base}/wp-json/wp/v2/posts/${input.existingId}`
    : `${base}/wp-json/wp/v2/posts`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`WordPress post ${input.existingId ? 'update' : 'create'} failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const post = (await res.json()) as { id: number; link: string }
  return { id: post.id, editUrl: `${base}/wp-admin/post.php?post=${post.id}&action=edit`, link: post.link }
}

export type WpPageDraftInput = {
  title: string
  slug: string
  content: string
  excerpt?: string
  existingId?: number
  elementorData?: string
}

/** Create or update a WordPress PAGE (not post) as draft. */
export async function createWpDraftPage(
  auth: WpAuth,
  input: WpPageDraftInput,
): Promise<{ id: number; editUrl: string; link: string }> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const body: Record<string, unknown> = {
    title: input.title,
    content: toGutenbergBlocks(input.content),
    slug: input.slug,
    status: 'draft',
  }
  if (input.excerpt) body.excerpt = input.excerpt
  if (input.elementorData) {
    body.meta = { _elementor_data: input.elementorData, _elementor_edit_mode: 'builder' }
  }
  const url = input.existingId
    ? `${base}/wp-json/wp/v2/pages/${input.existingId}`
    : `${base}/wp-json/wp/v2/pages`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`WordPress page ${input.existingId ? 'update' : 'create'} failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const page = (await res.json()) as { id: number; link: string }
  return { id: page.id, editUrl: `${base}/wp-admin/post.php?post=${page.id}&action=edit`, link: page.link }
}

export type SeoMetaInput = {
  title?: string | null
  description?: string | null
}

/**
 * Update SEO title + meta description on an existing page/post.
 * Prefers the Groundwork Connector write endpoint (update_post_meta).
 * Falls back to standard WP REST meta only when the connector is absent.
 */
export async function updatePageSeoMeta(
  auth: WpAuth,
  wpId: number,
  contentType: 'page' | 'post',
  meta: SeoMetaInput,
  options?: {
    draftOnly?: boolean
    /** When true, do not change the page publish status (meta-only update). */
    preserveStatus?: boolean
    metaAdapters?: SeoMetaAdapter[]
  },
): Promise<{ id: number; editUrl: string; link: string }> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const title = meta.title?.trim()
  const description = meta.description?.trim()
  if (!title && !description) {
    throw new Error('No SEO title or meta description to publish')
  }

  const endpointType = contentType === 'post' ? 'posts' : 'pages'
  const connectorRes = await fetch(
    `${base}/wp-json/groundwork/v1/${endpointType}/${wpId}/seo-meta`,
    {
      method: 'POST',
      headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    },
  )

  if (connectorRes.ok) {
    const item = (await connectorRes.json()) as {
      id: number
      editUrl: string
      link: string
      title?: string | null
      description?: string | null
    }
    return {
      id: item.id,
      editUrl: item.editUrl,
      link: item.link,
    }
  }

  if (connectorRes.status !== 404) {
    const errText = await connectorRes.text().catch(() => connectorRes.statusText)
    throw new Error(
      `Groundwork Connector SEO write failed (${connectorRes.status}): ${errText.slice(0, 300)}`,
    )
  }

  // Fallback: standard REST meta (requires show_in_rest registration on the site).
  const metaFields = metaFieldsForAdapters(options?.metaAdapters ?? [], meta)
  const body: Record<string, unknown> = { meta: metaFields }
  if (!options?.preserveStatus && options?.draftOnly !== false) body.status = 'draft'

  const res = await fetch(`${base}/wp-json/wp/v2/${endpointType}/${wpId}`, {
    method: 'POST',
    headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(
      `WordPress SEO meta update failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
    )
  }
  const item = (await res.json()) as { id: number; link: string; meta?: Record<string, string> }

  const wroteTitle =
    !title ||
    item.meta?._yoast_wpseo_title === title ||
    item.meta?.rank_math_title === title
  const wroteDesc =
    !description ||
    item.meta?._yoast_wpseo_metadesc === description ||
    item.meta?.rank_math_description === description

  if (!wroteTitle && !wroteDesc) {
    throw new Error(
      'SEO fields were not saved. Install the Groundwork Connector plugin on WordPress (Plugins → Upload → groundwork-connector.zip), then try again.',
    )
  }

  return {
    id: item.id,
    editUrl: `${base}/wp-admin/post.php?post=${item.id}&action=edit`,
    link: item.link,
  }
}

/** Update the WordPress post/page title (visible H1 on many Elementor blog templates). */
export async function updatePageTitle(
  auth: WpAuth,
  wpId: number,
  contentType: 'page' | 'post',
  title: string,
  options?: { preserveStatus?: boolean },
): Promise<{ id: number; editUrl: string; link: string }> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const endpoint = contentType === 'post' ? 'posts' : 'pages'
  const body: Record<string, unknown> = { title: title.trim() }
  if (!options?.preserveStatus) body.status = 'draft'
  const res = await fetch(`${base}/wp-json/wp/v2/${endpoint}/${wpId}`, {
    method: 'POST',
    headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`WordPress title update failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }
  const item = (await res.json()) as { id: number; link: string }
  return {
    id: item.id,
    editUrl: `${base}/wp-admin/post.php?post=${item.id}&action=edit`,
    link: item.link,
  }
}

/** Update page/post body content as a draft revision. */
export async function updatePageContent(
  auth: WpAuth,
  wpId: number,
  contentType: 'page' | 'post',
  contentHtml: string,
): Promise<{ id: number; editUrl: string; link: string }> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const endpoint = contentType === 'post' ? 'posts' : 'pages'
  const res = await fetch(`${base}/wp-json/wp/v2/${endpoint}/${wpId}`, {
    method: 'POST',
    headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: toGutenbergBlocks(contentHtml),
      status: 'draft',
    }),
  })
  if (!res.ok) {
    throw new Error(`WordPress content update failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }
  const item = (await res.json()) as { id: number; link: string }
  return {
    id: item.id,
    editUrl: `${base}/wp-admin/post.php?post=${item.id}&action=edit`,
    link: item.link,
  }
}

/**
 * Patch existing Elementor builder data on a synced page/post.
 * Requires Groundwork Connector v1.2+ with elementor_write support.
 */
export async function updateElementorContent(
  auth: WpAuth,
  wpId: number,
  contentType: 'page' | 'post',
  elementorData: string,
): Promise<{ id: number; editUrl: string; link: string }> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const endpointType = contentType === 'post' ? 'posts' : 'pages'

  const connectorRes = await fetch(
    `${base}/wp-json/groundwork/v1/${endpointType}/${wpId}/elementor-content`,
    {
      method: 'POST',
      headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementor_data: elementorData }),
    },
  )

  if (connectorRes.ok) {
    const item = (await connectorRes.json()) as { id: number; editUrl: string; link: string }
    return { id: item.id, editUrl: item.editUrl, link: item.link }
  }

  if (connectorRes.status !== 404) {
    const errText = await connectorRes.text().catch(() => connectorRes.statusText)
    throw new Error(
      `Groundwork Connector Elementor write failed (${connectorRes.status}): ${errText.slice(0, 300)}`,
    )
  }

  // Fallback for sites without the v1.2 endpoint — direct meta write.
  const res = await fetch(`${base}/wp-json/wp/v2/${endpointType}/${wpId}`, {
    method: 'POST',
    headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      meta: { _elementor_data: elementorData, _elementor_edit_mode: 'builder' },
    }),
  })
  if (!res.ok) {
    throw new Error(
      `WordPress Elementor update failed (${res.status}): ${(await res.text()).slice(0, 300)}. Update the Groundwork Connector to v1.2+.`,
    )
  }
  const item = (await res.json()) as { id: number; link: string }
  return {
    id: item.id,
    editUrl: `${base}/wp-admin/post.php?post=${item.id}&action=elementor`,
    link: item.link,
  }
}

/** Refresh live JSON-LD for one post/page from Yoast head JSON. */
export async function fetchPageLiveSchema(
  auth: WpAuth,
  wpId: number,
  contentType: 'page' | 'post',
): Promise<string | null> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const endpointType = contentType === 'post' ? 'posts' : 'pages'
  const res = await fetch(
    `${base}/wp-json/wp/v2/${endpointType}/${wpId}?context=edit&_fields=yoast_head_json,rank_math_schema,content`,
    { headers: { Authorization: authHeader(auth) } },
  )
  if (!res.ok) return null
  const item = (await res.json()) as Record<string, unknown>
  return extractLiveSchemaFromWpItem(item)
}

/** Merge FAQPage (or other) graph pieces into Yoast output via Groundwork Connector v1.3+. */
export async function writePageSchemaGraph(
  auth: WpAuth,
  wpId: number,
  contentType: 'page' | 'post',
  graphJson: string,
): Promise<{ id: number; link: string }> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const endpointType = contentType === 'post' ? 'posts' : 'pages'
  const res = await fetch(`${base}/wp-json/groundwork/v1/${endpointType}/${wpId}/schema-graph`, {
    method: 'POST',
    headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph_json: graphJson }),
  })
  if (!res.ok) {
    throw new Error(
      `WordPress schema update failed (${res.status}): ${(await res.text()).slice(0, 300)}. Update Groundwork Connector to v1.3+.`,
    )
  }
  const data = (await res.json()) as { id: number; link: string }
  return { id: data.id, link: data.link }
}

export type SiteFactInput = { kind: string; key: string; value: Record<string, unknown> }

/** Best-effort capture of WP environment facts into SiteFact rows. */
export async function captureSiteFacts(auth: WpAuth, pages: WpPage[]): Promise<SiteFactInput[]> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const facts: SiteFactInput[] = []

  // Plugins (WP 5.5+ plugins endpoint if available)
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/plugins`, { headers: { Authorization: authHeader(auth) } })
    if (res.ok) {
      const plugins = (await res.json()) as { plugin?: string; name?: string; status?: string }[]
      if (Array.isArray(plugins)) {
        for (const p of plugins) {
          const slug = (p.plugin ?? p.name ?? 'unknown').replace(/\//g, '-')
          facts.push({ kind: 'wp_plugin', key: slug, value: { name: p.name, status: p.status, slug: p.plugin } })
        }
      }
    }
  } catch {
    /* optional */
  }

  // Sitemap probe
  try {
    const sm = await fetch(`${base}/sitemap_index.xml`)
    if (sm.ok) facts.push({ kind: 'sitemap', key: 'index', value: { url: `${base}/sitemap_index.xml` } })
  } catch {
    /* skip */
  }

  facts.push({ kind: 'wp_setting', key: 'site_url', value: { url: base } })

  // Parse treatments from booking/services pages
  const treatmentPatterns = /book|services|treatments|offerings/i
  for (const p of pages) {
    if (!treatmentPatterns.test(`${p.slug} ${p.title}`)) continue
    const text = stripTags(p.contentHtml)
    const lines = text.split(/\n|•|·|\|/).map((l) => l.trim()).filter((l) => l.length > 3 && l.length < 80)
    for (const line of lines.slice(0, 30)) {
      if (/botox|filler|laser|facial|peel|microneedling|prp|iv|hormone|skin|lip|bbl|coolsculpt/i.test(line)) {
        const key = line.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
        facts.push({ kind: 'treatment_offered', key, value: { name: line, sourcePage: p.slug } })
      }
    }
  }

  // Authors from team/about pages
  const teamPatterns = /team|about|staff|providers|doctors/i
  for (const p of pages) {
    if (!teamPatterns.test(`${p.slug} ${p.title}`)) continue
    const html = p.contentHtml
    const nameMatches = html.matchAll(/<h[2-4][^>]*>([^<]{3,60})<\/h[2-4]>/gi)
    for (const m of nameMatches) {
      const name = m[1].trim()
      if (/dr\.|md|np|pa-c|nurse|director/i.test(name) || name.split(' ').length >= 2) {
        const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        facts.push({ kind: 'author', key, value: { name, sourcePage: p.slug, pageUrl: p.link } })
      }
    }
  }

  const redirectFacts = await captureRedirectFacts(auth)
  facts.push(...redirectFacts)

  return facts
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
