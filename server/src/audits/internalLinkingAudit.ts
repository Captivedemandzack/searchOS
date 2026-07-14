import type { Audit, AuditContext, FindingDraft } from './types.ts'

export const internalLinkingAudit: Audit = {
  id: 'internal-linking',
  category: 'Internal links',
  title: 'Internal linking (blog to service pages)',
  requires: ['pages'],
  run(ctx: AuditContext): FindingDraft[] {
    const servicePaths = ctx.pages
      .filter((p) => p.type === 'page' && p.url)
      .map((p) => ({ url: p.url!, slug: p.slug, title: p.title }))
    const serviceUrls = new Set(servicePaths.map((s) => s.url))
    const findings: FindingDraft[] = []

    for (const post of ctx.pages.filter((p) => p.type === 'post')) {
      const html = post.contentHtml ?? ''
      if (!html || !post.url) continue
      const linksToService = servicePaths.some((s) => html.includes(s.slug) || html.includes(s.url))
      if (!linksToService && html.length > 500) {
        findings.push({
          auditId: 'internal-linking',
          category: 'Internal links',
          subjectType: 'page',
          subjectRef: post.url,
          subjectLabel: post.title ?? post.slug,
          title: `Blog post has no link to a service page`,
          evidence: [
            { source: 'WP', metric: 'content_length', value: html.length },
            { source: 'WP', metric: 'service_pages', value: serviceUrls.size },
          ],
          estMonthlyClicks: 25,
          estBookingValue: 75,
          confidence: 0.9,
          effort: 'Low',
          actions: [
            { kind: 'content_update', label: 'Add service page links', requiresReviewer: false, updateTypes: ['links'] },
          ],
          reviewAfter: null,
          fingerprint: `internal-links:${post.url}`,
          impact: 'Medium',
          source: 'WP',
        })
      }
    }
    return findings
  },
}
