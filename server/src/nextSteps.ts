import { prisma } from './db.ts'
import { FOCUS_LIMIT } from './focus.ts'
import { findingToJson } from './audits/run.ts'
import type { ActionKind } from './audits/types.ts'
import { approvedReviewPaths, canonicalPath, pathsMatch } from './contentPublish.ts'

const EFFORT: Record<string, number> = { Low: 1, Medium: 2, High: 3.2 }

export type NextStep = {
  id: string
  kind: 'finding' | 'opportunity'
  findingId?: string
  opportunityId?: string
  title: string
  context: string
  category: string
  source: string
  effort: string
  impact: string
  estMonthlyClicks: number
  priorityValue: number
  status: string
  action: 'act' | 'review' | 'continue'
  actionLabel: string
}

export type CompletedStep = NextStep & {
  completedAt?: string
  completedLabel: 'Completed' | 'Rejected'
}

function parseExpectedClicks(expected: string): number {
  const m = expected.match(/(\d[\d,]*)/)
  return m ? Number(m[1].replace(/,/g, '')) : 0
}

function opportunityPriority(expected: string, effort: string, confidence: number, score: number | null): number {
  if (score != null && score > 0) return score
  const clicks = parseExpectedClicks(expected)
  return Math.round(((clicks * (confidence / 100)) / (EFFORT[effort] ?? 2)) * 10) / 10
}

function actionLabelForFinding(status: string, actions: { kind: ActionKind; label: string }[]): string {
  if (status === 'drafted' || status === 'in_review') return 'Continue'
  const first = actions[0]
  if (!first) return 'Start'
  if (first.kind === 'meta_rewrite') return 'Fix meta'
  if (first.kind === 'content_update') return 'Update page'
  if (first.kind === 'redirect') return 'Add redirect'
  if (first.kind === 'blog_post' || first.kind === 'elementor_page') return 'Draft content'
  if (first.kind === 'monitor') return 'View'
  return first.label.split(' ').slice(0, 2).join(' ') || 'Start'
}

function pageFromOpportunity(page: string): string {
  return page.split(' ')[0]
}

function opportunityActionLabel(type: string, status: string): string {
  if (status === 'Drafted') return 'Continue'
  if (type === 'Metadata') return 'Fix meta'
  if (type === 'Content') return 'Update page'
  if (type === 'Internal links') return 'Add links'
  if (type === 'Schema') return 'Add schema'
  if (type === 'New page') return 'Draft page'
  return 'Start'
}

function isOpportunityCoveredByFinding(
  opp: { fingerprint: string | null; page: string; type: string },
  findingFingerprints: Set<string>,
  findingPages: Map<string, Set<string>>,
): boolean {
  if (opp.fingerprint && findingFingerprints.has(`metadata:${opp.fingerprint}`)) return true
  const path = pageFromOpportunity(opp.page)
  const cats = findingPages.get(path)
  if (!cats) return false
  const typeToCategory: Record<string, string> = {
    Metadata: 'Metadata',
    Content: 'Content',
    'Internal links': 'Internal links',
    Schema: 'Technical',
    Technical: 'Technical',
    'New page': 'New content',
  }
  const cat = typeToCategory[opp.type] ?? opp.type
  return cats.has(cat)
}

/** Unified, deduped action list from audits + GSC opportunities. */
export async function buildNextSteps(siteId: string, limit?: number): Promise<{ steps: NextStep[]; total: number }> {
  const [findingRows, opportunityRows, completedPaths] = await Promise.all([
    prisma.finding.findMany({
      where: { siteId, status: { in: ['open', 'drafted', 'in_review'] } },
      orderBy: { priorityValue: 'desc' },
    }),
    prisma.opportunity.findMany({
      where: { siteId, status: { in: ['Open', 'Drafted'] } },
    }),
    approvedReviewPaths(siteId),
  ])

  const findingFingerprints = new Set(
    findingRows.map((f) => f.fingerprint).filter((fp): fp is string => !!fp),
  )
  const findingPages = new Map<string, Set<string>>()
  for (const f of findingRows) {
    const set = findingPages.get(f.subjectRef) ?? new Set<string>()
    set.add(f.category)
    findingPages.set(f.subjectRef, set)
  }

  const steps: NextStep[] = []

  for (const row of findingRows) {
    const f = findingToJson(row)
    const actions = f.actions as { kind: ActionKind; label: string }[]
    steps.push({
      id: `finding:${row.id}`,
      kind: 'finding',
      findingId: row.id,
      title: row.title,
      context: row.subjectLabel || row.subjectRef,
      category: row.category,
      source: row.source,
      effort: row.effort,
      impact: row.impact,
      estMonthlyClicks: row.estMonthlyClicks,
      priorityValue: row.priorityValue,
      status: row.status,
      action: row.status === 'drafted' || row.status === 'in_review' ? 'continue' : 'act',
      actionLabel: actionLabelForFinding(row.status, actions),
    })
  }

  for (const opp of opportunityRows) {
    if (isOpportunityCoveredByFinding(opp, findingFingerprints, findingPages)) continue
    if (completedPaths.has(canonicalPath(pageFromOpportunity(opp.page)))) continue
    const priorityValue = opportunityPriority(opp.expected, opp.effort, opp.confidence, opp.score)
    const estMonthlyClicks = parseExpectedClicks(opp.expected)
    steps.push({
      id: `opportunity:${opp.id}`,
      kind: 'opportunity',
      opportunityId: opp.id,
      title: opp.title,
      context: pageFromOpportunity(opp.page),
      category: opp.type,
      source: opp.source,
      effort: opp.effort,
      impact: opp.impact,
      estMonthlyClicks,
      priorityValue,
      status: opp.status,
      action: opp.status === 'Drafted' ? 'continue' : 'act',
      actionLabel: opportunityActionLabel(opp.type, opp.status),
    })
  }

  steps.sort(
    (a, b) =>
      b.priorityValue - a.priorityValue ||
      b.estMonthlyClicks - a.estMonthlyClicks ||
      a.title.localeCompare(b.title),
  )

  // Focus: surface only the top N actionable items. The DB may still hold hundreds
  // of scored findings/opportunities from prior audits; the UI should never show
  // a backlog — only the prepared working set.
  const focused = steps.slice(0, FOCUS_LIMIT)
  const total = focused.length
  const completed = await buildCompletedSteps(siteId)
  return { steps: limit ? focused.slice(0, limit) : focused, completed, total }
}

/** Completed work: only changes verified live on the site (WordPress push or published post). */
async function buildCompletedSteps(siteId: string): Promise<CompletedStep[]> {
  const [executedReviews, rejectedReviews, publishedPosts] = await Promise.all([
    prisma.reviewItem.findMany({
      where: { siteId, executedAt: { not: null } },
      orderBy: { executedAt: 'desc' },
    }),
    prisma.reviewItem.findMany({
      where: { siteId, status: 'Rejected' },
      orderBy: { decidedAt: 'desc' },
    }),
    prisma.blogPost.findMany({
      where: { siteId, status: 'Published', wpPostId: { not: null } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const completed: CompletedStep[] = []
  const coveredBlogIds = new Set<string>()

  for (const row of executedReviews) {
    let opportunityId: string | undefined
    try {
      const payload = JSON.parse(row.payloadJson ?? '{}') as {
        opportunityId?: string
        blogPostId?: string
      }
      opportunityId = payload.opportunityId
      if (payload.blogPostId) coveredBlogIds.add(payload.blogPostId)
    } catch {
      /* ignore */
    }

    completed.push({
      id: `review:${row.id}`,
      kind: opportunityId ? 'opportunity' : 'finding',
      findingId: row.findingId ?? undefined,
      opportunityId,
      title: row.title,
      context: row.dest || row.detail,
      category: row.type,
      source: 'WordPress',
      effort: '—',
      impact: '—',
      estMonthlyClicks: 0,
      priorityValue: 0,
      status: 'Published',
      action: 'review',
      actionLabel: 'Completed',
      completedAt: row.executedAt!.toISOString(),
      completedLabel: 'Completed',
    })
  }

  for (const post of publishedPosts) {
    if (coveredBlogIds.has(post.id)) continue
    completed.push({
      id: `blog:${post.id}`,
      kind: 'opportunity',
      title: post.title,
      context: `/${post.slug}`,
      category: 'New page',
      source: 'WordPress',
      effort: 'High',
      impact: 'Medium',
      estMonthlyClicks: post.estClicks ?? 0,
      priorityValue: 0,
      status: 'Published',
      action: 'act',
      actionLabel: 'Completed',
      completedAt: (post.reviewApprovedAt ?? post.createdAt).toISOString(),
      completedLabel: 'Completed',
    })
  }

  for (const row of rejectedReviews) {
    completed.push({
      id: `review:${row.id}`,
      kind: 'finding',
      findingId: row.findingId ?? undefined,
      title: row.title,
      context: row.dest || row.detail,
      category: row.type,
      source: 'Review',
      effort: '—',
      impact: '—',
      estMonthlyClicks: 0,
      priorityValue: 0,
      status: row.status,
      action: 'review',
      actionLabel: 'Rejected',
      completedAt: row.decidedAt?.toISOString(),
      completedLabel: 'Rejected',
    })
  }

  completed.sort((a, b) => {
    const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0
    const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0
    return tb - ta || a.title.localeCompare(b.title)
  })

  return completed
}
