/**
 * Page identity, phantom suppression, cannibalization, reconciliation.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPageSignals,
  evaluateSite,
  reconcile,
  validateConsolidateTargets,
  type GscRowLite,
  type PageLite,
} from '../src/contentEngine.ts'
import { CONTENT_POLICY } from '../src/contentPolicy.ts'
import { normalizeUrl } from '../src/url.ts'

const HOST = 'https://slkclinic.com'
const P = CONTENT_POLICY
const NOW = new Date('2026-07-13T00:00:00Z')

function pg(slug: string, url: string, wpId: number, type = 'post'): PageLite {
  return { slug, title: slug, type, contentHtml: '<p>2026</p>', url: normalizeUrl(url), wpId }
}

function gscPage(path: string, date: string, clicks: number, impressions: number, position: number): GscRowLite {
  return { date: new Date(date), page: `${HOST}${path}`, query: null, clicks, impressions, position }
}

function gscQuery(path: string, query: string, date: string, clicks: number, impressions: number, position: number): GscRowLite {
  return { date: new Date(date), page: `${HOST}${path}`, query, clicks, impressions, position }
}

test('slug and permalink differ → exactly one page signal', () => {
  const pages: PageLite[] = [pg('my-post', `${HOST}/blog/my-post`, 42)]
  const gsc = [gscPage('/blog/my-post', '2026-07-01', 50, 500, 8)]
  const signals = buildPageSignals(gsc, [], pages, P, NOW)
  assert.equal(signals.length, 1)
  assert.equal(signals[0].path, normalizeUrl(`${HOST}/blog/my-post`))
})

test('phantom /slug path with no matching post is not recommended', () => {
  // Only the real /blog/post exists in WP; GSC has data at /blog/post only.
  const pages: PageLite[] = [pg('post', `${HOST}/blog/post`, 1)]
  const gsc = [gscPage('/blog/post', '2026-07-01', 10, 100, 12)]
  const queue = evaluateSite(gsc, [], pages, P, NOW)
  assert.equal(queue.length, 1)
  assert.ok(!queue.some((r) => r.path.includes('/post') && !r.path.includes('/blog')))
})

test('two URLs resolving to same wpId do not flag cannibalization', () => {
  const canonical = normalizeUrl(`${HOST}/blog/botox`)
  const pages: PageLite[] = [pg('botox', canonical, 7)]
  const gsc: GscRowLite[] = [
    gscPage('/blog/botox', '2026-07-01', 20, 400, 8),
    gscPage('/en/blog/botox', '2026-07-01', 10, 300, 11),
    gscQuery('/blog/botox', 'botox nashville', '2026-07-01', 20, 400, 8),
    gscQuery('/en/blog/botox', 'botox nashville', '2026-07-01', 10, 300, 11),
  ]
  const queue = evaluateSite(gsc, [], pages, P, NOW)
  assert.equal(queue.filter((r) => r.action === 'consolidate').length, 0)
})

test('consolidate target that 404s is suppressed', async () => {
  const pages: PageLite[] = [
    pg('a', `${HOST}/page-a`, 1),
    pg('b', `${HOST}/page-b`, 2),
  ]
  const gsc: GscRowLite[] = []
  for (const m of ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']) {
    gsc.push(gscPage('/page-a', `${m}-01`, 20, 400, 8))
    gsc.push(gscPage('/page-b', `${m}-01`, 10, 300, 11))
    gsc.push(gscQuery('/page-a', 'shared keyword', `${m}-01`, 20, 400, 8))
    gsc.push(gscQuery('/page-b', 'shared keyword', `${m}-01`, 10, 300, 11))
  }
  let queue = evaluateSite(gsc, [], pages, P, NOW)
  const mockVerify = async (url: string) => url !== normalizeUrl(`${HOST}/page-a`)
  queue = await validateConsolidateTargets(queue, mockVerify)
  const bRec = queue.find((r) => r.path === normalizeUrl(`${HOST}/page-b`))
  assert.ok(bRec)
  assert.equal(bRec.action, 'insufficient_data')
  assert.match(bRec.reason, /does not return HTTP 200/)
})

test('reconciliation balances when unknown pages equal insufficient_data missing GSC', () => {
  const pages: PageLite[] = [
    pg('known', `${HOST}/known`, 1),
    pg('unknown', `${HOST}/unknown`, 2),
  ]
  const gsc = [gscPage('/known', '2026-07-01', 30, 900, 9)]
  const queue = evaluateSite(gsc, [], pages, P, NOW)
  const result = reconcile(queue, pages)
  assert.equal(result.totalRecs, queue.length)
  assert.ok(result.totalRecs <= result.resolvedPages)
  assert.equal(result.unknownPages, result.insufficientMissingGsc)
  assert.equal(result.balanced, true)
})
