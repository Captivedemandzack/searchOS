import { runScoring } from '../scoring.ts'
import type { Audit, AuditContext, FindingDraft } from './types.ts'

const CATEGORY_MAP: Record<string, FindingDraft['category']> = {
  Metadata: 'Metadata',
  Content: 'Content',
  'Internal links': 'Internal links',
  Schema: 'Technical',
  Technical: 'Technical',
  'New page': 'New content',
}

export const metadataAudit: Audit = {
  id: 'metadata',
  category: 'Metadata',
  title: 'Metadata & on-page opportunities',
  requires: ['gsc', 'ga4', 'pages'],
  run(ctx: AuditContext): FindingDraft[] {
    const { opportunities } = runScoring(ctx.gsc, ctx.ga4, ctx.pages)
    return opportunities.map((o) => {
      const pagePath = o.page.split(' ')[0]
      const estClicks = Number((o.expected.match(/(\d+)/) ?? ['0'])[0])
      const category = CATEGORY_MAP[o.type] ?? 'Content'
      const actions: FindingDraft['actions'] =
        o.type === 'Metadata'
          ? [{ kind: 'meta_rewrite', label: 'Draft title & meta', requiresReviewer: false }]
          : o.type === 'New page'
            ? [{ kind: 'elementor_page', label: 'Draft new page', requiresReviewer: true }]
            : [
                {
                  kind: 'content_update',
                  label: 'Draft content update',
                  requiresReviewer: true,
                  updateTypes: o.type === 'Schema' ? ['schema'] : o.type === 'Internal links' ? ['links'] : ['headings', 'body'],
                },
              ]
      return {
        auditId: 'metadata',
        category,
        subjectType: 'page',
        subjectRef: pagePath,
        subjectLabel: pagePath,
        title: o.title,
        evidence: [
          { source: o.source as 'GSC', metric: 'signal', value: o.why, detail: o.why },
          { source: 'GSC', metric: 'score', value: o.score },
        ],
        estMonthlyClicks: estClicks,
        estBookingValue: null,
        confidence: o.confidence / 100,
        effort: o.effort,
        actions,
        reviewAfter: null,
        fingerprint: `metadata:${o.fingerprint}`,
        impact: o.impact,
        source: o.source,
      }
    })
  },
}
