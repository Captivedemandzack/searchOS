import type { SiteFactInput } from './wordpress.ts'

type PsiMetric = { id: string; numericValue?: number; displayValue?: string }

/** Fetch CWV metrics from PageSpeed Insights for a URL. */
export async function fetchPagespeedMetrics(
  url: string,
): Promise<{ lcp: number | null; cls: number | null; inp: number | null; score: number | null }> {
  const key = process.env.PAGESPEED_API_KEY
  if (!key) return { lcp: null, cls: null, inp: null, score: null }
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance&strategy=mobile&key=${key}`
  const res = await fetch(api)
  if (!res.ok) return { lcp: null, cls: null, inp: null, score: null }
  const data = (await res.json()) as {
    lighthouseResult?: {
      categories?: { performance?: { score?: number } }
      audits?: Record<string, PsiMetric>
    }
  }
  const audits = data.lighthouseResult?.audits ?? {}
  return {
    lcp: audits['largest-contentful-paint']?.numericValue ?? null,
    cls: audits['cumulative-layout-shift']?.numericValue ?? null,
    inp: audits['interaction-to-next-paint']?.numericValue ?? audits['total-blocking-time']?.numericValue ?? null,
    score: data.lighthouseResult?.categories?.performance?.score != null
      ? Math.round((data.lighthouseResult.categories.performance.score ?? 0) * 100)
      : null,
  }
}

export async function capturePagespeedFacts(baseUrl: string, paths: string[]): Promise<SiteFactInput[]> {
  const facts: SiteFactInput[] = []
  const key = process.env.PAGESPEED_API_KEY
  if (!key) return facts
  const base = baseUrl.replace(/\/+$/, '')
  for (const path of paths.slice(0, 5)) {
    const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`
    try {
      const m = await fetchPagespeedMetrics(url)
      if (m.score != null) {
        facts.push({
          kind: 'pagespeed',
          key: path.replace(/^\//, '') || 'home',
          value: { url, ...m },
        })
      }
    } catch {
      /* skip */
    }
  }
  return facts
}
