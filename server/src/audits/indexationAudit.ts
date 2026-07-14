import type { Audit, AuditContext, FindingDraft } from './types.ts'

/** Index status from GSC impressions proxy (synced as site facts). */
export const indexationAudit: Audit = {
  id: 'indexation',
  category: 'Technical',
  title: 'Indexation (GSC proxy)',
  requires: ['facts'],
  run(ctx: AuditContext): FindingDraft[] {
    const findings: FindingDraft[] = []
    for (const f of ctx.facts.filter((x) => x.kind === 'indexation')) {
      try {
        const v = JSON.parse(f.value) as { indexed?: boolean | null; verdict?: string }
        if (v.indexed === false) {
          findings.push({
            auditId: 'indexation',
            category: 'Technical',
            subjectType: 'page',
            subjectRef: `/${f.key}`,
            subjectLabel: `/${f.key}`,
            title: `No GSC impressions (may be deindexed): /${f.key}`,
            evidence: [{ source: 'GSC', metric: 'indexation', value: v.verdict ?? 'no impressions' }],
            estMonthlyClicks: 30,
            estBookingValue: null,
            confidence: 0.6,
            effort: 'Medium',
            actions: [{ kind: 'monitor', label: 'Inspect in Search Console', requiresReviewer: false }],
            reviewAfter: null,
            fingerprint: `indexation:no-impr:${f.key}`,
            impact: 'Medium',
            source: 'GSC',
          })
        }
      } catch {
        /* skip */
      }
    }
    return findings
  },
}
