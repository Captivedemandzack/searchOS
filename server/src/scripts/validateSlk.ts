/**
 * SLK live validation checklist — run after connecting WP + Google.
 * Usage: bun run server/src/scripts/validateSlk.ts
 */
import { prisma } from '../db.ts'
import { runSiteAudits } from '../audits/run.ts'

async function main() {
  const site = await prisma.site.findFirst({ where: { domain: { contains: 'slkclinic' } } })
  if (!site) {
    console.error('No SLK site found. Run db:seed or POST /api/sites first.')
    process.exit(1)
  }

  const pages = await prisma.page.count({ where: { siteId: site.id } })
  const gsc = await prisma.gscRow.count({ where: { siteId: site.id } })
  const ga4 = await prisma.ga4Row.count({ where: { siteId: site.id } })
  const connected = {
    wordpress: !!(site.wpBaseUrl && site.wpAppPasswordEnc),
    google: !!site.googleRefreshTokenEnc,
    gsc: !!site.gscProperty,
    ga4: !!site.ga4Property,
  }

  console.log('SLK validation')
  console.log('--------------')
  console.log('Site:', site.name, site.domain)
  console.log('Connections:', connected)
  console.log('Pages synced:', pages)
  console.log('GSC rows:', gsc)
  console.log('GA4 rows:', ga4)
  console.log('Last synced:', site.lastSyncedAt?.toISOString() ?? 'never')

  if (!connected.wordpress || !connected.gsc) {
    console.warn('\n⚠ Connect WordPress + GSC in Settings, then Refresh before trusting findings.')
    process.exit(0)
  }

  const audit = await runSiteAudits(site.id)
  console.log('\nTop 5 findings:')
  for (const f of audit.findings.slice(0, 5)) {
    console.log(`- [${f.impact}] ${f.title} (${f.category})`)
  }
  console.log('\nGovernor:', audit.governor.reason ?? `allowNewPosts=${audit.governor.allowNewPosts}`)
  console.log('Persist:', audit.persist)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
