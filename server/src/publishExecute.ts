import { prisma } from './db.ts'
import { decrypt } from './crypto.ts'
import {
  createWpDraftPost,
  probeGroundworkConnector,
  updateElementorContent,
  updatePageContent,
  updatePageSeoMeta,
  writePageSchemaGraph,
  type WpAuth,
} from './wordpress.ts'
import { createRedirect } from './redirectFacts.ts'
import {
  assembleContentFromRecommendations,
  loadPageForPath,
  loadRecommendationsForPath,
  markPageWorkComplete,
} from './contentPublish.ts'
import { applyContentRecommendationsToElementor, parseLinkSuggestions } from './elementorPatch.ts'
import { appendFaqSectionToElementor, parseFaqSectionFromStorage } from './elementorFaq.ts'
import { buildPagePathAliasMap, normalizeUrl, resolveAliasedPath, urlPath } from './url.ts'
import { collectSchemaTypes, parseFaqPairs, stripSchemaScript } from './schema.ts'
import { mergeFaqIntoPostContent } from './elementorFaq.ts'
import { verifyContentPublish } from './publishVerify.ts'
import {
  actionTier,
  canPublishToWordPress,
  DRAFT_ONLY_DEFAULT,
  requiresSnapshot,
  requiresYmyLReview,
} from './publishPolicy.ts'
import type { ActionKind } from './audits/types.ts'
import { writeChangeLog } from './measure.ts'
import { summarizeSeoPlugins } from './seoPlugins.ts'

/** Store current page state before a careful-tier write. */
export async function snapshotBeforeWrite(
  siteId: string,
  subjectRef: string,
  kind: 'meta' | 'content' | 'elementor',
): Promise<void> {
  const page = await loadPageForPath(siteId, subjectRef)
  if (!page) return
  const payload =
    kind === 'elementor' && page.elementorData
      ? page.elementorData
      : JSON.stringify({
          metaTitle: page.metaTitle,
          metaDesc: page.metaDesc,
          contentHtml: page.contentHtml?.slice(0, 50_000) ?? null,
        })
  await prisma.snapshot.create({
    data: { siteId, slug: page.slug, kind, payload },
  })
}

async function wpAuthForSite(siteId: string): Promise<WpAuth> {
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site?.wpBaseUrl || !site.wpUsername || !site.wpAppPasswordEnc) {
    throw new Error('Connect WordPress first (Settings) to publish.')
  }
  return {
    baseUrl: site.wpBaseUrl,
    username: site.wpUsername,
    appPassword: decrypt(site.wpAppPasswordEnc),
  }
}

async function snapshotKindForPublish(
  siteId: string,
  subjectRef: string,
  kind: ActionKind,
): Promise<'meta' | 'content' | 'elementor'> {
  if (kind === 'meta_rewrite') return 'meta'
  const page = await loadPageForPath(siteId, subjectRef)
  if (page?.elementorData) return 'elementor'
  return 'content'
}

/** Apply an approved ReviewItem to WordPress (draft by default). */
export async function executeApprovedReviewItem(
  siteId: string,
  itemId: string,
  overrides?: { title?: string; description?: string },
): Promise<Record<string, unknown>> {
  const item = await prisma.reviewItem.findUnique({ where: { id: itemId } })
  if (!item || item.siteId !== siteId) throw new Error('Review item not found')
  if (item.status !== 'Approved') throw new Error('Approve this change before publishing to WordPress')
  if (item.executedAt) throw new Error('This item was already published to WordPress')

  const kind = (item.actionKind ?? item.type) as ActionKind
  const tier = actionTier(kind)
  if (!canPublishToWordPress(tier)) {
    throw new Error('This action type requires manual execution in WordPress')
  }

  const finding = item.findingId
    ? await prisma.finding.findUnique({ where: { id: item.findingId } })
    : null
  const payload = JSON.parse(item.payloadJson ?? '{}') as Record<string, unknown>
  const payloadDiff = payload.diff as
    | {
        subjectRef?: string
        title?: { after?: string } | null
        meta?: { after?: string } | null
      }
    | undefined
  const subjectRef =
    finding?.subjectRef ??
    (typeof payload.path === 'string' ? payload.path : null) ??
    payloadDiff?.subjectRef ??
    item.detail ??
    ''
  const subjectLabel = finding?.subjectLabel ?? item.title

  if (requiresYmyLReview(kind, subjectLabel) && kind === 'blog_post') {
    const payload = JSON.parse(item.payloadJson ?? '{}') as { blogPostId?: string }
    if (payload.blogPostId) {
      const post = await prisma.blogPost.findUnique({ where: { id: payload.blogPostId } })
      if (!post?.reviewerName?.trim() || !post.reviewApprovedAt) {
        throw new Error('YMYL content requires a named reviewer approval before publish')
      }
    }
  }

  if (requiresSnapshot(tier) && subjectRef && kind !== 'redirect') {
    const snapKind = await snapshotKindForPublish(siteId, subjectRef, kind)
    await snapshotBeforeWrite(siteId, subjectRef, snapKind)
  }

  const auth = await wpAuthForSite(siteId)
  let result: Record<string, unknown> = { kind, tier, draftOnly: DRAFT_ONLY_DEFAULT }

  if (kind === 'blog_post' && payload.blogPostId) {
    const post = await prisma.blogPost.findUnique({ where: { id: String(payload.blogPostId) } })
    if (!post) throw new Error('Blog post not found')
    const faqs = JSON.parse(post.faqsJson) as { q: string; a: string }[]
    const faqHtml = faqs.length
      ? `\n<h2>Frequently Asked Questions</h2>\n${faqs.map((f) => `<h3>${f.q}</h3>\n<p>${f.a}</p>`).join('\n')}`
      : ''
    const created = await createWpDraftPost(auth, {
      title: post.title,
      content: post.bodyHtml + faqHtml,
      excerpt: post.metaDescription,
      slug: post.slug,
      categories: JSON.parse(post.categoriesJson) as string[],
      existingId: post.wpPostId ?? undefined,
    })
    await prisma.blogPost.update({
      where: { id: post.id },
      data: { status: 'Published', wpPostId: created.id, wpEditUrl: created.editUrl },
    })
    result = { ...result, wpPostId: created.id, editUrl: created.editUrl, link: created.link }
    await writeChangeLog({
      siteId,
      page: created.link,
      element: 'blog_post',
      after: post.title,
      findingId: item.findingId,
    })
  } else if (kind === 'meta_rewrite' && subjectRef) {
    const page = await loadPageForPath(siteId, subjectRef)
    const recs = await loadRecommendationsForPath(siteId, subjectRef)
    const titleRec = recs.find((r) => r.tab === 'title')
    const metaRec = recs.find((r) => r.tab === 'meta')
    if (!page?.wpId) throw new Error('Page not synced from WordPress yet')
    const titleVal =
      overrides?.title?.trim() ||
      titleRec?.suggested ||
      payloadDiff?.title?.after ||
      page.metaTitle ||
      page.title
    const descVal =
      overrides?.description?.trim() ||
      metaRec?.suggested ||
      payloadDiff?.meta?.after ||
      page.metaDesc
    if (!titleVal && !descVal) throw new Error('No SEO title or meta description to publish')
    const contentType = page.type === 'post' ? 'post' : 'page'
    const pluginFacts = await prisma.siteFact.findMany({ where: { siteId, kind: 'wp_plugin' } })
    const seo = summarizeSeoPlugins(pluginFacts.map((p) => ({ key: p.key, value: p.value })))
    if (!seo.capabilities.metaWrite) {
      throw new Error(
        'No supported SEO plugin detected (Yoast, Rank Math, SEOPress, or AIOSEO). Sync WordPress or paste manually.',
      )
    }
    const updated = await updatePageSeoMeta(
      auth,
      page.wpId,
      contentType,
      {
        title: titleVal,
        description: descVal,
      },
      { preserveStatus: true, metaAdapters: seo.capabilities.metaAdapters },
    )
    await prisma.page.update({
      where: { id: page.id },
      data: {
        metaTitle: titleVal ?? page.metaTitle,
        metaDesc: descVal ?? page.metaDesc,
      },
    })
    result = {
      ...result,
      wpPageId: updated.id,
      editUrl: updated.editUrl,
      link: updated.link,
      seoPlugin: seo.primary?.name ?? 'SEO plugin',
    }
    await writeChangeLog({
      siteId,
      page: subjectRef,
      element: 'meta_rewrite',
      before: page.metaTitle ?? undefined,
      after: titleVal ?? undefined,
      findingId: item.findingId,
    })
  } else if (kind === 'content_update' && subjectRef) {
    const page = await loadPageForPath(siteId, subjectRef)
    if (!page?.wpId) throw new Error('Page not synced from WordPress yet')
    const recs = await loadRecommendationsForPath(siteId, subjectRef)
    const titleRec = recs.find((r) => r.tab === 'title')
    const metaRec = recs.find((r) => r.tab === 'meta')
    const contentRecs = recs.filter((r) => !['title', 'meta'].includes(r.tab))
    if (!contentRecs.length && !titleRec && !metaRec) {
      throw new Error('No recommendations found for this page')
    }

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    const contentType = page.type === 'post' ? 'post' : 'page'
    const pluginFacts = await prisma.siteFact.findMany({ where: { siteId, kind: 'wp_plugin' } })
    const seo = summarizeSeoPlugins(pluginFacts.map((p) => ({ key: p.key, value: p.value })))
    const updatedParts: string[] = []

    const titleVal =
      overrides?.title?.trim() ||
      titleRec?.suggested ||
      payloadDiff?.title?.after ||
      page.metaTitle ||
      page.title
    const descVal =
      overrides?.description?.trim() ||
      metaRec?.suggested ||
      payloadDiff?.meta?.after ||
      page.metaDesc

    if ((titleVal || descVal) && seo.capabilities.metaWrite) {
      const updatedSeo = await updatePageSeoMeta(
        auth,
        page.wpId,
        contentType,
        { title: titleVal, description: descVal },
        { preserveStatus: true, metaAdapters: seo.capabilities.metaAdapters },
      )
      await prisma.page.update({
        where: { id: page.id },
        data: {
          metaTitle: titleVal ?? page.metaTitle,
          metaDesc: descVal ?? page.metaDesc,
        },
      })
      if (titleVal && titleVal !== (page.metaTitle ?? '')) updatedParts.push('SEO title')
      if (descVal && descVal !== (page.metaDesc ?? '')) updatedParts.push('meta description')
      result = { ...result, wpPageId: updatedSeo.id, editUrl: updatedSeo.editUrl, link: updatedSeo.link }
    }

    const schemaRec = recs.find((r) => r.tab === 'schema')
    const faqRec = recs.find((r) => r.tab === 'faq')
    const hasSchemaPush = !!schemaRec?.suggested?.trim()
    const hasFaqElementorPush = !!faqRec?.elementorJson?.trim()
    const elementorContentRecs = contentRecs.filter((r) => !['faq', 'schema'].includes(r.tab))
    let faqHandledInContent = false

    if (page.elementorData && (elementorContentRecs.length || hasFaqElementorPush)) {
      const probe = await probeGroundworkConnector(auth)
      if (!probe.elementorWrite && probe.installed) {
        throw new Error(
          'Update the Groundwork Connector to v1.2+ on WordPress to push heading and body changes to Elementor pages.',
        )
      }

      const sitePages = await prisma.page.findMany({
        where: { siteId },
        select: { slug: true, url: true, type: true },
      })
      const pathAliases = buildPagePathAliasMap(sitePages)

      let nextElementorData = page.elementorData
      const elementorSummary: string[] = []

      if (elementorContentRecs.length) {
        const patch = applyContentRecommendationsToElementor(nextElementorData, elementorContentRecs, {
          siteBaseUrl: site?.wpBaseUrl ?? null,
          externalH1: contentType === 'post',
          pathAliases,
        })
        nextElementorData = patch.elementorData
        elementorSummary.push(...patch.summary)
      }

      if (hasFaqElementorPush && faqRec?.elementorJson) {
        const section = parseFaqSectionFromStorage(faqRec.elementorJson)
        if (section) {
          const faqPatch = appendFaqSectionToElementor(nextElementorData, section)
          nextElementorData = faqPatch.elementorData
          elementorSummary.push(...faqPatch.summary)
        }
      }

      if (elementorSummary.length === 0 && updatedParts.length === 0 && !hasSchemaPush) {
        throw new Error('No Elementor widgets matched the suggested changes on this page')
      }
      if (elementorSummary.length > 0) {
        const updated = await updateElementorContent(
          auth,
          page.wpId,
          contentType,
          nextElementorData,
        )
        await prisma.page.update({
          where: { id: page.id },
          data: { elementorData: nextElementorData },
        })
        updatedParts.push(...elementorSummary)
        result = { ...result, wpPageId: updated.id, editUrl: updated.editUrl, link: updated.link, elementor: true }
      }
    } else if (contentRecs.length) {
      const { html, summary } = assembleContentFromRecommendations(page.contentHtml ?? '', contentRecs)
      faqHandledInContent = summary.includes('faq')
      const updated = await updatePageContent(auth, page.wpId, contentType, html)
      await prisma.page.update({
        where: { id: page.id },
        data: { contentHtml: html },
      })
      updatedParts.push(...summary)
      result = { ...result, wpPageId: updated.id, editUrl: updated.editUrl, link: updated.link }
    }

    if (faqRec?.suggested?.trim() && !hasFaqElementorPush && !faqHandledInContent) {
      const pairs = parseFaqPairs(faqRec.suggested)
      if (pairs.length) {
        const html = mergeFaqIntoPostContent(page.contentHtml ?? '', pairs)
        const updated = await updatePageContent(auth, page.wpId, contentType, html)
        await prisma.page.update({
          where: { id: page.id },
          data: { contentHtml: html },
        })
        updatedParts.push(
          contentType === 'post' ? 'FAQ (post body)' : 'FAQ (page content)',
        )
        result = { ...result, wpPageId: updated.id, editUrl: updated.editUrl, link: updated.link }
      }
    }

    if (updatedParts.length === 0 && !hasSchemaPush) {
      throw new Error('Nothing to publish for this page')
    }

    if (hasSchemaPush && schemaRec) {
      const probe = await probeGroundworkConnector(auth)
      if (!probe.schemaWrite && probe.installed) {
        throw new Error(
          'Update the Groundwork Connector to v1.3+ on WordPress to push FAQ/schema graph pieces into Yoast.',
        )
      }
      if (probe.schemaWrite) {
        const graphJson = stripSchemaScript(schemaRec.suggested)
        await writePageSchemaGraph(auth, page.wpId, contentType, graphJson)
        await prisma.page.update({
          where: { id: page.id },
          data: { liveSchemaJson: graphJson },
        })
        updatedParts.push('schema (Yoast graph)')
      }
    }

    await writeChangeLog({
      siteId,
      page: subjectRef,
      element: 'content_update',
      before: page.metaTitle ?? undefined,
      after: updatedParts.join(', '),
      findingId: item.findingId,
    })

    // Post-push verification: fetch the LIVE page and prove each change rendered.
    const linkVal =
      (result.link as string | undefined) ??
      page.url ??
      (site?.wpBaseUrl ? `${site.wpBaseUrl.replace(/\/+$/, '')}${urlPath(normalizeUrl(subjectRef))}` : null)
    const faqPairsForVerify = faqRec?.suggested ? parseFaqPairs(faqRec.suggested) : []
    const faqQuestions = faqPairsForVerify.map((p) => p.q)
    const faqAnswers = faqPairsForVerify.map((p) => p.a)
    const linksRec = recs.find((r) => r.tab === 'links')
    const verifyAliases = buildPagePathAliasMap(
      await prisma.page.findMany({
        where: { siteId },
        select: { slug: true, url: true, type: true },
      }),
    )
    const linkHrefs =
      linksRec?.suggested && site?.wpBaseUrl
        ? parseLinkSuggestions(linksRec.suggested).map((s) => {
            const base = site.wpBaseUrl!.replace(/\/+$/, '')
            // Resolve bare slugs to canonical permalinks (e.g. /blog/{slug}) so
            // verification checks the SAME URL we actually wrote into the page.
            const resolved = resolveAliasedPath(s.target, verifyAliases)
            return resolved.startsWith('http')
              ? resolved
              : `${base}${resolved.startsWith('/') ? resolved : `/${resolved}`}`
          })
        : []
    const verification = await verifyContentPublish(auth, {
      link: linkVal,
      contentType,
      wpId: page.wpId,
      faqQuestions: faqQuestions.length ? faqQuestions : undefined,
      faqAnswers: faqAnswers.length ? faqAnswers : undefined,
      linkHrefs: linkHrefs.length ? linkHrefs : undefined,
      title: updatedParts.includes('SEO title') ? titleVal : undefined,
      metaDesc: updatedParts.includes('meta description') ? descVal : undefined,
      schemaTypes:
        hasSchemaPush && schemaRec ? collectSchemaTypes(stripSchemaScript(schemaRec.suggested)) : undefined,
    })
    await prisma.reviewItem.update({
      where: { id: itemId },
      data: { verificationJson: JSON.stringify(verification) },
    })
    result = { ...result, verification }
  } else if (kind === 'redirect') {
    const source = String(payload.source ?? finding?.subjectLabel ?? subjectRef)
    const target = String(payload.target ?? '')
    if (!target) throw new Error('Redirect target is required')
    const redirect = await createRedirect(auth, {
      source,
      target,
      status: Number(payload.status ?? 301),
    })
    result = { ...result, redirect, manual: false }
    await writeChangeLog({
      siteId,
      page: source,
      element: 'redirect',
      after: `${source} → ${target}`,
      findingId: item.findingId,
    })
  } else if (kind === 'gbp_post') {
    const draft = String(payload.draft ?? payload.copyText ?? '')
    if (!draft) throw new Error('GBP post draft is empty')
    result = {
      ...result,
      copyReady: true,
      manual: true,
      message: 'Copy this post and paste it into Google Business Profile manually. No GBP API connection yet.',
      draft,
    }
    await writeChangeLog({
      siteId,
      page: 'gbp',
      element: 'gbp_post',
      after: draft.slice(0, 120),
      findingId: item.findingId,
    })
  } else if (kind === 'elementor_page' && payload.wpPageId) {
    result = { ...result, wpPageId: payload.wpPageId, editUrl: payload.editUrl, alreadyDrafted: true }
    await writeChangeLog({
      siteId,
      page: String(payload.link ?? subjectRef),
      element: 'elementor_page',
      after: item.title,
      findingId: item.findingId,
    })
  } else if (kind === 'elementor_section' && payload.elementorId) {
    result = {
      ...result,
      elementorId: payload.elementorId,
      copyReady: true,
      manual: true,
      message: 'Section ready — paste into Elementor',
    }
    await writeChangeLog({
      siteId,
      page: subjectRef,
      element: 'elementor_section',
      after: item.title,
      findingId: item.findingId,
    })
  } else {
    throw new Error(`Publish not implemented for action: ${kind}`)
  }

  await prisma.reviewItem.update({
    where: { id: itemId },
    data: { executedAt: new Date() },
  })
  await markPageWorkComplete(siteId, subjectRef, { findingId: item.findingId })

  return result
}
