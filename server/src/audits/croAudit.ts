import { normalizeUrl } from '../url.ts'
import type { Audit, AuditContext, FindingDraft } from './types.ts'

export const croAudit: Audit = {
  id: 'cro',
  category: 'Conversion',
  title: 'Conversion optimization (traffic without bookings)',
  requires: ['ga4', 'pages'],
  run(ctx: AuditContext): FindingDraft[] {
    const byPage = new Map<string, { sessions: number; conversions: number }>()
    for (const r of ctx.ga4) {
      const path = normalizeUrl(r.landingPage)
      const a = byPage.get(path) ?? { sessions: 0, conversions: 0 }
      a.sessions += r.sessions ?? 0
      a.conversions += r.conversions
      byPage.set(path, a)
    }
    const findings: FindingDraft[] = []
    for (const [path, stats] of byPage) {
      if (stats.sessions >= 100 && stats.conversions === 0) {
        const page = ctx.pages.find((p) => p.url && normalizeUrl(p.url) === path)
        findings.push({
          auditId: 'cro',
          category: 'Conversion',
          subjectType: 'page',
          subjectRef: path,
          subjectLabel: page?.title ?? path,
          title: `High traffic, zero conversions: ${path}`,
          evidence: [
            { source: 'GA4', metric: 'sessions', value: stats.sessions, window: '90d' },
            { source: 'GA4', metric: 'conversions', value: 0, window: '90d' },
          ],
          estMonthlyClicks: 0,
          estBookingValue: stats.sessions * 2,
          confidence: ctx.ga4.length > 0 ? 0.85 : 0.4,
          effort: 'Medium',
          actions: [
            {
              kind: 'content_update',
              label: 'Improve CTAs & conversion copy',
              requiresReviewer: true,
              updateTypes: ['body', 'headings'],
            },
            { kind: 'elementor_section', label: 'Add conversion section', requiresReviewer: true },
          ],
          reviewAfter: null,
          fingerprint: `cro:${path}`,
          impact: stats.sessions >= 300 ? 'High' : 'Medium',
          source: 'GA4',
        })
      }
    }
    return findings.sort((a, b) => (b.estBookingValue ?? 0) - (a.estBookingValue ?? 0)).slice(0, 10)
  },
}
