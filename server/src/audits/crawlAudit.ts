import type { Audit, AuditContext, FindingDraft } from './types.ts'

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function hasH1(html: string | null): boolean {
  if (!html) return false
  return /<h1\b[^>]*>/i.test(html)
}

/** Internal crawl over synced WP pages — orphans, duplicate meta, missing H1. */
export const crawlAudit: Audit = {
  id: 'crawl',
  category: 'Technical',
  title: 'On-site crawl (synced pages)',
  requires: ['pages'],
  run(ctx: AuditContext): FindingDraft[] {
    const findings: FindingDraft[] = []
    const pages = ctx.pages.filter((p) => p.contentHtml || p.url)
    if (pages.length < 2) return findings

    const metaMap = new Map<string, string[]>()
    const inbound = new Map<string, number>()
    for (const p of pages) {
      const path = p.url ? new URL(p.url).pathname : `/${p.slug}`
      inbound.set(path, 0)
    }

    for (const p of pages) {
      const path = p.url ? new URL(p.url).pathname : `/${p.slug}`
      const meta = (p.title ?? '').trim()
      if (meta) {
        const list = metaMap.get(meta.toLowerCase()) ?? []
        list.push(path)
        metaMap.set(meta.toLowerCase(), list)
      }
      if (!hasH1(p.contentHtml)) {
        findings.push({
          auditId: 'crawl',
          category: 'Technical',
          subjectType: 'page',
          subjectRef: path,
          subjectLabel: path,
          title: `Missing H1: ${path}`,
          evidence: [{ source: 'Crawl', metric: 'h1', value: 'missing' }],
          estMonthlyClicks: 20,
          estBookingValue: null,
          confidence: 0.85,
          effort: 'Low',
          actions: [{ kind: 'content_update', label: 'Add H1 via content update', requiresReviewer: true, updateTypes: ['headings'] }],
          reviewAfter: null,
          fingerprint: `crawl:missing-h1:${path}`,
          impact: 'Medium',
          source: 'Crawl',
        })
      }
      const html = p.contentHtml ?? ''
      for (const other of pages) {
        if (other.slug === p.slug) continue
        const otherPath = other.url ? new URL(other.url).pathname : `/${other.slug}`
        if (html.includes(otherPath) || html.includes(other.slug)) {
          inbound.set(otherPath, (inbound.get(otherPath) ?? 0) + 1)
        }
      }
    }

    for (const [meta, paths] of metaMap) {
      if (paths.length < 2) continue
      findings.push({
        auditId: 'crawl',
        category: 'Technical',
        subjectType: 'site',
        subjectRef: 'duplicate-meta',
        subjectLabel: meta.slice(0, 60),
        title: `Duplicate meta title on ${paths.length} pages`,
        evidence: [{ source: 'Crawl', metric: 'pages', value: paths.join(', ') }],
        estMonthlyClicks: 30,
        estBookingValue: null,
        confidence: 0.9,
        effort: 'Medium',
        actions: [{ kind: 'meta_rewrite', label: 'Differentiate meta titles', requiresReviewer: true }],
        reviewAfter: null,
        fingerprint: `crawl:dup-meta:${meta.slice(0, 40)}`,
        impact: 'Medium',
        source: 'Crawl',
      })
    }

    const knownPaths = new Set([...inbound.keys()])
    for (const p of pages) {
      const html = p.contentHtml ?? ''
      const from = p.url ? new URL(p.url).pathname : `/${p.slug}`
      const hrefRe = /href=["']([^"']+)["']/gi
      let m: RegExpExecArray | null
      while ((m = hrefRe.exec(html))) {
        const href = m[1]
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue
        try {
          const u = new URL(href, p.url ?? 'https://example.com')
          const target = u.pathname
          if (u.hostname && p.url) {
            const host = new URL(p.url).hostname
            if (u.hostname !== host) continue
          }
          if (!knownPaths.has(target) && !target.includes('.')) {
            findings.push({
              auditId: 'crawl',
              category: 'Technical',
              subjectType: 'page',
              subjectRef: from,
              subjectLabel: from,
              title: `Broken internal link to ${target}`,
              evidence: [{ source: 'Crawl', metric: 'broken_href', value: `${from} → ${target}` }],
              estMonthlyClicks: 10,
              estBookingValue: null,
              confidence: 0.7,
              effort: 'Low',
              actions: [{ kind: 'content_update', label: 'Fix or remove broken link', requiresReviewer: true, updateTypes: ['links'] }],
              reviewAfter: null,
              fingerprint: `crawl:broken:${from}:${target}`,
              impact: 'Low',
              source: 'Crawl',
            })
          }
        } catch {
          /* skip malformed URLs */
        }
      }
      const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
      if (canon?.[1] && p.url) {
        try {
          const canonical = new URL(canon[1]).pathname
          const self = new URL(p.url).pathname
          if (canonical !== self) {
            findings.push({
              auditId: 'crawl',
              category: 'Technical',
              subjectType: 'page',
              subjectRef: self,
              subjectLabel: self,
              title: `Canonical points elsewhere: ${canonical}`,
              evidence: [{ source: 'Crawl', metric: 'canonical', value: canon[1] }],
              estMonthlyClicks: 25,
              estBookingValue: null,
              confidence: 0.8,
              effort: 'Medium',
              actions: [{ kind: 'monitor', label: 'Review canonical tag in WordPress', requiresReviewer: false }],
              reviewAfter: null,
              fingerprint: `crawl:canonical:${self}`,
              impact: 'Medium',
              source: 'Crawl',
            })
          }
        } catch {
          /* skip */
        }
      }
    }

    for (const [path, count] of inbound) {
      if (path === '/' || count > 0) continue
      findings.push({
        auditId: 'crawl',
        category: 'Technical',
        subjectType: 'page',
        subjectRef: path,
        subjectLabel: path,
        title: `Orphan page (no internal links): ${path}`,
        evidence: [{ source: 'Crawl', metric: 'inbound_links', value: 0 }],
        estMonthlyClicks: 15,
        estBookingValue: null,
        confidence: 0.75,
        effort: 'Low',
        actions: [{ kind: 'content_update', label: 'Add internal links', requiresReviewer: true, updateTypes: ['links'] }],
        reviewAfter: null,
        fingerprint: `crawl:orphan:${path}`,
        impact: 'Low',
        source: 'Crawl',
      })
    }

    return findings
  },
}
