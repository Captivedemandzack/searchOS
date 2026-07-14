import assert from 'node:assert/strict'
import test from 'node:test'
import { runAllAudits } from '../src/audits/run.ts'
import { CONTENT_POLICY } from '../src/contentPolicy.ts'
import type { PageLite } from '../src/contentEngine.ts'

const pg = (slug: string, url: string, type = 'page'): PageLite => ({
  slug,
  title: slug,
  type,
  contentHtml: type === 'post' ? '<p>blog content without service links</p>' : null,
  url,
  wpId: 1,
})

test('audit registry: service architecture flags missing treatment page', async () => {
  const ctx = {
    siteId: 'test',
    pages: [pg('services', 'https://slkclinic.com/services')],
    gsc: [],
    ga4: [],
    competitors: [],
    facts: [{ kind: 'treatment_offered', key: 'botox', value: JSON.stringify({ name: 'Botox' }) }],
    policy: CONTENT_POLICY,
  }
  const result = runAllAudits(ctx)
  assert.ok(result.findings.some((f) => f.auditId === 'service-architecture' && f.title.toLowerCase().includes('botox')))
})

test('audit registry: blog gap blocked when blockNewPosts', () => {
  const ctx = {
    siteId: 'test',
    pages: [pg('about', 'https://slkclinic.com/about')],
    gsc: [
      {
        date: new Date('2026-07-01'),
        page: '/blog',
        query: 'lip filler nashville',
        clicks: 5,
        impressions: 500,
        position: 15,
      },
    ],
    ga4: [],
    competitors: [],
    facts: [],
    policy: CONTENT_POLICY,
  }
  const allowed = runAllAudits(ctx)
  assert.ok(allowed.findings.some((f) => f.auditId === 'blog-gap'))
  const blocked = runAllAudits(ctx, { blockNewPosts: true })
  assert.ok(!blocked.findings.some((f) => f.auditId === 'blog-gap'))
})

test('prioritize: service pages rank with bonus', () => {
  const ctx = {
    siteId: 'test',
    pages: [pg('home', 'https://slkclinic.com/')],
    gsc: [],
    ga4: [],
    competitors: [],
    facts: [{ kind: 'treatment_offered', key: 'filler', value: '{}' }],
    policy: CONTENT_POLICY,
  }
  const result = runAllAudits(ctx)
  const svc = result.findings.find((f) => f.category === 'Service pages')
  assert.ok(svc)
  assert.ok(svc.priorityValue >= 0)
})

test('audit registry: competitor gap emits findings from scans', () => {
  const ctx = {
    siteId: 'test',
    pages: [],
    gsc: [],
    ga4: [],
    competitors: [
      {
        targetKeyword: 'botox nashville',
        ourPath: '/botox',
        findings: JSON.stringify({
          gaps: [{ title: 'Add pricing section', detail: 'Competitors show transparent pricing', priority: 'High' }],
          recommendedSections: ['FAQ'],
        }),
      },
    ],
    facts: [],
    policy: CONTENT_POLICY,
  }
  const result = runAllAudits(ctx)
  assert.ok(result.findings.some((f) => f.auditId === 'competitor-gap' && f.title.includes('pricing')))
  assert.ok(result.findings.some((f) => f.auditId === 'competitor-gap' && f.title.includes('FAQ')))
})
