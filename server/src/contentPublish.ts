import { prisma } from './db.ts'
import { parseFaqPairs } from './schema.ts'
import { mergeFaqIntoPostContent } from './elementorFaq.ts'
import { lastSegment, normalizeUrl, urlPath } from './url.ts'
import { toGutenbergBlocks } from './wordpress.ts'
import { seoPublishDest, summarizeSeoPlugins } from './seoPlugins.ts'

type Rec = { tab: string; current: string; suggested: string; elementorJson?: string | null }

/** Canonical path for matching pages and recommendations. */
export function canonicalPath(subjectRef: string): string {
  if (!subjectRef.trim()) return '/'
  if (subjectRef.startsWith('http://') || subjectRef.startsWith('https://')) {
    return urlPath(normalizeUrl(subjectRef))
  }
  return subjectRef.split(/[?#\s]/)[0].replace(/\/+$/, '') || '/'
}

export function pathsMatch(a: string, b: string): boolean {
  const pa = canonicalPath(a)
  const pb = canonicalPath(b)
  if (!pa || !pb) return false
  if (pa === pb) return true
  if (pa.endsWith(pb) || pb.endsWith(pa)) return true
  const sa = pa.split('/').filter(Boolean).pop()
  const sb = pb.split('/').filter(Boolean).pop()
  return !!sa && sa === sb
}

/** When a review item is finished, clear matching next-step opportunities and findings. */
export async function markPageWorkComplete(
  siteId: string,
  subjectRef: string,
  opts?: { findingId?: string | null; rejected?: boolean },
): Promise<void> {
  const path = canonicalPath(subjectRef)
  const opps = await prisma.opportunity.findMany({
    where: { siteId, status: { in: ['Open', 'Drafted'] } },
  })
  for (const opp of opps) {
    if (!pathsMatch(opp.page, path)) continue
    await prisma.opportunity.update({
      where: { id: opp.id },
      data: {
        status: opts?.rejected ? 'Dismissed' : 'Done',
        decidedAt: new Date(),
      },
    })
  }

  if (opts?.findingId) {
    await prisma.finding.update({
      where: { id: opts.findingId },
      data: {
        status: opts.rejected ? 'dismissed' : 'done',
        decidedAt: new Date(),
      },
    })
  } else if (!opts?.rejected) {
    const findings = await prisma.finding.findMany({
      where: { siteId, status: { in: ['open', 'drafted', 'in_review'] } },
    })
    for (const f of findings) {
      if (pathsMatch(f.subjectRef, path)) {
        await prisma.finding.update({
          where: { id: f.id },
          data: { status: 'done', decidedAt: new Date() },
        })
      }
    }
  }
}

/** Paths with an approved review item should not reappear in next steps. */
export async function approvedReviewPaths(siteId: string): Promise<Set<string>> {
  const rows = await prisma.reviewItem.findMany({
    where: { siteId, status: 'Approved' },
    select: { detail: true },
  })
  return new Set(rows.map((r) => canonicalPath(r.detail)))
}

/** Assemble approved content recommendations into updated page HTML. */
export function assembleContentFromRecommendations(
  baseHtml: string,
  recs: Rec[],
): { html: string; summary: string[] } {
  let html = baseHtml || ''
  const summary: string[] = []
  const byTab = new Map(recs.map((r) => [r.tab, r]))

  const headings = byTab.get('headings')
  if (headings?.suggested) {
    html = `${headings.suggested}\n${html}`
    summary.push('headings')
  }

  const body = byTab.get('body')
  if (body?.suggested) {
    html = `${body.suggested}\n${html}`
    summary.push('body')
  }

  const faq = byTab.get('faq')
  if (faq?.suggested) {
    const pairs = parseFaqPairs(faq.suggested)
    if (pairs.length) {
      html = mergeFaqIntoPostContent(html, pairs)
    } else {
      html = `${html}\n${faq.suggested}`
    }
    summary.push('faq')
  }

  // Schema is merged into Yoast's graph via Groundwork Connector — not post_content.

  const links = byTab.get('links')
  if (links?.suggested) {
    html = `${html}\n${links.suggested}`
    summary.push('links')
  }

  return { html, summary }
}

/** Build a simple before/after diff payload for Review UI. */
export function buildReviewDiff(
  subjectRef: string,
  recs: Rec[],
  pageMeta: { title: string | null; metaDesc: string | null; contentSnippet: string | null },
): Record<string, unknown> {
  const titleRec = recs.find((r) => r.tab === 'title')
  const metaRec = recs.find((r) => r.tab === 'meta')
  const contentRecs = recs.filter((r) => !['title', 'meta'].includes(r.tab))
  const title =
    titleRec && titleRec.current.trim() !== titleRec.suggested.trim()
      ? { before: titleRec.current || pageMeta.title || '', after: titleRec.suggested }
      : null
  const meta =
    metaRec && metaRec.current.trim() !== metaRec.suggested.trim()
      ? { before: metaRec.current || pageMeta.metaDesc || '', after: metaRec.suggested }
      : null
  return {
    subjectRef,
    title,
    meta,
    content: contentRecs.map((r) => ({
      tab: r.tab,
      before: r.current?.slice(0, 500) ?? '',
      after: r.suggested?.slice(0, 500) ?? '',
      elementorReady: r.tab === 'faq' && !!r.elementorJson?.trim(),
      postContentReady: r.tab === 'faq' && !r.elementorJson?.trim() && !!r.suggested?.trim(),
    })),
  }
}

export async function loadRecommendationsForPath(siteId: string, subjectRef: string): Promise<Rec[]> {
  const rows = await prisma.recommendation.findMany({ where: { siteId } })
  return rows
    .filter((r) => pathsMatch(r.page, subjectRef))
    .map((r) => ({
      tab: r.tab,
      current: r.current,
      suggested: r.suggested,
      elementorJson: r.elementorJson,
    }))
}

/** Persist edited SEO title/meta before approve or publish. */
export async function upsertSeoRecommendations(
  siteId: string,
  subjectRef: string,
  meta: { title?: string; description?: string },
): Promise<void> {
  const page = await loadPageForPath(siteId, subjectRef)
  const path = canonicalPath(subjectRef)
  const existing = await prisma.recommendation.findMany({
    where: { siteId, tab: { in: ['title', 'meta'] } },
  })
  const pageKey =
    existing.find((r) => pathsMatch(r.page, path))?.page ??
    (page?.url ? urlPath(normalizeUrl(page.url)) : path)

  if (meta.title != null) {
    await prisma.recommendation.deleteMany({ where: { siteId, page: pageKey, tab: 'title' } })
    await prisma.recommendation.create({
      data: {
        siteId,
        tab: 'title',
        page: pageKey,
        current: page?.metaTitle ?? page?.title ?? '(none)',
        suggested: meta.title,
        reason: 'Edited in review',
        queries: '[]',
        chars: true,
      },
    })
  }

  if (meta.description != null) {
    await prisma.recommendation.deleteMany({ where: { siteId, page: pageKey, tab: 'meta' } })
    await prisma.recommendation.create({
      data: {
        siteId,
        tab: 'meta',
        page: pageKey,
        current: page?.metaDesc ?? '(none)',
        suggested: meta.description,
        reason: 'Edited in review',
        queries: '[]',
        chars: true,
      },
    })
  }
}

/** Find or create a pending meta_rewrite review item for one page. */
export async function ensureMetaReviewItem(
  siteId: string,
  subjectRef: string,
  opts: { title: string; diff: Record<string, unknown>; findingId?: string | null },
): Promise<string> {
  const path = canonicalPath(subjectRef)
  const wpPlugins = await prisma.siteFact.findMany({ where: { siteId, kind: 'wp_plugin' } })
  const seoSummary = summarizeSeoPlugins(wpPlugins.map((p) => ({ key: p.key, value: p.value })))

  const existing = await prisma.reviewItem.findFirst({
    where: {
      siteId,
      status: 'Pending',
      actionKind: 'meta_rewrite',
      OR: [{ detail: path }, { detail: { contains: path.slice(1) } }],
    },
    orderBy: { createdAt: 'desc' },
  })

  const payloadJson = JSON.stringify({ kind: 'meta_rewrite', path, diff: opts.diff })

  if (existing) {
    await prisma.reviewItem.update({
      where: { id: existing.id },
      data: {
        title: opts.title,
        detail: path,
        payloadJson,
        findingId: opts.findingId ?? existing.findingId,
      },
    })
    return existing.id
  }

  const created = await prisma.reviewItem.create({
    data: {
      siteId,
      title: opts.title,
      detail: path,
      type: 'Metadata',
      risk: 'Low',
      reviewer: 'Unassigned',
      dest: seoPublishDest(seoSummary),
      status: 'Pending',
      actionKind: 'meta_rewrite',
      findingId: opts.findingId ?? null,
      payloadJson,
    },
  })
  return created.id
}

export async function loadPageForPath(siteId: string, subjectRef: string) {
  const path = subjectRef.startsWith('http')
    ? urlPath(normalizeUrl(subjectRef))
    : subjectRef.split(/[?#]/)[0].replace(/\/+$/, '') || '/'

  const pages = await prisma.page.findMany({
    where: { siteId, url: { not: null } },
  })
  const byUrl = pages.find((p) => p.url && urlPath(normalizeUrl(p.url)) === path)
  if (byUrl) return byUrl

  const seg = lastSegment(subjectRef)
  if (!seg) return null

  const inferredType = path.toLowerCase().includes('/blog/') ? 'post' : 'page'
  return (
    (await prisma.page.findFirst({ where: { siteId, slug: seg, type: inferredType } })) ??
    (await prisma.page.findFirst({ where: { siteId, slug: seg } }))
  )
}

export function wrapContentForWp(html: string): string {
  return toGutenbergBlocks(html)
}
