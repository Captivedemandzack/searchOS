import type { Audit, AuditContext, FindingDraft } from './types.ts'

/**
 * Core Web Vitals via PageSpeed Insights API (optional PAGESPEED_API_KEY).
 * Audits homepage + top GSC pages when data is available.
 */
export const pagespeedAudit: Audit = {
  id: 'pagespeed',
  category: 'Technical',
  title: 'Core Web Vitals (PageSpeed)',
  requires: ['pages', 'gsc'],
  run(ctx: AuditContext): FindingDraft[] {
    const findings: FindingDraft[] = []
    const psiFacts = ctx.facts.filter((f) => f.kind === 'pagespeed')
    for (const f of psiFacts) {
      try {
        const v = JSON.parse(f.value) as { url?: string; score?: number; lcp?: number; cls?: number }
        if (v.score != null && v.score < 50) {
          findings.push({
            auditId: 'pagespeed',
            category: 'Technical',
            subjectType: 'page',
            subjectRef: f.key,
            subjectLabel: v.url ?? f.key,
            title: `Poor mobile performance score (${v.score}): ${f.key}`,
            evidence: [
              { source: 'PageSpeed', metric: 'score', value: v.score },
              ...(v.lcp != null ? [{ source: 'PageSpeed', metric: 'LCP', value: `${Math.round(v.lcp)}ms` }] : []),
            ],
            estMonthlyClicks: 40,
            estBookingValue: null,
            confidence: 0.85,
            effort: 'High',
            actions: [{ kind: 'monitor', label: 'Review CWV in PageSpeed Insights', requiresReviewer: false }],
            reviewAfter: null,
            fingerprint: `pagespeed:low:${f.key}`,
            impact: 'Medium',
            source: 'PageSpeed',
          })
        }
      } catch {
        /* skip */
      }
    }
    if (psiFacts.length) return findings

    const key = process.env.PAGESPEED_API_KEY
    if (!key) {
      findings.push({
        auditId: 'pagespeed',
        category: 'Technical',
        subjectType: 'site',
        subjectRef: 'pagespeed',
        subjectLabel: 'PageSpeed API',
        title: 'Set PAGESPEED_API_KEY to enable Core Web Vitals audits',
        evidence: [{ source: 'Crawl', metric: 'api_key', value: 'missing' }],
        estMonthlyClicks: 0,
        estBookingValue: null,
        confidence: 1,
        effort: 'Low',
        actions: [{ kind: 'monitor', label: 'Add API key in server env', requiresReviewer: false }],
        reviewAfter: null,
        fingerprint: 'pagespeed:no-api-key',
        impact: 'Low',
        source: 'Technical',
        suppressRank: true,
      })
      return findings
    }
    // Runtime fetch happens in runSiteAudits hook — findings populated async in index if needed.
    // Sync audit returns placeholder; extended in pagespeed.ts fetchPagespeedFacts.
    return findings
  },
}
