import { prisma } from './db.ts'

/** Client-facing report summary JSON (export to PDF/email in a later pass). */
export async function buildClientReport(siteId: string, periodDays = 28) {
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) throw new Error('Site not found')

  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)
  const [findings, changes, pages, gscRows] = await Promise.all([
    prisma.finding.findMany({
      where: { siteId, status: { in: ['open', 'drafted', 'in_review'] } },
      orderBy: { priorityValue: 'desc' },
      take: 10,
    }),
    prisma.changeLog.findMany({
      where: { siteId, publishedAt: { gte: since } },
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.page.count({ where: { siteId } }),
    prisma.gscRow.findMany({ where: { siteId, query: null, date: { gte: since } } }),
  ])

  let clicks = 0
  let impressions = 0
  for (const r of gscRows) {
    clicks += r.clicks
    impressions += r.impressions
  }

  const improving = changes.filter((c) => c.verdict === 'Improving').length
  const regressed = changes.filter((c) => c.verdict === 'Regressed').length

  return {
    site: { name: site.name, domain: site.domain, periodDays },
    summary: {
      pagesSynced: pages,
      organicClicks: clicks,
      impressions,
      openFindings: findings.length,
      changesPublished: changes.length,
      improving,
      regressed,
    },
    topPriorities: findings.map((f) => ({
      title: f.title,
      category: f.category,
      impact: f.impact,
      estMonthlyClicks: f.estMonthlyClicks,
    })),
    recentChanges: changes.slice(0, 10).map((c) => ({
      page: c.page,
      element: c.element,
      verdict: c.verdict,
      publishedAt: c.publishedAt.toISOString(),
    })),
    generatedAt: new Date().toISOString(),
  }
}
