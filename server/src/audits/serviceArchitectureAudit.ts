import { urlPath } from '../url.ts'
import type { Audit, AuditContext, FindingDraft, SiteFactLite } from './types.ts'

function parseFact<T>(facts: SiteFactLite[], kind: string, key: string): T | null {
  const f = facts.find((x) => x.kind === kind && x.key === key)
  if (!f) return null
  try {
    return JSON.parse(f.value) as T
  } catch {
    return null
  }
}

function treatmentFacts(facts: SiteFactLite[]): string[] {
  return facts.filter((f) => f.kind === 'treatment_offered').map((f) => f.key)
}

function pageCoversTreatment(pages: AuditContext['pages'], treatment: string): { path: string; localized: boolean } | null {
  const tokens = treatment.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
  for (const p of pages) {
    if (p.type !== 'page' || !p.url) continue
    const hay = `${p.slug} ${p.title ?? ''} ${urlPath(p.url)}`.toLowerCase()
    if (tokens.every((t) => hay.includes(t))) {
      const localized = ctxLocalModifiers.some((m) => hay.includes(m))
      return { path: p.url, localized }
    }
  }
  return null
}

const ctxLocalModifiers = ['nashville', 'chattanooga', 'franklin', 'brentwood', 'tn', 'tennessee']

export const serviceArchitectureAudit: Audit = {
  id: 'service-architecture',
  category: 'Service pages',
  title: 'Service page architecture',
  requires: ['pages', 'facts'],
  run(ctx: AuditContext): FindingDraft[] {
    const findings: FindingDraft[] = []
    const treatments = treatmentFacts(ctx.facts)
    const servicePages = ctx.pages.filter((p) => p.type === 'page' && p.url)

    // Generic services page: one page listing many treatments
    const genericCandidates = servicePages.filter((p) => {
      const hay = `${p.slug} ${p.title ?? ''}`.toLowerCase()
      return /services|treatments|offerings/.test(hay) && !/botox|filler|laser|facial/.test(hay)
    })
    if (genericCandidates.length > 0 && treatments.length >= 3) {
      findings.push({
        auditId: 'service-architecture',
        category: 'Service pages',
        subjectType: 'page',
        subjectRef: genericCandidates[0].url!,
        subjectLabel: genericCandidates[0].title ?? genericCandidates[0].slug,
        title: 'Generic services page cannot rank for individual treatments',
        evidence: [
          { source: 'WP', metric: 'treatments_listed', value: treatments.length },
          { source: 'Fact', metric: 'detail', value: 'Dedicated pages per treatment rank better than one combined page' },
        ],
        estMonthlyClicks: 120,
        estBookingValue: 200,
        confidence: treatments.length > 0 ? 0.9 : 0.6,
        effort: 'High',
        actions: [{ kind: 'elementor_page', label: 'Draft dedicated service pages', requiresReviewer: true }],
        reviewAfter: null,
        fingerprint: `service-arch:generic:${genericCandidates[0].slug}`,
        impact: 'High',
        source: 'WP',
      })
    }

    const treatmentList = treatments.length > 0 ? treatments : inferTreatmentsFromPages(ctx.pages)
    for (const treatment of treatmentList) {
      const match = pageCoversTreatment(ctx.pages, treatment)
      if (!match) {
        findings.push({
          auditId: 'service-architecture',
          category: 'Service pages',
          subjectType: 'treatment',
          subjectRef: treatment,
          subjectLabel: treatment,
          title: `No dedicated page for "${treatment}"`,
          evidence: [
            { source: 'Fact', metric: 'treatment_offered', value: treatment },
            { source: 'WP', metric: 'pages_checked', value: servicePages.length },
          ],
          estMonthlyClicks: 80,
          estBookingValue: 150,
          confidence: treatments.length > 0 ? 0.95 : 0.65,
          effort: 'High',
          actions: [{ kind: 'elementor_page', label: `Draft "${treatment}" service page`, requiresReviewer: true }],
          reviewAfter: null,
          fingerprint: `service-arch:missing:${treatment.toLowerCase()}`,
          impact: 'High',
          source: 'WP',
        })
      } else if (!match.localized) {
        findings.push({
          auditId: 'service-architecture',
          category: 'Service pages',
          subjectType: 'treatment',
          subjectRef: treatment,
          subjectLabel: treatment,
          title: `"${treatment}" page exists but is not city-qualified`,
          evidence: [
            { source: 'WP', metric: 'page', value: match.path },
            { source: 'Fact', metric: 'detail', value: 'Local med spa searches need city in URL or title' },
          ],
          estMonthlyClicks: 40,
          estBookingValue: 100,
          confidence: 0.8,
          effort: 'Medium',
          actions: [
            { kind: 'content_update', label: 'Localize page content', requiresReviewer: true, updateTypes: ['headings', 'body', 'meta'] },
          ],
          reviewAfter: null,
          fingerprint: `service-arch:unlocalized:${treatment.toLowerCase()}`,
          impact: 'Medium',
          source: 'WP',
        })
      }
    }
    return findings
  },
}

function inferTreatmentsFromPages(pages: AuditContext['pages']): string[] {
  const skip = new Set(['about', 'contact', 'team', 'blog', 'home', 'services', 'privacy', 'book'])
  return pages
    .filter((p) => p.type === 'page' && p.slug && !skip.has(p.slug))
    .filter((p) => !/blog|category|tag/.test(p.slug))
    .map((p) => p.title ?? p.slug.replace(/-/g, ' '))
    .slice(0, 15)
}
