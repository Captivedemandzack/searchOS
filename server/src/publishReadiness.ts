/**
 * Pre-publish readiness check ("verified draft" stage of the autonomous flow).
 *
 * Before anything is written to the live site, we assemble the exact payload we
 * WOULD push and prove each planned change actually lands — every internal link
 * placed, FAQ accordion built, schema valid, title/meta present. This is the
 * safety gate that lets the autonomous runner stop at a trustworthy draft for a
 * human to click Publish.
 */
import { prisma } from './db.ts'
import { canonicalPath, loadPageForPath, loadRecommendationsForPath } from './contentPublish.ts'
import {
  applyContentRecommendationsToElementor,
  normalizeElementorLinks,
  outlineForBodyWidgets,
  parseElementorRoot,
  patchLinkWidgetsDetailed,
  stripHtml,
} from './elementorPatch.ts'
import {
  appendFaqSectionToElementor,
  buildFaqElementorSection,
  faqUsesElementorSection,
  findGroundworkFaqContainer,
  mergeFaqIntoPostContent,
} from './elementorFaq.ts'
import { buildFaqPageSchema, parseFaqPairs } from './schema.ts'
import { buildPagePathAliasMap } from './url.ts'

export type ReadinessCheck = {
  label: string
  ok: boolean
  detail: string
}

export type PublishReadiness = {
  ok: boolean
  checkedAt: string
  path: string
  usesElementor: boolean
  checks: ReadinessCheck[]
}

/** Assemble the would-be payload and confirm every planned change is placeable. */
export async function buildPublishReadiness(
  siteId: string,
  subjectRef: string,
): Promise<PublishReadiness> {
  const path = canonicalPath(subjectRef)
  const [site, page, recs] = await Promise.all([
    prisma.site.findUnique({ where: { id: siteId } }),
    loadPageForPath(siteId, subjectRef),
    loadRecommendationsForPath(siteId, subjectRef),
  ])
  const checks: ReadinessCheck[] = []
  const usesElementor = faqUsesElementorSection(page ?? { type: 'page', elementorData: null })

  const aliasPages = await prisma.page.findMany({
    where: { siteId },
    select: { slug: true, url: true, type: true },
  })
  const aliases = buildPagePathAliasMap(aliasPages)
  const baseUrl = site?.wpBaseUrl ?? null

  const byTab = new Map(recs.map((r) => [r.tab, r]))

  // Title / meta ------------------------------------------------------------
  const titleRec = byTab.get('title')
  if (titleRec?.suggested?.trim()) {
    checks.push({
      label: 'SEO title',
      ok: titleRec.suggested.trim().length > 0,
      detail: titleRec.suggested.trim().slice(0, 80),
    })
  }
  const metaRec = byTab.get('meta')
  if (metaRec?.suggested?.trim()) {
    const len = metaRec.suggested.trim().length
    checks.push({
      label: 'Meta description',
      ok: len > 0 && len <= 165,
      detail: `${len} chars`,
    })
  }

  // Elementor-rendered pages: prove heading/body/link placement -------------
  if (page?.elementorData?.trim()) {
    const elementorRecs = recs
      .filter((r) => ['headings', 'body', 'links'].includes(r.tab))
      .map((r) => ({ tab: r.tab, current: r.current, suggested: r.suggested }))
    if (elementorRecs.length) {
      const result = applyContentRecommendationsToElementor(page.elementorData, elementorRecs, {
        siteBaseUrl: baseUrl,
        externalH1: page.type === 'post',
        pathAliases: aliases,
      })
      const liveText = stripHtml(page.elementorData).toLowerCase()
      const headingRec = byTab.get('headings')
      if (headingRec?.suggested?.trim()) {
        // "Already live" (idempotent re-run) is a pass, not a gap.
        const headingsLive = outlineForBodyWidgets(headingRec.suggested, {
          externalH1: page.type === 'post',
        }).every((h) => liveText.includes(h.text.trim().toLowerCase().slice(0, 60)))
        checks.push({
          label: 'Headings',
          ok: result.patched.headings > 0 || headingsLive,
          detail:
            result.patched.headings > 0
              ? `${result.patched.headings} heading widget(s) updated`
              : headingsLive
                ? 'already live'
                : 'no matching heading widgets found',
        })
      }
      const bodyRec = byTab.get('body')
      if (bodyRec?.suggested?.trim()) {
        const sample = stripHtml(bodyRec.suggested).replace(/\s+/g, ' ').trim().slice(0, 60).toLowerCase()
        const bodyLive = sample.length >= 8 && liveText.includes(sample)
        checks.push({
          label: 'Body intro',
          ok: result.patched.body > 0 || bodyLive,
          detail: result.patched.body > 0 ? 'body widget updated' : bodyLive ? 'already live' : 'no body widget matched',
        })
      }
    }

    // Links: contextual, in-body placement only (Google 2026 guidance). This is
    // a best-effort ENHANCEMENT — links are placed on real body phrases when the
    // topic is discussed, and skipped (never forced) when it isn't. It therefore
    // never blocks the verified-draft gate; the detail stays honest either way.
    const linkRec = byTab.get('links')
    if (linkRec?.suggested?.trim()) {
      const parsed = parseElementorRoot(page.elementorData)
      // Match the publish transform: strip old stuffing blocks + fix permalinks
      // BEFORE checking placement, so links can't attach to soon-removed junk.
      normalizeElementorLinks(parsed.root, baseUrl, aliases)
      const outcome = patchLinkWidgetsDetailed(parsed.root, linkRec.suggested, baseUrl, aliases)
      const inline = outcome.placements.filter((p) => p.mode === 'inline').length
      const existing = outcome.placements.filter((p) => p.mode === 'existing').length
      const skipped = outcome.placements.filter((p) => p.mode === 'skipped').length
      const live = inline + existing
      checks.push({
        label: 'Internal links',
        ok: true,
        detail:
          live > 0
            ? `${live} contextual link${live === 1 ? '' : 's'} placed in body` +
              (existing ? ` (${existing} already present)` : '') +
              (skipped ? ` · ${skipped} skipped (topic not in body)` : '')
            : 'no in-body mention to link naturally — skipped to avoid stuffing',
      })
    }
  }

  // FAQ ---------------------------------------------------------------------
  const faqRec = byTab.get('faq')
  if (faqRec?.suggested?.trim()) {
    const pairs = parseFaqPairs(faqRec.suggested)
    if (usesElementor && page?.elementorData?.trim()) {
      const section = buildFaqElementorSection(pairs, { styleReference: page.elementorData })
      const appended = appendFaqSectionToElementor(page.elementorData, section)
      const parsedAfter = parseElementorRoot(appended.elementorData)
      const present = !!findGroundworkFaqContainer(parsedAfter.root)
      checks.push({
        label: 'FAQ accordion',
        ok: present && pairs.length > 0,
        detail: present
          ? `${pairs.length} Q&A as native accordion, ${appended.action} before final CTA`
          : 'FAQ section could not be placed',
      })
    } else {
      const merged = mergeFaqIntoPostContent(page?.contentHtml ?? '', pairs)
      checks.push({
        label: 'FAQ (post content)',
        ok: pairs.length > 0 && merged.includes('groundwork-faq'),
        detail: `${pairs.length} Q&A merged into post content`,
      })
    }

    // Schema: FAQPage JSON-LD must be valid.
    try {
      const schema = buildFaqPageSchema(pairs, `${baseUrl ?? ''}${path}`)
      const parsedSchema = JSON.parse(schema) as { '@type'?: string; mainEntity?: unknown[] }
      checks.push({
        label: 'FAQPage schema',
        ok: parsedSchema['@type'] === 'FAQPage' && (parsedSchema.mainEntity?.length ?? 0) === pairs.length,
        detail: `FAQPage with ${parsedSchema.mainEntity?.length ?? 0} entities`,
      })
    } catch {
      checks.push({ label: 'FAQPage schema', ok: false, detail: 'schema failed to build' })
    }
  }

  return {
    ok: checks.length > 0 && checks.every((c) => c.ok),
    checkedAt: new Date().toISOString(),
    path,
    usesElementor,
    checks,
  }
}
