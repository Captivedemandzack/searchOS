import { prisma } from './db.ts'

const MS_HOUR = 60 * 60 * 1000

/** Background sync scheduler — runs when SYNC_INTERVAL_HOURS is set (default off). */
export function startSyncScheduler(injectRefresh: (siteId: string) => Promise<void>) {
  const hours = Number(process.env.SYNC_INTERVAL_HOURS ?? 0)
  if (!hours || hours <= 0) return

  const intervalMs = hours * MS_HOUR
  setInterval(async () => {
    const sites = await prisma.site.findMany({
      where: { wpBaseUrl: { not: null }, googleRefreshTokenEnc: { not: null } },
    })
    for (const site of sites) {
      try {
        await injectRefresh(site.id)
      } catch (err) {
        console.warn(`Scheduled sync failed for ${site.domain}:`, (err as Error).message)
      }
    }
  }, intervalMs)
  console.info(`Sync scheduler started — every ${hours}h`)
}
