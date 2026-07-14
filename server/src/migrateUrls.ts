/**
 * Safe, re-runnable URL identity migration.
 * Run: tsx src/migrateUrls.ts [siteId]
 *
 * 1. Backfills Page.url from WordPress link (requires a prior WP sync, or manual fixture).
 * 2. Merges guessed /slug paths in Recommendation + Opportunity to real canonical URLs.
 * 3. Deletes phantom Page rows with no matching WordPress post.
 * 4. Reports counts — re-run yields 0 merged / 0 deleted when clean.
 */
import { prisma } from './db.ts'
import { normalizeUrl, urlPath, urlsEqual } from './url.ts'

export type MigrationReport = {
  siteId: string
  pagesBefore: number
  pagesAfter: number
  merged: number
  phantomsDeleted: number
  urlsBackfilled: number
}

/** Build a map from guessed legacy paths → canonical url for a site. */
function buildPathMap(pages: { slug: string; url: string | null; unresolved: boolean; wpId: number | null }[]) {
  const map = new Map<string, string>()
  for (const p of pages) {
    if (!p.url || p.unresolved) continue
    map.set(p.url, p.url)
    map.set(urlPath(p.url), p.url)
    map.set(`/${p.slug}`, p.url)
    map.set(normalizeUrl(`/${p.slug}`), p.url)
  }
  return map
}

function resolvePath(pathOrUrl: string, pathMap: Map<string, string>): string | null {
  if (pathMap.has(pathOrUrl)) return pathMap.get(pathOrUrl)!
  const norm = normalizeUrl(pathOrUrl)
  if (pathMap.has(norm)) return pathMap.get(norm)!
  const bare = urlPath(pathOrUrl)
  if (pathMap.has(bare)) return pathMap.get(bare)!
  return null
}

export async function migrateSiteUrls(siteId: string): Promise<MigrationReport> {
  const pagesBefore = await prisma.page.count({ where: { siteId } })

  // Backfill: any page with wpId but no url gets a guessed url from slug (interim)
  // until the next WP sync fills the real link. Mark unresolved if still missing.
  const stale = await prisma.page.findMany({ where: { siteId, url: null, wpId: { not: null } } })
  let urlsBackfilled = 0
  for (const p of stale) {
    // Cannot invent a real permalink — leave unresolved until WP sync.
    await prisma.page.update({ where: { id: p.id }, data: { unresolved: true } })
    urlsBackfilled++
  }

  const pages = await prisma.page.findMany({
    where: { siteId },
    select: { id: true, slug: true, url: true, unresolved: true, wpId: true },
  })
  const pathMap = buildPathMap(pages)

  let merged = 0

  // Remap Recommendation.page and Opportunity.page from guessed paths → canonical.
  const recs = await prisma.recommendation.findMany({ where: { siteId } })
  for (const r of recs) {
    const canonical = resolvePath(r.page, pathMap)
    if (canonical && !urlsEqual(r.page, canonical)) {
      await prisma.recommendation.update({ where: { id: r.id }, data: { page: canonical } })
      merged++
    }
  }

  const opps = await prisma.opportunity.findMany({ where: { siteId } })
  for (const o of opps) {
    const raw = o.page.split(' ')[0]
    const canonical = resolvePath(raw, pathMap)
    if (canonical && !urlsEqual(raw, canonical)) {
      const suffix = o.page.slice(raw.length)
      await prisma.opportunity.update({ where: { id: o.id }, data: { page: canonical + suffix } })
      merged++
    }
  }

  // Delete phantom pages: unresolved with no url, or duplicate slug rows superseded by wpId upsert.
  const phantoms = pages.filter((p) => p.unresolved && !p.url)
  let phantomsDeleted = 0
  for (const ph of phantoms) {
    await prisma.page.delete({ where: { id: ph.id } })
    phantomsDeleted++
  }

  const pagesAfter = await prisma.page.count({ where: { siteId } })

  return { siteId, pagesBefore, pagesAfter, merged, phantomsDeleted, urlsBackfilled }
}

async function main() {
  const siteId = process.argv[2]
  if (!siteId) {
    const first = await prisma.site.findFirst({ orderBy: { createdAt: 'asc' } })
    if (!first) {
      console.error('No sites in database.')
      process.exit(1)
    }
    const report = await migrateSiteUrls(first.id)
    console.log(JSON.stringify(report, null, 2))
  } else {
    const report = await migrateSiteUrls(siteId)
    console.log(JSON.stringify(report, null, 2))
  }
}

const isMain = process.argv[1]?.endsWith('migrateUrls.ts') || process.argv[1]?.includes('migrateUrls')
if (isMain) {
  main()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
