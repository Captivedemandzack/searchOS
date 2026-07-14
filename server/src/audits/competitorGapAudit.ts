import type { Audit, AuditContext, FindingDraft } from './types.ts'

type ScanFindings = {
  gaps?: { title: string; detail?: string; priority: string }[]
  recommendedSections?: string[]
}

export const competitorGapAudit: Audit = {
  id: 'competitor-gap',
  category: 'New content',
  title: 'Competitor content gaps',
  requires: ['competitors'],
  run(ctx: AuditContext): FindingDraft[] {
    const findings: FindingDraft[] = []
    const seen = new Set<string>()

    for (const scan of ctx.competitors) {
      let parsed: ScanFindings = {}
      try {
        parsed = JSON.parse(scan.findings) as ScanFindings
      } catch {
        continue
      }
      const path = scan.ourPath ?? `/${scan.targetKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      for (const g of parsed.gaps ?? []) {
        const fp = `competitor-gap:${scan.targetKeyword}:${g.title}`
        if (seen.has(fp)) continue
        seen.add(fp)
        const impact = g.priority === 'High' ? 'High' : g.priority === 'Medium' ? 'Medium' : 'Low'
        const estClicks = impact === 'High' ? 120 : impact === 'Medium' ? 60 : 25
        findings.push({
          auditId: 'competitor-gap',
          category: 'New content',
          subjectType: 'query',
          subjectRef: path,
          subjectLabel: scan.targetKeyword,
          title: g.title,
          evidence: [
            { source: 'Competitor', metric: 'keyword', value: scan.targetKeyword },
            { source: 'Competitor', metric: 'priority', value: g.priority, detail: g.detail },
          ],
          estMonthlyClicks: estClicks,
          estBookingValue: null,
          confidence: 0.75,
          effort: impact === 'High' ? 'Medium' : 'Low',
          actions: [
            {
              kind: scan.ourPath ? 'content_update' : 'blog_post',
              label: scan.ourPath ? 'Update page to close gap' : 'Create content to close gap',
              requiresReviewer: true,
              updateTypes: scan.ourPath ? ['headings', 'body', 'faq'] : undefined,
            },
          ],
          reviewAfter: null,
          fingerprint: fp,
          impact,
          source: 'Competitor',
        })
      }
      for (const section of parsed.recommendedSections ?? []) {
        const fp = `competitor-gap:section:${scan.targetKeyword}:${section}`
        if (seen.has(fp)) continue
        seen.add(fp)
        findings.push({
          auditId: 'competitor-gap',
          category: 'New content',
          subjectType: 'query',
          subjectRef: path,
          subjectLabel: scan.targetKeyword,
          title: `Add section: ${section}`,
          evidence: [
            { source: 'Competitor', metric: 'recommended_section', value: section },
            { source: 'Competitor', metric: 'keyword', value: scan.targetKeyword },
          ],
          estMonthlyClicks: 40,
          estBookingValue: null,
          confidence: 0.7,
          effort: 'Low',
          actions: [
            {
              kind: 'elementor_section',
              label: 'Generate Elementor section',
              requiresReviewer: true,
            },
          ],
          reviewAfter: null,
          fingerprint: fp,
          impact: 'Medium',
          source: 'Competitor',
        })
      }
    }
    return findings
  },
}
