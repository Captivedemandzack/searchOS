import type { PageIndexRow } from './api'

export type SitePathIndex = {
  resolvePath: (target: string) => string
  liveUrl: (target: string) => string | null
  title: (target: string) => string | undefined
}

/** Map bare /slug paths to synced WordPress permalinks (e.g. /blog/slug). */
export function buildSitePathIndex(
  rows: PageIndexRow[],
  siteBaseUrl?: string | null,
): SitePathIndex {
  const pathAliases = new Map<string, string>()
  const liveUrlByPath = new Map<string, string>()
  const titleByPath = new Map<string, string>()

  for (const row of rows) {
    const canonical = (row.path || '').replace(/\/$/, '') || '/'
    if (!canonical || canonical === '/') continue

    pathAliases.set(canonical, canonical)
    const slug = canonical.split('/').filter(Boolean).pop()
    if (slug) {
      pathAliases.set(`/${slug}`, canonical)
      pathAliases.set(slug, canonical)
    }

    const live =
      row.url?.replace(/\/$/, '') ||
      (siteBaseUrl ? `${siteBaseUrl.replace(/\/$/, '')}${canonical}` : null)
    if (live) liveUrlByPath.set(canonical, live)
    if (row.title) titleByPath.set(canonical, row.title)
  }

  function resolvePath(target: string): string {
    const t = target.replace(/[.,;]+$/g, '').trim()
    if (!t) return t
    if (t.startsWith('http://') || t.startsWith('https://')) {
      try {
        const path = new URL(t).pathname.replace(/\/$/, '') || '/'
        return pathAliases.get(path) ?? path
      } catch {
        return t
      }
    }
    const withSlash = t.startsWith('/') ? t : `/${t}`
    return pathAliases.get(withSlash) ?? pathAliases.get(t) ?? withSlash
  }

  return {
    resolvePath,
    liveUrl: (target: string) => {
      const path = resolvePath(target)
      return liveUrlByPath.get(path) ?? null
    },
    title: (target: string) => titleByPath.get(resolvePath(target)),
  }
}

const LINK_ARROW = /\s*(?:→|->|—>|–>)\s*/i

/** Rewrite link suggestion lines so targets use synced permalinks. */
export function resolveLinkSuggestionText(text: string, index: SitePathIndex): string {
  if (!text.trim()) return text
  return text
    .split('\n')
    .map((rawLine) => {
      const line = rawLine.trim()
      if (!line) return rawLine

      const addQuoted = line.match(/^Add\s+[""]([^""]+)[""]/i)
      if (addQuoted) {
        const rest = line.slice(addQuoted[0].length)
        const targetMatch = rest.match(new RegExp(`^${LINK_ARROW.source}(\\S+)`, 'i'))
        const placementMatch = line.match(new RegExp(`${LINK_ARROW.source}\\S+\\s+in\\s+(?:the\\s+)?(.+)$`, 'i'))
        if (targetMatch) {
          const target = index.resolvePath(targetMatch[1])
          const place = placementMatch?.[1]?.trim()
          return place
            ? `Add "${addQuoted[1].trim()}" -> ${target} in the ${place}`
            : `Add "${addQuoted[1].trim()}" -> ${target}`
        }
      }

      const parts = line.split(LINK_ARROW)
      if (parts.length >= 2) {
        let anchor = parts[0]
          .replace(/^[""]|[""]$/g, '')
          .replace(/^…+/g, '')
          .replace(/\s*\(unlinked\)\s*$/i, '')
          .trim()
        if (anchor.startsWith('…')) anchor = anchor.slice(1).trim()
        let targetPart = parts[parts.length - 1].trim()
        const placementMatch = targetPart.match(/\s+in\s+(?:the\s+)?(.+)$/i)
        if (placementMatch) targetPart = targetPart.slice(0, placementMatch.index).trim()
        const target = index.resolvePath(targetPart)
        if (placementMatch) {
          return `"${anchor}" -> ${target} in the ${placementMatch[1].trim()}`
        }
        return `"${anchor}" -> ${target}`
      }

      return rawLine
    })
    .join('\n')
}
