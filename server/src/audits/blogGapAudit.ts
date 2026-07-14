import { benchmarkCtr } from '../scoring.ts'
import { urlPath } from '../url.ts'
import type { Audit, AuditContext, FindingDraft } from './types.ts'

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !['the', 'and', 'for', 'with', 'your', 'our'].includes(t))
}

export const blogGapAudit: Audit = {
  id: 'blog-gap',
  category: 'New content',
  title: 'Blog content gaps',
  requires: ['gsc', 'pages'],
  run(ctx: AuditContext): FindingDraft[] {
    const pathTokens = new Set<string>()
    for (const p of ctx.pages) {
      if (!p.url) continue
      for (const seg of urlPath(p.url).split('/').filter(Boolean)) {
        for (const t of significantTokens(seg.replace(/-/g, ' '))) pathTokens.add(t)
      }
    }
    const byQuery = new Map<string, { impr: number; clicks: number; posw: number }>()
    for (const r of ctx.gsc) {
      if (!r.query) continue
      const a = byQuery.get(r.query) ?? { impr: 0, clicks: 0, posw: 0 }
      a.impr += r.impressions
      a.clicks += r.clicks
      a.posw += r.position * r.impressions
      byQuery.set(r.query, a)
    }
    const monthly = 30 / 120
    const ideas = [...byQuery.entries()]
      .map(([query, a]) => ({ query, impr: a.impr, pos: a.impr > 0 ? a.posw / a.impr : 0 }))
      .filter((x) => x.impr >= 200 && x.pos > 10)
      .filter((x) => {
        const toks = significantTokens(x.query)
        return !(toks.length > 0 && toks.every((t) => pathTokens.has(t)))
      })
      .map((x) => ({
        query: x.query,
        estClicks: Math.round(benchmarkCtr(6) * x.impr * monthly * 0.5),
        pos: x.pos,
        impr: x.impr,
      }))
      .sort((a, b) => b.estClicks - a.estClicks)
      .slice(0, 12)

    return ideas.map((idea) => ({
      auditId: 'blog-gap',
      category: 'New content',
      subjectType: 'query',
      subjectRef: idea.query,
      subjectLabel: idea.query,
      title: `New blog post: "${idea.query}"`,
      evidence: [
        { source: 'GSC', metric: 'impressions', value: Math.round(idea.impr * monthly), window: '120d' },
        { source: 'GSC', metric: 'position', value: Number(idea.pos.toFixed(1)) },
      ],
      estMonthlyClicks: idea.estClicks,
      estBookingValue: null,
      confidence: 0.85,
      effort: 'High',
      actions: [{ kind: 'blog_post', label: 'Draft blog post', requiresReviewer: true }],
      reviewAfter: null,
      fingerprint: `blog-gap:${idea.query.toLowerCase()}`,
      impact: idea.estClicks >= 80 ? 'High' : idea.estClicks >= 30 ? 'Medium' : 'Low',
      source: 'GSC',
    }))
  },
}
