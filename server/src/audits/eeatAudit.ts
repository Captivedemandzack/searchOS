import type { Audit, AuditContext, FindingDraft } from './types.ts'

export const eeatAudit: Audit = {
  id: 'eeat',
  category: 'Trust',
  title: 'E-E-A-T & author attribution',
  requires: ['pages', 'facts'],
  run(ctx: AuditContext): FindingDraft[] {
    const findings: FindingDraft[] = []
    const authors = ctx.facts.filter((f) => f.kind === 'author')
    const clinicalPatterns = /botox|filler|laser|medical|treatment|inject|skin|wellness|clinic/i

    for (const page of ctx.pages) {
      if (!page.url) continue
      const hay = `${page.title ?? ''} ${page.contentHtml ?? ''} ${page.slug}`
      if (!clinicalPatterns.test(hay)) continue
      const hasByline =
        /reviewed by|medically reviewed|dr\.|md|np|pa-c|author/i.test(page.contentHtml ?? '') ||
        authors.some((a) => (page.contentHtml ?? '').includes(a.key))
      if (!hasByline) {
        findings.push({
          auditId: 'eeat',
          category: 'Trust',
          subjectType: 'page',
          subjectRef: page.url,
          subjectLabel: page.title ?? page.slug,
          title: `Clinical content missing credentialed author byline`,
          evidence: [
            { source: 'WP', metric: 'content_type', value: page.type },
            { source: 'Fact', metric: 'authors_available', value: authors.length },
          ],
          estMonthlyClicks: 0,
          estBookingValue: null,
          confidence: 0.9,
          effort: 'Low',
          actions: [
            {
              kind: 'content_update',
              label: 'Add author byline linked to team page',
              requiresReviewer: true,
              updateTypes: ['body'],
            },
          ],
          reviewAfter: null,
          fingerprint: `eeat:${page.url}`,
          impact: 'Medium',
          source: 'WP',
        })
      }
    }
    return findings.slice(0, 15)
  },
}
