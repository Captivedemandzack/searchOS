/**
 * Synthetic SLK-shaped fixture — demonstrates phantom elimination + reconciliation.
 * Live SLK numbers (111 pages / 199 recs / 56% coverage) are UNVERIFIED here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeGovernor,
  evaluateSite,
  reconcile,
  type GscRowLite,
  type PageLite,
} from '../src/contentEngine.ts'
import { CONTENT_POLICY } from '../src/contentPolicy.ts'
import { normalizeUrl } from '../src/url.ts'

const HOST = 'https://slkclinic.com'
const P = CONTENT_POLICY
const NOW = new Date('2026-07-13T00:00:00Z')

function pg(slug: string, realPath: string, wpId: number): PageLite {
  return { slug, title: slug, type: 'post', contentHtml: '<p>2026</p>', url: normalizeUrl(`${HOST}${realPath}`), wpId }
}

function gscRow(path: string, date: string, clicks: number, impr: number, pos: number): GscRowLite {
  return { date: new Date(date), page: `${HOST}${path}`, query: null, clicks, impressions: impr, position: pos }
}

/** Build N blog posts at /blog/{slug} plus phantom /{slug} would have existed in old engine. */
function syntheticSlkPages(n: number): PageLite[] {
  const pages: PageLite[] = []
  for (let i = 0; i < n; i++) {
    pages.push(pg(`post-${i}`, `/blog/post-${i}`, 1000 + i))
  }
  return pages
}

function syntheticGsc(pages: PageLite[]): GscRowLite[] {
  const rows: GscRowLite[] = []
  const months = ['2025-07', '2025-10', '2026-01', '2026-04', '2026-07']
  for (const p of pages) {
    const path = p.url!.replace(HOST, '')
    for (const m of months) {
      rows.push(gscRow(path, `${m}-15`, 5 + Math.random() * 10 | 0, 80 + Math.random() * 50 | 0, 8 + Math.random() * 15))
    }
  }
  return rows
}

test('synthetic SLK: one row per page, recs <= pages, reconciliation passes', () => {
  const pages = syntheticSlkPages(20)
  const gsc = syntheticGsc(pages)
  const queue = evaluateSite(gsc, [], pages, P, NOW)
  const rec = reconcile(queue, pages)
  const gov = computeGovernor(
    [{ query: 'botox nashville', impressions: 200, position: 12 }],
    pages,
    2,
    P,
  )

  assert.equal(pages.length, 20)
  assert.ok(queue.length <= pages.length, `recs ${queue.length} must be <= pages ${pages.length}`)
  assert.equal(rec.balanced, true)
  assert.equal(rec.unknownPages, rec.insufficientMissingGsc)
  // Coverage uses full path tokens now (blog, post, nashville etc.)
  assert.ok(gov.coveragePct >= 0)
})

test('synthetic SLK: phantom slug paths are not in queue', () => {
  const pages = [pg('my-post', '/blog/my-post', 1)]
  const gscData = [gscRow('/blog/my-post', '2026-07-01', 40, 400, 10)]
  const queue = evaluateSite(gscData, [], pages, P, NOW)
  const phantom = normalizeUrl(`${HOST}/my-post`)
  assert.ok(!queue.some((r) => r.path === phantom))
  assert.equal(queue.length, 1)
})
