import { evaluateSite, type RefreshRecommendation } from '../contentEngine.ts'
import type { Audit, AuditContext, FindingDraft } from './types.ts'

function actionFor(rec: RefreshRecommendation): FindingDraft['actions'] {
  if (rec.action === 'prune') {
    return [{ kind: 'prune', label: 'Stage prune for review', requiresReviewer: true }]
  }
  if (rec.action === 'consolidate') {
    return [{ kind: 'consolidate', label: 'Stage consolidate for review', requiresReviewer: true }]
  }
  if (rec.action === 'leave_alone' || rec.action === 'insufficient_data') {
    return [{ kind: 'monitor', label: 'Monitor', requiresReviewer: false }]
  }
  if (rec.action === 'rewrite') {
    return [
      {
        kind: 'content_update',
        label: 'Draft full rewrite',
        requiresReviewer: true,
        updateTypes: ['headings', 'body', 'faq', 'schema', 'links'],
      },
    ]
  }
  return [
    { kind: 'meta_rewrite', label: 'Draft title & meta', requiresReviewer: false },
    {
      kind: 'content_update',
      label: 'Draft content refresh',
      requiresReviewer: true,
      updateTypes: ['headings', 'body', 'faq', 'links'],
    },
  ]
}

function toFinding(rec: RefreshRecommendation): FindingDraft {
  const suppressRank = rec.action === 'leave_alone' || rec.action === 'insufficient_data'
  return {
    auditId: 'content',
    category: 'Content',
    subjectType: 'page',
    subjectRef: rec.path,
    subjectLabel: rec.title ?? rec.path,
    title: `${rec.action === 'refresh' ? 'Refresh' : rec.action === 'rewrite' ? 'Rewrite' : rec.action}: ${rec.path}`,
    evidence: [
      {
        source: 'GSC',
        metric: 'position',
        value: rec.position ?? 0,
        window: '91d',
      },
      { source: 'GSC', metric: 'clicks', value: rec.clicks, window: '91d' },
      ...rec.triggers.map((t) => ({
        source: 'GSC' as const,
        metric: t.id,
        value: t.reason,
        detail: t.reason,
      })),
    ],
    estMonthlyClicks: rec.estMonthlyUpside,
    estBookingValue: rec.conversions > 0 ? rec.conversions * 50 : null,
    confidence: rec.lowConfidence ? 0.5 : 1,
    effort: rec.effort,
    actions: actionFor(rec),
    reviewAfter: rec.reviewAfter,
    fingerprint: `content:${rec.path}:${rec.action}`,
    impact: rec.estMonthlyUpside >= 100 ? 'High' : rec.estMonthlyUpside >= 30 ? 'Medium' : 'Low',
    source: 'GSC',
    suppressRank,
  }
}

export const contentAudit: Audit = {
  id: 'content',
  category: 'Content',
  title: 'Content refresh & lifecycle',
  requires: ['gsc', 'pages'],
  run(ctx: AuditContext): FindingDraft[] {
    const queue = evaluateSite(ctx.gsc, ctx.ga4, ctx.pages, ctx.policy)
    return queue.map(toFinding)
  },
}
