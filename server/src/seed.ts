/**
 * Seeds the local SQLite store from the frontend's existing dummy dataset
 * (src/data.ts) so the API returns exactly what the prototype currently shows.
 * This keeps a single source of truth during Phase 0; later phases replace these
 * rows with values computed from real GSC/GA4/WordPress data.
 *
 * Run: npm run seed  (or npm run db:reset to wipe + reseed)
 */
import { prisma } from './db.ts'
import {
  sites,
  opps,
  editorData,
  editorTabDefs,
  elemDefs,
  reviewData,
  // dashboard display arrays
  metrics,
  losingPages,
  compGaps,
  scoreParts,
  readyItems,
  recentPublished,
  pageQueries,
  pageComps,
  planLinks,
  planChecklist,
  planDefs,
  competitors,
  kwGaps,
  contentGapCards,
  serpFeatures,
  techIssues,
  impactRows,
  connections,
} from '../../src/data.ts'

async function main() {
  const force = process.env.FORCE_SEED === '1'
  const liveSite = await prisma.site.findFirst({
    where: {
      OR: [
        { wpAppPasswordEnc: { not: null } },
        { googleRefreshTokenEnc: { not: null } },
      ],
    },
  })
  if (liveSite && !force) {
    console.error(
      `Refusing to seed: "${liveSite.domain}" has stored credentials. ` +
        'This would wipe WordPress/Google connections and all synced data. ' +
        'Set FORCE_SEED=1 only if you intend a full factory reset.',
    )
    process.exit(1)
  }
  if (liveSite && force) {
    console.warn(`FORCE_SEED=1 — wiping live data for ${liveSite.domain} and all sites.`)
  }

  console.log('Resetting tables…')
  // Order matters for FK constraints; deleteMany on children first.
  await prisma.changeLog.deleteMany()
  await prisma.ga4Row.deleteMany()
  await prisma.gscRow.deleteMany()
  await prisma.snapshot.deleteMany()
  await prisma.page.deleteMany()
  await prisma.dashboardData.deleteMany()
  await prisma.reviewItem.deleteMany()
  await prisma.elementorSection.deleteMany()
  await prisma.recommendation.deleteMany()
  await prisma.opportunity.deleteMany()
  await prisma.site.deleteMany()

  // The demo dataset describes SLK Clinic (sites[0]); create the others empty so
  // the site switcher is honest about which accounts are populated.
  const created = []
  for (const s of sites) {
    const site = await prisma.site.create({
      data: {
        name: s.name,
        domain: s.domain,
        gscProperty: s.domain === 'slkclinic.com' ? 'sc-domain:slkclinic.com' : null,
        ga4Property: s.domain === 'slkclinic.com' ? '373905967' : null,
      },
    })
    created.push(site)
  }
  const slk = created[0]
  console.log(`Created ${created.length} sites; seeding data under "${slk.name}".`)

  await prisma.opportunity.createMany({
    data: opps.map((o) => ({
      id: o.id, // preserve stable prototype ids (o1…) — store state keys off them
      siteId: slk.id,
      title: o.title,
      page: o.page,
      why: o.why,
      expected: o.expected,
      impact: o.impact,
      confidence: o.confidence,
      effort: o.effort,
      source: o.source,
      type: o.type,
      status: 'Open',
    })),
  })

  // Flatten editorData (Record<tab, EditorItem[]>) into Recommendation rows.
  const recRows = editorTabDefs.flatMap(([tab]) =>
    (editorData[tab] ?? []).map((e) => ({
      id: e.id, // preserve stable ids (e1…)
      siteId: slk.id,
      tab,
      page: e.page,
      current: e.current,
      suggested: e.suggested,
      reason: e.reason,
      queries: JSON.stringify(e.queries),
      chars: e.chars,
    })),
  )
  await prisma.recommendation.createMany({ data: recRows })

  await prisma.elementorSection.createMany({
    data: elemDefs.map((s) => ({
      id: s.id, // preserve stable ids (s1…) — store's jsonOpen keys off them
      siteId: slk.id,
      name: s.name,
      status: s.status,
      ok: s.ok,
      useCase: s.useCase,
      placement: s.placement,
      notes: s.notes,
      rationale: s.rationale,
      size: s.size,
      json: s.json,
    })),
  })

  await prisma.reviewItem.createMany({
    data: reviewData.map((r) => ({
      id: r.id, // preserve stable ids (r1…)
      siteId: slk.id,
      title: r.title,
      detail: r.detail,
      type: r.type,
      risk: r.risk,
      reviewer: r.reviewer,
      dest: r.dest,
      status: r.preset ?? 'Pending',
    })),
  })

  await prisma.dashboardData.create({
    data: {
      siteId: slk.id,
      payload: JSON.stringify({
        metrics,
        losingPages,
        compGaps,
        scoreParts,
        readyItems,
        recentPublished,
        pageQueries,
        pageComps,
        planLinks,
        planChecklist,
        planDefs,
        competitors,
        kwGaps,
        contentGapCards,
        serpFeatures,
        techIssues,
        impactRows,
        connections,
      }),
    },
  })

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
