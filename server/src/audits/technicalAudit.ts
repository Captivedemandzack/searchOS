import type { Audit, AuditContext, FindingDraft } from './types.ts'
import { hasSeoPluginFacts } from '../seoPlugins.ts'

export const technicalAudit: Audit = {
  id: 'technical',
  category: 'Technical',
  title: 'WordPress environment & technical SEO',
  requires: ['facts'],
  run(ctx: AuditContext): FindingDraft[] {
    const findings: FindingDraft[] = []
    const plugins = ctx.facts.filter((f) => f.kind === 'wp_plugin')
    const redirects = ctx.facts.filter((f) => f.kind === 'redirect')
    const settings = ctx.facts.filter((f) => f.kind === 'wp_setting')

    const hasSeoPlugin = hasSeoPluginFacts(plugins.map((p) => ({ key: p.key, value: p.value })))
    if (plugins.length > 0 && !hasSeoPlugin) {
      findings.push({
        auditId: 'technical',
        category: 'Technical',
        subjectType: 'site',
        subjectRef: 'seo-plugin',
        subjectLabel: ctx.siteId,
        title: 'No SEO plugin detected',
        evidence: [{ source: 'WP', metric: 'plugins_synced', value: plugins.length }],
        estMonthlyClicks: 0,
        estBookingValue: null,
        confidence: 0.85,
        effort: 'Medium',
        actions: [{ kind: 'monitor', label: 'Install an SEO plugin (Yoast, Rank Math, SEOPress)', requiresReviewer: false }],
        reviewAfter: null,
        fingerprint: 'technical:no-seo-plugin',
        impact: 'Medium',
        source: 'WP',
      })
    }

    const sitemap = ctx.facts.find((f) => f.kind === 'sitemap')
    if (!sitemap) {
      findings.push({
        auditId: 'technical',
        category: 'Technical',
        subjectType: 'setting',
        subjectRef: 'sitemap',
        subjectLabel: 'XML Sitemap',
        title: 'XML sitemap not detected',
        evidence: [{ source: 'WP', metric: 'sitemap', value: 'missing' }],
        estMonthlyClicks: 15,
        estBookingValue: null,
        confidence: settings.length > 0 ? 0.8 : 0.5,
        effort: 'Low',
        actions: [{ kind: 'monitor', label: 'Enable sitemap in SEO plugin', requiresReviewer: false }],
        reviewAfter: null,
        fingerprint: 'technical:no-sitemap',
        impact: 'Low',
        source: 'WP',
      })
    }

    for (const r of redirects) {
      let payload: { source?: string; target?: string; status?: number } = {}
      try {
        payload = JSON.parse(r.value)
      } catch {
        /* skip */
      }
      if (payload.status === 302 && payload.source) {
        findings.push({
          auditId: 'technical',
          category: 'Technical',
          subjectType: 'setting',
          subjectRef: r.key,
          subjectLabel: payload.source,
          title: `Temporary redirect (302) should be 301: ${payload.source}`,
          evidence: [
            { source: 'WP', metric: 'redirect_status', value: 302 },
            { source: 'WP', metric: 'target', value: payload.target ?? '' },
          ],
          estMonthlyClicks: 10,
          estBookingValue: null,
          confidence: 0.95,
          effort: 'Low',
          actions: [{ kind: 'redirect', label: 'Fix redirect to 301', requiresReviewer: true }],
          reviewAfter: null,
          fingerprint: `technical:redirect:${r.key}`,
          impact: 'Low',
          source: 'WP',
        })
      }
    }
    return findings
  },
}
