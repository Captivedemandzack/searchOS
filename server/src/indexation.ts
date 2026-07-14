import { prisma } from './db.ts'
import { normalizeUrl } from './url.ts'

/** GSC URL Inspection proxy — uses GSC impressions until full Inspection API is wired. */
export async function inspectUrlIndexStatus(
  siteId: string,
  pageUrl: string,
): Promise<{ indexed: boolean | null; verdict: string | null }> {
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site?.gscProperty || !site.googleRefreshTokenEnc) {
    return { indexed: null, verdict: 'Google not connected' }
  }
  const key = normalizeUrl(pageUrl)
  const row = await prisma.gscRow.findFirst({
    where: { siteId, query: null, page: { contains: key.split('/').pop() ?? '' } },
  })
  return {
    indexed: row ? row.impressions > 0 : null,
    verdict: row ? (row.impressions > 0 ? 'Likely indexed (GSC impressions)' : 'No impressions') : 'Unknown',
  }
}

export async function captureIndexationFacts(siteId: string, paths: string[]): Promise<void> {
  for (const path of paths.slice(0, 10)) {
    const status = await inspectUrlIndexStatus(siteId, path)
    await prisma.siteFact.upsert({
      where: { siteId_kind_key: { siteId, kind: 'indexation', key: path.replace(/^\//, '') || 'home' } },
      create: {
        siteId,
        kind: 'indexation',
        key: path.replace(/^\//, '') || 'home',
        value: JSON.stringify(status),
      },
      update: { value: JSON.stringify(status), observedAt: new Date() },
    })
  }
}
