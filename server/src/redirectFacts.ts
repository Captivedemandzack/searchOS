import type { SiteFactInput } from './wordpress.ts'
import { authHeader, normalizeBaseUrl, type WpAuth } from './wordpress.ts'

/** Best-effort redirect capture from common WordPress SEO plugins. */
export async function captureRedirectFacts(auth: WpAuth): Promise<SiteFactInput[]> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const facts: SiteFactInput[] = []
  const headers = { Authorization: authHeader(auth) }

  // Rank Math Redirections module (when REST is enabled).
  try {
    const res = await fetch(`${base}/wp-json/rankmath/v1/redirections`, { headers })
    if (res.ok) {
      const data = (await res.json()) as unknown
      const rows = Array.isArray(data) ? data : (data as { redirections?: unknown[] })?.redirections
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const r = row as { id?: number; sources?: string[]; url_to?: string; header_code?: number }
          const source = r.sources?.[0] ?? String(r.id ?? 'unknown')
          const key = source.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 80) || 'redirect'
          facts.push({
            kind: 'redirect',
            key,
            value: {
              source,
              target: r.url_to ?? '',
              status: r.header_code ?? 301,
            },
          })
        }
      }
    }
  } catch {
    /* optional */
  }

  // Redirection plugin (John Godley).
  try {
    const res = await fetch(`${base}/wp-json/redirection/v1/redirect?per_page=100`, { headers })
    if (res.ok) {
      const data = (await res.json()) as { items?: { url?: string; action_data?: { url?: string }; action_code?: number }[] }
      for (const row of data.items ?? []) {
        const source = row.url ?? 'unknown'
        const key = source.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 80) || 'redirect'
        facts.push({
          kind: 'redirect',
          key: `rd-${key}`,
          value: {
            source,
            target: row.action_data?.url ?? '',
            status: row.action_code ?? 301,
          },
        })
      }
    }
  } catch {
    /* optional */
  }

  return facts
}

export type RedirectInput = {
  source: string
  target: string
  status?: number
}

/** Create or update a redirect via Rank Math or Redirection plugin REST. */
export async function createRedirect(auth: WpAuth, input: RedirectInput): Promise<{ plugin: string; id?: number }> {
  const base = normalizeBaseUrl(auth.baseUrl)
  const headers = { Authorization: authHeader(auth), 'Content-Type': 'application/json' }
  const status = input.status ?? 301

  // Rank Math Redirections
  try {
    const res = await fetch(`${base}/wp-json/rankmath/v1/redirections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sources: [{ pattern: input.source, comparison: 'exact' }],
        url_to: input.target,
        header_code: status,
      }),
    })
    if (res.ok) {
      const data = (await res.json()) as { id?: number }
      return { plugin: 'rank-math', id: data.id }
    }
  } catch {
    /* try next */
  }

  // Redirection plugin
  try {
    const res = await fetch(`${base}/wp-json/redirection/v1/redirect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: input.source,
        match_type: 'url',
        action_type: 'url',
        action_code: status,
        action_data: { url: input.target },
      }),
    })
    if (res.ok) {
      const data = (await res.json()) as { id?: number }
      return { plugin: 'redirection', id: data.id }
    }
  } catch {
    /* fall through */
  }

  throw new Error(
    'Could not create redirect — ensure Rank Math Redirections or the Redirection plugin is installed and REST is enabled.',
  )
}
