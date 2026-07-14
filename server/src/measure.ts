import { prisma } from './db.ts'
import { normalizeUrl } from './url.ts'

const MS_DAY = 24 * 60 * 60 * 1000

/** After GSC sync, measure published changes against 28d before/after clicks. */
export async function measureChangeLogVerdicts(siteId: string): Promise<number> {
  const pending = await prisma.changeLog.findMany({
    where: { siteId, verdict: null },
    orderBy: { publishedAt: 'asc' },
  })
  if (!pending.length) return 0

  const gsc = await prisma.gscRow.findMany({
    where: { siteId, query: null },
    orderBy: { date: 'asc' },
  })
  if (!gsc.length) return 0

  let updated = 0
  for (const log of pending) {
    const pub = log.publishedAt.getTime()
    const beforeStart = new Date(pub - 28 * MS_DAY)
    const beforeEnd = new Date(pub - MS_DAY)
    const afterStart = new Date(pub)
    const afterEnd = new Date(pub + 28 * MS_DAY)
    const pageKey = normalizeUrl(log.page)

    let clicksBefore = 0
    let clicksAfter = 0
    let posBefore = 0
    let posAfter = 0
    let imprBefore = 0
    let imprAfter = 0

    for (const r of gsc) {
      if (normalizeUrl(r.page) !== pageKey) continue
      const t = r.date.getTime()
      if (t >= beforeStart.getTime() && t <= beforeEnd.getTime()) {
        clicksBefore += r.clicks
        posBefore += r.position * r.impressions
        imprBefore += r.impressions
      }
      if (t >= afterStart.getTime() && t <= afterEnd.getTime()) {
        clicksAfter += r.clicks
        posAfter += r.position * r.impressions
        imprAfter += r.impressions
      }
    }

    if (imprAfter < 10 && imprBefore < 10) continue

    const avgPosBefore = imprBefore > 0 ? posBefore / imprBefore : null
    const avgPosAfter = imprAfter > 0 ? posAfter / imprAfter : null
    let verdict: string = 'Monitoring'
    if (clicksAfter > clicksBefore * 1.1 || (avgPosAfter != null && avgPosBefore != null && avgPosAfter < avgPosBefore - 1)) {
      verdict = 'Improving'
    } else if (clicksAfter < clicksBefore * 0.85 || (avgPosAfter != null && avgPosBefore != null && avgPosAfter > avgPosBefore + 2)) {
      verdict = 'Regressed'
    }

    await prisma.changeLog.update({
      where: { id: log.id },
      data: {
        verdict,
        clicksBefore28d: clicksBefore,
        clicksAfter28d: clicksAfter,
        positionBefore: avgPosBefore,
        positionAfter: avgPosAfter,
        measuredAt: new Date(),
      },
    })
    if (log.findingId) {
      const finding = await prisma.finding.findUnique({ where: { id: log.findingId } })
      if (finding) {
        const nextConfidence =
          verdict === 'Improving'
            ? Math.min(0.99, finding.confidence + 0.1)
            : verdict === 'Regressed'
              ? Math.max(0.1, finding.confidence - 0.15)
              : finding.confidence
        await prisma.finding.update({
          where: { id: log.findingId },
          data: {
            confidence: nextConfidence,
            status: verdict === 'Improving' ? 'done' : finding.status === 'done' ? 'monitoring' : finding.status,
          },
        })
      }
    }
    updated++
  }
  return updated
}

export async function writeChangeLog(entry: {
  siteId: string
  page: string
  element: string
  before?: string | null
  after?: string | null
  findingId?: string | null
}) {
  return prisma.changeLog.create({
    data: {
      siteId: entry.siteId,
      page: entry.page,
      element: entry.element,
      before: entry.before ?? null,
      after: entry.after ?? null,
      findingId: entry.findingId ?? null,
    },
  })
}
