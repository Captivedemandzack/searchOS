/**
 * Single source of truth for URL normalization across the entire engine.
 * Every comparison of pages, GSC rows, GA4 landing pages, and WordPress
 * permalinks must go through normalizeUrl() — no ad-hoc path manipulation.
 */

/** Locale path prefixes that are duplicates, not distinct pages. */
const LOCALE_PREFIXES = ['en', 'en-us', 'en-gb']

/**
 * Normalize any URL or path to a canonical absolute permalink:
 *   - force https
 *   - lowercase host
 *   - strip leading www.
 *   - drop query string and hash
 *   - strip trailing slash (except root "/")
 *   - strip duplicate locale prefixes (/en/, /en-us/)
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  let url: URL
  try {
    // Bare paths like "/blog/foo" need a dummy host for parsing.
    if (trimmed.startsWith('/')) {
      url = new URL(trimmed, 'https://placeholder.local')
    } else if (/^https?:\/\//i.test(trimmed)) {
      url = new URL(trimmed)
    } else {
      url = new URL(`https://${trimmed}`)
    }
  } catch {
    // Last resort: treat as a path fragment.
    return stripLocale(normalizePath(trimmed))
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  let path = url.pathname.replace(/\/+$/, '') || '/'

  path = stripLocale(path)

  return `https://${host}${path}`
}

/** Strip known locale prefixes from a path (e.g. /en/blog → /blog). */
function stripLocale(path: string): string {
  let p = path
  for (const loc of LOCALE_PREFIXES) {
    const re = new RegExp(`^/${loc}(/|$)`, 'i')
    if (re.test(p)) {
      p = p.replace(re, '/')
      break
    }
  }
  return p === '' ? '/' : p
}

/** Normalize a bare path (no host): strip trailing slash, locale, query. */
function normalizePath(path: string): string {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  return `https://placeholder.local${stripLocale(clean)}`
}

/** Extract the display path from a canonical absolute URL. */
export function urlPath(canonical: string): string {
  if (!canonical) return '/'
  try {
    const u = new URL(canonical)
    return u.pathname.replace(/\/+$/, '') || '/'
  } catch {
    return canonical.startsWith('/') ? canonical : `/${canonical}`
  }
}

/** True when two inputs normalize to the same canonical URL. */
export function urlsEqual(a: string, b: string): boolean {
  return normalizeUrl(a) === normalizeUrl(b)
}

/** Last path segment from a URL or bare path (e.g. /botox-nashville → botox-nashville). */
export function lastSegment(p: string): string {
  const path = p.startsWith('http') ? urlPath(normalizeUrl(p)) : p.split(/[?#]/)[0]
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

type PagePathInput = { slug: string; url?: string | null; type?: string | null }

/**
 * Site-relative path for linking (uses synced permalink when available).
 * Blog posts on SLK live under /blog/{slug}, not /{slug}.
 */
export function pageDisplayPath(page: PagePathInput): string {
  if (page.url?.trim()) return urlPath(normalizeUrl(page.url))
  if (page.type === 'post') return `/blog/${page.slug}`
  return `/${page.slug}`
}

/** Map bare /slug paths to canonical permalinks for link patching. */
export function buildPagePathAliasMap(pages: PagePathInput[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of pages) {
    const canonical = pageDisplayPath(p)
    map.set(canonical, canonical)
    map.set(`/${p.slug}`, canonical)
    map.set(p.slug, canonical)
    if (p.url?.trim()) {
      const fromUrl = urlPath(normalizeUrl(p.url))
      map.set(fromUrl, canonical)
      const last = fromUrl.split('/').filter(Boolean).pop()
      if (last) {
        map.set(`/${last}`, canonical)
        map.set(last, canonical)
      }
    }
  }
  return map
}

export function resolveAliasedPath(target: string, aliases: Map<string, string>): string {
  const normalized = target.replace(/[.,;]+$/g, '').trim()
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  return aliases.get(withSlash) ?? aliases.get(normalized) ?? withSlash
}
