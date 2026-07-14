import type { Prisma } from '@prisma/client'
import { prisma } from '../db.ts'
import { FOCUS_LIMIT } from '../focus.ts'
import { CONTENT_POLICY, getContentPolicyForSite } from '../contentPolicy.ts'
import { computeDataSufficiency, computeGovernor, type PageLite } from '../contentEngine.ts'
import { AUDIT_REGISTRY } from './registry.ts'
import { rankFindings } from './prioritize.ts'
import type { AuditContext, FindingDraft, RankedFinding, SiteFactLite } from './types.ts'

export type RunAuditsResult = {
  findings: RankedFinding[]
  governor: Awaited<ReturnType<typeof computeGovernor>>
  sufficiency: ReturnType<typeof computeDataSufficiency>
  counts: Record<string, number>
  auditCounts: Record<string, number>
}

function hasRequirement(
  ctx: AuditContext,
  req: string,
): boolean {
  if (req === 'gsc') return ctx.gsc.length > 0
  if (req === 'ga4') return ctx.ga4.length > 0
  if (req === 'pages') return ctx.pages.length > 0
  if (req === 'facts') return ctx.facts.length > 0
  if (req === 'competitors') return ctx.competitors.length > 0
  return true
}

/** Deduplicate: content audit wins over metadata for same page+signal. */
function dedupeFindings(drafts: FindingDraft[]): FindingDraft[] {
  const seen = new Set<string>()
  const out: FindingDraft[] = []
  const order = ['content', 'metadata', 'blog-gap', 'competitor-gap', 'service-architecture', 'internal-linking', 'technical', 'crawl', 'pagespeed', 'indexation', 'local', 'cro', 'eeat']
  const sorted = [...drafts].sort(
    (a, b) => order.indexOf(a.auditId) - order.indexOf(b.auditId) || b.estMonthlyClicks - a.estMonthlyClicks,
  )
  for (const f of sorted) {
    const key = `${f.subjectRef}:${f.category}`
    if (f.auditId === 'metadata' && seen.has(key)) continue
    if (!seen.has(f.fingerprint)) {
      seen.add(f.fingerprint)
      seen.add(key)
      out.push(f)
    }
  }
  return out
}

export async function buildAuditContext(siteId: string): Promise<AuditContext> {
  const [gscRows, ga4Rows, pageRows, factRows, compRows] = await Promise.all([
    prisma.gscRow.findMany({ where: { siteId } }),
    prisma.ga4Row.findMany({ where: { siteId } }),
    prisma.page.findMany({ where: { siteId } }),
    prisma.siteFact.findMany({ where: { siteId } }),
    prisma.competitorScan.findMany({ where: { siteId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ])
  const pages: PageLite[] = pageRows.map((p) => ({
    slug: p.slug,
    title: p.title,
    type: p.type,
    contentHtml: p.contentHtml,
    url: p.url,
    wpId: p.wpId,
  }))
  const facts: SiteFactLite[] = factRows.map((f) => ({ kind: f.kind, key: f.key, value: f.value }))
  const competitors = compRows.map((c) => ({
    targetKeyword: c.targetKeyword,
    ourPath: c.ourPath,
    findings: c.findings,
  }))
  return {
    siteId,
    pages,
    gsc: gscRows,
    ga4: ga4Rows.map((r) => ({
      date: r.date,
      landingPage: r.landingPage,
      conversions: r.conversions,
      sessions: r.sessions,
    })),
    competitors,
    facts,
    policy: CONTENT_POLICY,
  }
}

export async function runSiteAudits(siteId: string): Promise<RunAuditsResult & { persist: { added: number; updated: number; resolved: number } }> {
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  const policy = site ? getContentPolicyForSite(site.domain) : CONTENT_POLICY
  const ctx = await buildAuditContext(siteId)
  ctx.policy = policy
  const [gscQueryRows, postsLast30d] = await Promise.all([
    prisma.gscRow.findMany({ where: { siteId, query: { not: null } } }),
    prisma.blogPost.count({
      where: { siteId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
  ])
  let maxTs = 0
  for (const r of gscQueryRows) if (r.date.getTime() > maxTs) maxTs = r.date.getTime()
  const curStart = new Date(maxTs - (policy.windowDays - 1) * 24 * 60 * 60 * 1000)
  const byQuery = new Map<string, { impr: number; posw: number }>()
  for (const r of gscQueryRows) {
    if (r.date < curStart) continue
    const a = byQuery.get(r.query!) ?? { impr: 0, posw: 0 }
    a.impr += r.impressions
    a.posw += r.position * r.impressions
    byQuery.set(r.query!, a)
  }
  const queries: { query: string; impressions: number; position: number }[] = [...byQuery.entries()].map(([query, a]) => ({
    query,
    impressions: a.impr,
    position: a.impr > 0 ? a.posw / a.impr : 0,
  }))
  const governor = computeGovernor(queries, ctx.pages, postsLast30d, policy)

  const result = runAllAudits(ctx, { blockNewPosts: !governor.allowNewPosts })
  result.governor = governor
  const persist = await persistFindings(siteId, result.findings)
  return { ...result, persist }
}

export function runAllAudits(ctx: AuditContext, options?: { blockNewPosts?: boolean }): RunAuditsResult {
  const drafts: FindingDraft[] = []
  const auditCounts: Record<string, number> = {}
  for (const audit of AUDIT_REGISTRY) {
    if (!audit.requires.every((r) => hasRequirement(ctx, r))) {
      auditCounts[audit.id] = 0
      continue
    }
    const found = audit.run(ctx)
    auditCounts[audit.id] = found.length
    drafts.push(...found)
  }
  let merged = dedupeFindings(drafts)
  if (options?.blockNewPosts) {
    merged = merged.filter((f) => f.auditId !== 'blog-gap')
  }
  const ranked = rankFindings(merged, ctx.policy)
  const counts: Record<string, number> = {}
  for (const f of ranked) counts[f.category] = (counts[f.category] ?? 0) + 1
  const sufficiency = computeDataSufficiency(ctx.gsc, ctx.ga4, ctx.pages, ctx.policy)
  return {
    findings: ranked,
    governor: { coveragePct: 0, universeSize: 0, coveredCount: 0, saturated: false, postsLast30d: 0, velocityExceeded: false, allowNewPosts: true, reason: null },
    sufficiency,
    counts,
    auditCounts,
  }
}

export async function persistFindings(siteId: string, ranked: RankedFinding[]): Promise<{ added: number; updated: number; resolved: number }> {
  // Focus: only keep the top N findings as the active working set.
  const focused = ranked
    .slice()
    .sort((a, b) => b.priorityValue - a.priorityValue || b.estMonthlyClicks - a.estMonthlyClicks)
    .slice(0, FOCUS_LIMIT)
  const focusedFps = new Set(focused.map((f) => f.fingerprint))

  const existing = await prisma.finding.findMany({ where: { siteId } })
  const byFp = new Map(existing.filter((e) => e.fingerprint).map((e) => [e.fingerprint!, e]))
  const ops: Prisma.PrismaPromise<unknown>[] = []
  let added = 0
  let updated = 0
  for (const f of focused) {
    const data = {
      auditId: f.auditId,
      category: f.category,
      subjectType: f.subjectType,
      subjectRef: f.subjectRef,
      subjectLabel: f.subjectLabel,
      title: f.title,
      evidenceJson: JSON.stringify(f.evidence),
      estMonthlyClicks: f.estMonthlyClicks,
      estBookingValue: f.estBookingValue,
      confidence: f.confidence,
      effort: f.effort,
      actionsJson: JSON.stringify(f.actions),
      priorityValue: f.priorityValue,
      reviewAfter: f.reviewAfter,
      fingerprint: f.fingerprint,
      impact: f.impact,
      source: f.source,
    }
    const prior = byFp.get(f.fingerprint)
    if (prior) {
      updated++
      ops.push(
        prisma.finding.update({
          where: { id: prior.id },
          data: { ...data, status: prior.status === 'done' || prior.status === 'dismissed' ? prior.status : 'open' },
        }),
      )
    } else {
      added++
      ops.push(prisma.finding.create({ data: { ...data, siteId, status: 'open' } }))
    }
  }
  let resolved = 0
  for (const e of existing) {
    if (e.fingerprint && !focusedFps.has(e.fingerprint) && e.status === 'open') {
      ops.push(prisma.finding.update({ where: { id: e.id }, data: { status: 'dismissed', decidedAt: new Date() } }))
      resolved++
    }
  }
  if (ops.length) await prisma.$transaction(ops)
  return { added, updated, resolved }
}

export function findingToJson(f: {
  id: string
  auditId: string
  category: string
  subjectType: string
  subjectRef: string
  subjectLabel: string
  title: string
  evidenceJson: string
  estMonthlyClicks: number
  estBookingValue: number | null
  confidence: number
  effort: string
  actionsJson: string
  priorityValue: number
  status: string
  reviewAfter: string | null
  fingerprint: string | null
  impact: string
  source: string
}) {
  return {
    id: f.id,
    auditId: f.auditId,
    category: f.category,
    subject: { type: f.subjectType, ref: f.subjectRef, label: f.subjectLabel },
    title: f.title,
    evidence: JSON.parse(f.evidenceJson),
    estMonthlyClicks: f.estMonthlyClicks,
    estBookingValue: f.estBookingValue,
    confidence: f.confidence,
    effort: f.effort,
    actions: JSON.parse(f.actionsJson),
    priorityValue: f.priorityValue,
    status: f.status,
    reviewAfter: f.reviewAfter,
    fingerprint: f.fingerprint,
    impact: f.impact,
    source: f.source,
  }
}
