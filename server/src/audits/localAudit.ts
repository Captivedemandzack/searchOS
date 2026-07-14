import type { Audit, AuditContext, FindingDraft } from './types.ts'

export const localAudit: Audit = {
  id: 'local',
  category: 'Local',
  title: 'Google Business Profile & local presence',
  requires: ['facts'],
  run(ctx: AuditContext): FindingDraft[] {
    const findings: FindingDraft[] = []
    const gbp = ctx.facts.find((f) => f.kind === 'gbp_profile')
    const posts = ctx.facts.filter((f) => f.kind === 'gbp_post')

    if (!gbp) {
      findings.push({
        auditId: 'local',
        category: 'Local',
        subjectType: 'site',
        subjectRef: 'gbp',
        subjectLabel: 'Google Business Profile',
        title: 'Draft GBP posts manually (no API connection yet)',
        evidence: [
          {
            source: 'Fact',
            metric: 'gbp_profile',
            value: 'not_connected',
            detail: 'Groundwork can draft copy for you to paste into Google Business Profile. Connect GBP API in a future release.',
          },
        ],
        estMonthlyClicks: 200,
        estBookingValue: 500,
        confidence: 0.7,
        effort: 'Low',
        actions: [{ kind: 'gbp_post', label: 'Draft GBP post (manual paste)', requiresReviewer: true }],
        reviewAfter: null,
        fingerprint: 'local:gbp-missing',
        impact: 'High',
        source: 'Manual',
      })
    } else {
      let profile: { reviewCount?: number; postCount30d?: number } = {}
      try {
        profile = JSON.parse(gbp.value)
      } catch {
        /* skip */
      }
      if ((profile.postCount30d ?? posts.length) < 4) {
        findings.push({
          auditId: 'local',
          category: 'Local',
          subjectType: 'site',
          subjectRef: 'gbp-posts',
          subjectLabel: 'GBP weekly posts',
          title: 'GBP posts below weekly cadence (target: 4/month)',
          evidence: [
            { source: 'Fact', metric: 'posts_30d', value: profile.postCount30d ?? posts.length },
          ],
          estMonthlyClicks: 150,
          estBookingValue: 400,
          confidence: 0.75,
          effort: 'Low',
          actions: [{ kind: 'gbp_post', label: 'Draft GBP post (manual paste)', requiresReviewer: true }],
          reviewAfter: null,
          fingerprint: 'local:gbp-cadence',
          impact: 'High',
          source: 'Manual',
        })
      }
    }
    return findings
  },
}
