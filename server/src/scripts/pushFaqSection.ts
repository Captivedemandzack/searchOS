/**
 * Rebuild + push the FAQ Elementor section for one post/page, then verify.
 * Exercises the real library functions (buildFaqElementorSection,
 * appendFaqSectionToElementor, updateElementorContent) end-to-end.
 *
 * Usage: bun run src/scripts/pushFaqSection.ts [domain] [slug]
 */
import { prisma } from '../db'
import { decrypt } from '../crypto'
import { parseFaqPairs } from '../schema'
import {
  appendFaqSectionToElementor,
  buildFaqElementorSection,
  findGroundworkFaqContainer,
  serializeFaqSectionForStorage,
} from '../elementorFaq'
import { parseElementorRoot } from '../elementorPatch'
import { updateElementorContent, type WpAuth } from '../wordpress'

const domain = process.argv[2] ?? 'slkclinic.com'
const needle = process.argv[3] ?? 'which-botox-lasts-the-longest-a-comparison-of-botulinum-toxins'

async function main() {
  const site = await prisma.site.findFirst({ where: { domain } })
  if (!site?.wpUsername || !site.wpAppPasswordEnc || !site.wpBaseUrl) {
    throw new Error(`No WP creds for ${domain}`)
  }
  const auth: WpAuth = {
    baseUrl: site.wpBaseUrl,
    username: site.wpUsername,
    appPassword: decrypt(site.wpAppPasswordEnc),
  }

  const slug = needle.split('/').filter(Boolean).pop()!
  const page = await prisma.page.findFirst({
    where: { siteId: site.id, slug },
    select: { id: true, type: true, wpId: true, elementorData: true },
  })
  if (!page?.wpId || !page.elementorData) {
    throw new Error(`Page ${slug} not synced or has no elementorData`)
  }

  const faqRec = await prisma.recommendation.findFirst({
    where: { siteId: site.id, tab: 'faq', page: { contains: slug } },
  })
  if (!faqRec?.suggested?.trim()) {
    throw new Error(`No FAQ recommendation found for ${slug}. Generate the game plan first.`)
  }

  const pairs = parseFaqPairs(faqRec.suggested)
  console.log(`FAQ pairs parsed: ${pairs.length}`)
  if (!pairs.length) throw new Error('FAQ recommendation has no parseable Q/A pairs')

  const section = buildFaqElementorSection(pairs, {
    styleReference: page.elementorData,
    sectionTitle: 'Frequently Asked Questions',
  })
  const merged = appendFaqSectionToElementor(page.elementorData, section)
  console.log(`Append action: ${merged.action} · insert index: ${merged.insertIndex ?? 'n/a'}`)

  // Store the section JSON on the rec too, for future pushes via the normal path.
  await prisma.recommendation.update({
    where: { id: faqRec.id },
    data: { elementorJson: serializeFaqSectionForStorage(section) },
  })

  const contentType = page.type === 'post' ? 'post' : 'page'
  const updated = await updateElementorContent(auth, page.wpId, contentType, merged.elementorData)
  await prisma.page.update({
    where: { id: page.id },
    data: { elementorData: merged.elementorData },
  })
  console.log('Pushed to WordPress:', updated.link)

  // Verify: re-parse what we pushed and confirm the FAQ container is present.
  const check = parseElementorRoot(merged.elementorData)
  const container = findGroundworkFaqContainer(check.root)
  console.log('FAQ container present in pushed data:', !!container)
  console.log('Root node count:', check.root.length)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
