/**
 * Groundwork API — Fastify server over the local SQLite store.
 *
 * Phase 0 exposes read endpoints that return the exact shapes the frontend views
 * already consume, so the UI can be pointed at real data with no visual change.
 * Later phases add the integration/sync/generation write routes.
 */
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Prisma, prisma } from './db.ts'
import { decrypt, encrypt } from './crypto.ts'
import {
  createWpDraftPost,
  createWpDraftPage,
  captureSiteFacts,
  fetchPageLiveSchema,
  fetchWpContent,
  normalizeBaseUrl,
  probeGroundworkConnector,
  testWpConnection,
  uploadWpMedia,
} from './wordpress.ts'
import { hasPexelsKey, searchPexels } from './pexels.ts'
import {
  defaultGa4Range,
  defaultGscPageRange,
  defaultGscQueryRange,
  exchangeGoogleCode,
  fetchGa4Data,
  fetchGscData,
  getGoogleAuthUrl,
  listGa4Properties,
  listGscSites,
} from './google.ts'
import { benchmarkCtr, pagePath, runScoring } from './scoring.ts'
import {
  computeDataSufficiency,
  computeGovernor,
  evaluateSite,
  reconcile,
  validateConsolidateTargets,
  type QueryAggLite,
  type PageLite,
} from './contentEngine.ts'
import { CONTENT_POLICY, getContentPolicyForSite, resolveContentPolicy } from './contentPolicy.ts'
import { loadAuthorContext } from './medicalCopyStandards.ts'
import { authGuard, createUser, getSessionUser, loginUser, parseAuthToken } from './auth.ts'
import { startSyncScheduler } from './scheduler.ts'
import { buildClientReport } from './reports.ts'
import { capturePagespeedFacts } from './pagespeed.ts'
import { captureIndexationFacts } from './indexation.ts'
import { buildPagePathAliasMap, normalizeUrl, pageDisplayPath, urlPath, urlsEqual } from './url.ts'
import {
  buildLinkEvidenceReason,
  mergeLinkSuggestionsWithTargets,
  rankLinkCandidates,
  selectLinkTargets,
} from './linkCandidates.ts'
import { countWords, maxContextualLinksForWordCount } from './linkingStandards.ts'
import { collectTextEditors, parseElementorRoot, resolveLinkSuggestionsText } from './elementorPatch.ts'
import {
  buildFaqElementorSection,
  detectExistingFaqCopy,
  detectExistingFaqInHtml,
  faqUsesElementorSection,
  serializeFaqSectionForStorage,
} from './elementorFaq.ts'
import {
  analyzeCompetitors,
  generateBlogPost,
  generateContentUpdate,
  generateElementorSection,
  generateMetaRewrite,
  type CompetitorPage,
  type ContentGenInput,
  type ContentUpdateType,
  type GscQuerySample,
} from './anthropic.ts'
import { runSiteAudits, findingToJson } from './audits/run.ts'
import { actionReviewMeta } from './audits/actions.ts'
import type { ActionKind } from './audits/types.ts'
import {
  buildFaqPageSchema,
  formatLiveSchemaDisplay,
  formatSchemaTypeSummary,
  parseFaqPairs,
  planSchemaDelta,
  resolvePageSchema,
  collectSchemaTypes,
} from './schema.ts'
import {
  buildReviewDiff,
  canonicalPath,
  ensureMetaReviewItem,
  loadPageForPath,
  loadRecommendationsForPath,
  markPageWorkComplete,
  pathsMatch,
  upsertSeoRecommendations,
} from './contentPublish.ts'
import { measureChangeLogVerdicts, writeChangeLog } from './measure.ts'
import { executeApprovedReviewItem } from './publishExecute.ts'
import { buildPublishReadiness, type PublishReadiness } from './publishReadiness.ts'
import { buildNextSteps } from './nextSteps.ts'
import { FOCUS_LIMIT } from './focus.ts'
import { seoPublishDest, summarizeSeoPlugins } from './seoPlugins.ts'
import { actionTier } from './publishPolicy.ts'

function collectSchemaTypesForGen(live: string | null): string[] {
  return collectSchemaTypes(live)
}

function faqElementorJsonForPage(
  pairs: { q: string; a: string }[],
  page: { type: string; elementorData: string | null; title: string | null } | null,
): string | null {
  if (!page || !faqUsesElementorSection(page) || pairs.length === 0) return null
  const section = buildFaqElementorSection(pairs, {
    styleReference: page.elementorData,
    sectionTitle: 'Frequently Asked Questions',
  })
  return serializeFaqSectionForStorage(section)
}

function faqCurrentFromPage(
  page: { type: string; elementorData: string | null; contentHtml: string | null } | null,
): string {
  if (!page) return '(no FAQ section)'
  if (page.elementorData) {
    try {
      const parsed = parseElementorRoot(page.elementorData)
      const copy = detectExistingFaqCopy(parsed.root)
      if (copy) return copy
    } catch {
      /* fall through */
    }
  }
  const inHtml = detectExistingFaqInHtml(page.contentHtml)
  if (inHtml) return inHtml
  return '(no FAQ section on page yet)'
}

function faqReasonSuffix(
  page: { type: string; elementorData: string | null } | null,
  elementorJson: string | null,
  pairs: { q: string; a: string }[],
): string {
  if (!pairs.length) return ''
  if (elementorJson) {
    return ' Elementor section JSON is ready to push into the page builder (inserted before the final consultation CTA).'
  }
  return ' FAQ pushes into page content as HTML, placed before the final consultation CTA.'
}

/** Map a Prisma Page row to the engine's PageLite shape. */
function toPageLite(p: {
  slug: string
  title: string | null
  type: string
  contentHtml: string | null
  url: string | null
  wpId: number | null
  unresolved: boolean
}): PageLite {
  return {
    slug: p.slug,
    title: p.title,
    type: p.type,
    contentHtml: p.contentHtml,
    url: p.unresolved || !p.url ? null : p.url,
    wpId: p.wpId,
  }
}

const PAGE_LITE_SELECT = {
  slug: true,
  title: true,
  type: true,
  contentHtml: true,
  url: true,
  wpId: true,
  unresolved: true,
} as const

/** Find a page by canonical url or legacy path string. */
async function findPageByPath(siteId: string, pathOrUrl: string) {
  const key = normalizeUrl(pathOrUrl)
  const pages = await prisma.page.findMany({ where: { siteId }, select: { ...PAGE_LITE_SELECT, id: true, metaTitle: true, metaDesc: true, elementorData: true, liveSchemaJson: true } })
  return pages.find((p) => p.url && urlsEqual(p.url, key)) ?? null
}

/**
 * Phase 3: recompute this site's opportunities from its cached GSC/GA4/page data
 * and persist them. Called after every GSC/GA4 sync (and exposed as its own
 * route) so the ranked opportunity list always reflects the latest pull.
 *
 * The Overview dashboard (metrics/trend/score/ready/recent/query-opps) is NOT
 * precomputed here — it's derived on demand in `computeDashboard()` so it can
 * respond to the selected date range and always reflect live review state.
 */
/**
 * Stateful re-audit: merge the freshly computed opportunities into the existing
 * checklist by fingerprint. Existing items keep their id + status + progress;
 * genuinely new issues are inserted as Open; Open items that no longer appear in
 * the data (the issue resolved itself) are dropped. Items the user has acted on
 * (Drafted/Done/Dismissed) are always preserved as history, even if they vanish.
 */
const OPP_EFFORT_WEIGHT: Record<string, number> = { Low: 1, Medium: 2, High: 3.2 }
function expectedClicksFrom(s: string): number {
  const m = s.match(/(\d[\d,]*)/)
  return m ? Number(m[1].replace(/,/g, '')) : 0
}
// Quick-wins-first ranking, mirroring the client's oppPriority so the focus set
// matches the order the UI shows: expected monthly clicks discounted by effort.
function oppRank(o: { expected: string; effort: string }): number {
  return expectedClicksFrom(o.expected) / (OPP_EFFORT_WEIGHT[o.effort] ?? 2)
}

async function regenerateForSite(siteId: string): Promise<{ total: number; added: number; resolved: number }> {
  const policy = await resolveContentPolicy(siteId)
  const [gscRows, ga4Rows, pageRows] = await Promise.all([
    prisma.gscRow.findMany({ where: { siteId } }),
    prisma.ga4Row.findMany({ where: { siteId } }),
    prisma.page.findMany({ where: { siteId }, select: PAGE_LITE_SELECT }),
  ])
  const pages = pageRows.map(toPageLite)
  let computed = runScoring(gscRows, ga4Rows, pages).opportunities

  const authoritative = await validateConsolidateTargets(evaluateSite(gscRows, ga4Rows, pages, policy))
  const reconciliation = reconcile(authoritative, pages)
  if (!reconciliation.balanced) {
    app.log.warn({ siteId, reconciliation }, 'Content Engine reconciliation FAILED after audit')
  }
  const overruled = new Set(
    authoritative
      .filter((r) => r.action === 'prune' || r.action === 'consolidate' || r.action === 'leave_alone' || r.action === 'insufficient_data')
      .map((r) => r.path),
  )
  computed = computed.filter((o) => !overruled.has(o.page.split(' ')[0]))

  // Focus: keep only the top-ranked opportunities. Everything below the cut is
  // not surfaced as an actionable item — the app pours its energy into a small
  // set the user can fully act on, instead of a backlog of hundreds. Work the
  // user has already started (Drafted/Done/Dismissed) is preserved below even
  // if it falls outside this cut, so nothing in-progress is lost.
  computed = computed
    .slice()
    .sort((a, b) => oppRank(b) - oppRank(a) || b.score - a.score || a.fingerprint.localeCompare(b.fingerprint))
    .slice(0, FOCUS_LIMIT)

  const existing = await prisma.opportunity.findMany({ where: { siteId } })
  const existingByFp = new Map(existing.filter((e) => e.fingerprint).map((e) => [e.fingerprint!, e]))
  const computedFps = new Set(computed.map((c) => c.fingerprint))

  const ops: Prisma.PrismaPromise<unknown>[] = []
  let added = 0
  for (const c of computed) {
    const prior = existingByFp.get(c.fingerprint)
    if (prior) {
      // Refresh the data fields; keep id, status, decidedAt untouched.
      ops.push(
        prisma.opportunity.update({
          where: { id: prior.id },
          data: {
            title: c.title,
            page: c.page,
            why: c.why,
            expected: c.expected,
            impact: c.impact,
            confidence: c.confidence,
            effort: c.effort,
            source: c.source,
            type: c.type,
            score: c.score,
          },
        }),
      )
    } else {
      added++
      ops.push(prisma.opportunity.create({ data: { ...c, siteId } }))
    }
  }
  // Drop Open items that no longer surface in the data — but never delete work
  // the user has already acted on. Exception: Open/Drafted items the refresh
  // queue overrules (prune / consolidate / leave-alone / insufficient-data)
  // must go too — an active checklist row may never contradict the
  // authoritative engine. Done/Dismissed rows are resolved history and stay.
  let resolved = 0
  for (const e of existing) {
    const gone = !e.fingerprint || !computedFps.has(e.fingerprint)
    const overruledNow = overruled.has(e.page.split(' ')[0]) && (e.status === 'Open' || e.status === 'Drafted')
    if ((gone && e.status === 'Open') || overruledNow) {
      ops.push(prisma.opportunity.delete({ where: { id: e.id } }))
      resolved++
    }
  }

  await prisma.$transaction(ops)
  // Unified audit spine: run all audits and persist Findings.
  const auditRun = await runSiteAudits(siteId).catch((err) => {
    app.log.error({ err, siteId }, 'Unified audit run failed')
    return null
  })
  return {
    total: computed.length,
    added,
    resolved,
    findingsAdded: auditRun?.persist.added ?? 0,
    findingsUpdated: auditRun?.persist.updated ?? 0,
  }
}

/** Run an async fn over items with bounded concurrency (keeps Claude calls sane). */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!)
  })
  await Promise.all(workers)
}

// The Overview date range dropdown maps to these window lengths (in days).
const RANGE_DAYS: Record<string, number> = { '28': 28, '90': 90, '365': 365 }

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtShortDate(d: Date | null): string {
  if (!d) return ''
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/**
 * Everything the Overview renders, computed live for the requested window:
 *   - metrics / losing pages / score / trend  → real GSC/GA4 for `periodDays`
 *   - readyItems      → this site's pending review items
 *   - recentPublished → this site's approved (published) items, newest first
 *   - compGaps        → real striking-distance queries (query opportunities)
 */
async function computeDashboard(siteId: string, periodDays: number) {
  const [gscRows, ga4Rows, pages, reviews, recentScans] = await Promise.all([
    prisma.gscRow.findMany({ where: { siteId } }),
    prisma.ga4Row.findMany({ where: { siteId } }),
    prisma.page.findMany({ where: { siteId }, select: { slug: true, title: true } }),
    prisma.reviewItem.findMany({ where: { siteId } }),
    prisma.competitorScan.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      take: 20, // deduped to the latest scan per keyword below, then top 4
    }),
  ])
  const result = runScoring(gscRows, ga4Rows, pages, { periodDays })

  const readyItems = reviews
    .filter((r) => r.status === 'Pending')
    .map((r) => ({ label: r.title, kind: r.type }))
    .slice(0, 5)

  const recentPublished = reviews
    .filter((r) => r.executedAt != null)
    .sort((a, b) => (b.executedAt?.getTime() ?? 0) - (a.executedAt?.getTime() ?? 0))
    .slice(0, 4)
    .map((r) => ({
      label: r.title,
      meta: `${r.type} · pushed ${fmtShortDate(r.executedAt)}`,
      status: 'Completed',
      good: true,
    }))

  // The Overview "Competitor gaps" card: an index of the most recent competitor
  // analyses (run from the Competitors tab) — one row per report, with severity
  // counts and the single most urgent gap as the scent of what's inside.
  // Keywords get re-analyzed over time, so keep only the latest scan per
  // keyword (rows arrive newest-first); older runs stay in the Competitors tab.
  const seenKeywords = new Set<string>()
  const latestPerKeyword = recentScans.filter((scan) => {
    const key = scan.targetKeyword.trim().toLowerCase()
    if (seenKeywords.has(key)) return false
    seenKeywords.add(key)
    return true
  })
  const rank: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
  const competitorScans = latestPerKeyword.flatMap((scan) => {
    try {
      const findings = JSON.parse(scan.findings) as {
        gaps?: { title: string; priority: string }[]
      }
      const gaps = (findings.gaps ?? [])
        .slice()
        .sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3))
      return [
        {
          id: scan.id,
          keyword: scan.targetKeyword,
          when: fmtShortDate(scan.createdAt),
          highCount: gaps.filter((g) => g.priority === 'High').length,
          mediumCount: gaps.filter((g) => g.priority === 'Medium').length,
          gapCount: gaps.length,
          topGap: gaps[0]?.title ?? null,
        },
      ]
    } catch {
      return [] // unparseable findings — skip the row rather than crash the card
    }
  }).slice(0, 4)

  return {
    metrics: result.metrics,
    losingPages: result.losingPages,
    scoreParts: result.scoreParts,
    seoScore: result.seoScore,
    trend: result.trend,
    trendSeries: result.trendSeries,
    readyItems,
    recentPublished,
    competitorScans,
    periodDays,
    hasPriorPeriod: result.hasPriorPeriod,
  }
}

// .env.local holds secrets (ENCRYPTION_KEY) and is gitignored; .env holds
// non-secret dev config. Keys don't overlap between the two files, so load
// order doesn't matter. Silently skip if either file is absent.
for (const file of ['../.env', '../.env.local']) {
  try {
    process.loadEnvFile(new URL(file, import.meta.url))
  } catch {
    // missing file is fine — tsx already loads .env by default
  }
}

// 12 MB body limit so manually-uploaded featured images (base64 data URLs) fit.
const app = Fastify({ logger: true, bodyLimit: 12 * 1024 * 1024 })
await app.register(cors, { origin: true, credentials: true })

app.addHook('onRequest', async (req, reply) => {
  const path = req.url.split('?')[0] ?? ''
  if (!path.startsWith('/api/')) return
  if (path === '/api/health') return
  if (path.startsWith('/api/auth/')) return
  await authGuard(req, reply)
})

/**
 * Data-layer content gates (SQLite triggers, idempotent):
 *  - YMYL: med spa content cannot reach Published without a named, credentialed
 *    reviewer and an approval timestamp — even if some future code path forgets
 *    the API-level check.
 *  - Lastmod integrity: contentUpdatedAt only advances when the same write marks
 *    the change substantive; cosmetic edits can never move the date.
 */
async function ensureDataGates() {
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS ymyl_publish_gate_update
    BEFORE UPDATE ON BlogPost
    WHEN NEW.status = 'Published'
      AND (NEW.reviewerName IS NULL OR TRIM(NEW.reviewerName) = ''
        OR NEW.reviewerCredentials IS NULL OR TRIM(NEW.reviewerCredentials) = ''
        OR NEW.reviewApprovedAt IS NULL)
    BEGIN
      SELECT RAISE(ABORT, 'YMYL_GATE: a named, credentialed reviewer approval is required before publish');
    END;
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS ymyl_publish_gate_insert
    BEFORE INSERT ON BlogPost
    WHEN NEW.status = 'Published'
      AND (NEW.reviewerName IS NULL OR TRIM(NEW.reviewerName) = ''
        OR NEW.reviewerCredentials IS NULL OR TRIM(NEW.reviewerCredentials) = ''
        OR NEW.reviewApprovedAt IS NULL)
    BEGIN
      SELECT RAISE(ABORT, 'YMYL_GATE: a named, credentialed reviewer approval is required before publish');
    END;
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS lastmod_integrity_gate
    BEFORE UPDATE ON BlogPost
    WHEN (NEW.contentUpdatedAt IS NOT OLD.contentUpdatedAt) AND NEW.isSubstantive = 0
    BEGIN
      SELECT RAISE(ABORT, 'LASTMOD_GATE: contentUpdatedAt may only advance on a substantive change');
    END;
  `)
}
await ensureDataGates()

// Resolve a site by id, or fall back to the first site (single-site v1 default).
async function resolveSite(id?: string) {
  if (id) return prisma.site.findUnique({ where: { id } })
  return prisma.site.findFirst({ orderBy: { createdAt: 'asc' } })
}

app.get('/api/health', async () => ({ ok: true }))

app.get('/api/sites', async () => {
  const rows = await prisma.site.findMany({ orderBy: { createdAt: 'asc' } })
  // The UI's Site type is { name, domain }; return the id + last sync time too.
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    lastSyncedAt: s.lastSyncedAt,
  }))
})

app.post('/api/sites', async (req, reply) => {
  const { name, domain } = req.body as { name?: string; domain?: string }
  if (!name?.trim() || !domain?.trim()) {
    return reply.code(400).send({ error: 'name and domain are required' })
  }
  const normalized = domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  try {
    const site = await prisma.site.create({
      data: { name: name.trim(), domain: normalized },
    })
    await prisma.siteSettings.create({ data: { siteId: site.id } })
    return { id: site.id, name: site.name, domain: site.domain, lastSyncedAt: null }
  } catch {
    return reply.code(409).send({ error: 'A site with that domain already exists' })
  }
})

app.patch('/api/sites/:siteId', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const { name, domain } = req.body as { name?: string; domain?: string }
  const data: { name?: string; domain?: string } = {}
  if (name?.trim()) data.name = name.trim()
  if (domain?.trim()) data.domain = domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (!Object.keys(data).length) return reply.code(400).send({ error: 'Nothing to update' })
  try {
    const site = await prisma.site.update({ where: { id: siteId }, data })
    return { id: site.id, name: site.name, domain: site.domain, lastSyncedAt: site.lastSyncedAt }
  } catch {
    return reply.code(404).send({ error: 'Site not found' })
  }
})

app.delete('/api/sites/:siteId', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const count = await prisma.site.count()
  if (count <= 1) return reply.code(400).send({ error: 'Cannot delete the only site' })
  try {
    await prisma.site.delete({ where: { id: siteId } })
    return { deleted: true }
  } catch {
    return reply.code(404).send({ error: 'Site not found' })
  }
})

app.get('/api/sites/:siteId/settings', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const settings = await prisma.siteSettings.findUnique({ where: { siteId } })
  const policy = await resolveContentPolicy(siteId)
  return {
    maxNewPostsPerMonth: settings?.maxNewPostsPerMonth ?? policy.maxNewPostsPerMonth,
    localModifiers: policy.localModifiers,
    reviewerRoster: settings?.reviewerRosterJson ? JSON.parse(settings.reviewerRosterJson) : [],
  }
})

app.post('/api/sites/:siteId/settings', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const body = req.body as {
    maxNewPostsPerMonth?: number
    localModifiers?: string[]
    reviewerRoster?: string[]
  }
  await prisma.siteSettings.upsert({
    where: { siteId },
    create: {
      siteId,
      maxNewPostsPerMonth: body.maxNewPostsPerMonth ?? null,
      localModifiersJson: body.localModifiers ? JSON.stringify(body.localModifiers) : null,
      reviewerRosterJson: body.reviewerRoster ? JSON.stringify(body.reviewerRoster) : null,
    },
    update: {
      ...(body.maxNewPostsPerMonth != null ? { maxNewPostsPerMonth: body.maxNewPostsPerMonth } : {}),
      ...(body.localModifiers ? { localModifiersJson: JSON.stringify(body.localModifiers) } : {}),
      ...(body.reviewerRoster ? { reviewerRosterJson: JSON.stringify(body.reviewerRoster) } : {}),
    },
  })
  return { saved: true }
})

app.post('/api/auth/register', async (req, reply) => {
  const { email, name, password, role } = req.body as {
    email?: string
    name?: string
    password?: string
    role?: string
  }
  if (!email?.trim() || !name?.trim() || !password) {
    return reply.code(400).send({ error: 'email, name, and password are required' })
  }
  const existing = await prisma.user.count()
  const allowedRole = existing === 0 ? 'admin' : (role ?? 'strategist')
  if (existing > 0 && role === 'admin' && process.env.GROUNDWORK_REQUIRE_AUTH !== '1') {
    /* first user is admin; later registrations default to strategist */
  }
  try {
    const user = await createUser(email, name, password, allowedRole)
    const login = await loginUser(email, password)
    return { user: login?.user, token: login?.token }
  } catch {
    return reply.code(409).send({ error: 'Email already registered' })
  }
})

app.post('/api/auth/login', async (req, reply) => {
  const { email, password } = req.body as { email?: string; password?: string }
  if (!email || !password) return reply.code(400).send({ error: 'email and password required' })
  const result = await loginUser(email, password)
  if (!result) return reply.code(401).send({ error: 'Invalid email or password' })
  return result
})

app.get('/api/auth/me', async (req, reply) => {
  const user = await getSessionUser(parseAuthToken(req))
  if (!user) return reply.code(401).send({ error: 'Not authenticated' })
  return { id: user.id, email: user.email, name: user.name, role: user.role }
})

app.post('/api/auth/logout', async (req) => {
  const token = parseAuthToken(req)
  if (token) await prisma.session.deleteMany({ where: { token } })
  return { ok: true }
})

app.get('/api/sites/:siteId/opportunities', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const rows = await prisma.opportunity.findMany({
    where: { siteId },
    // Highest computed score first (nulls — manual/legacy rows — sort last in SQLite).
    orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
  })
  // Return the Opportunity shape data.ts declares (drop server-only columns).
  return rows.map((o) => ({
    id: o.id,
    title: o.title,
    page: o.page,
    why: o.why,
    expected: o.expected,
    impact: o.impact,
    confidence: o.confidence,
    effort: o.effort,
    source: o.source,
    type: o.type,
    status: o.status, // persisted checklist status: Open | Drafted | Done | Dismissed
  }))
})

app.get('/api/sites/:siteId/recommendations', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const [rows, pages] = await Promise.all([
    prisma.recommendation.findMany({ where: { siteId }, orderBy: { createdAt: 'asc' } }),
    prisma.page.findMany({ where: { siteId }, select: { slug: true, type: true, url: true } }),
  ])
  const pathAliases = buildPagePathAliasMap(pages)
  // Map each recommendation's page path to its WordPress content type so the UI
  // can filter Content updates by page vs post.
  const typeBySlug = new Map(pages.map((p) => [p.slug, p.type]))
  // Regroup into the editorData shape: Record<tab, EditorItem[]>.
  const byTab: Record<string, unknown[]> = {}
  for (const r of rows) {
    ;(byTab[r.tab] ??= []).push({
      id: r.id,
      page: r.page,
      type: typeBySlug.get(lastSegment(r.page)) ?? 'page',
      current: r.current,
      suggested:
        r.tab === 'links' ? resolveLinkSuggestionsText(r.suggested, pathAliases) : r.suggested,
      elementorJson: r.elementorJson ?? null,
      reason: r.reason,
      queries: JSON.parse(r.queries),
      chars: r.chars,
    })
  }
  return byTab
})

app.get('/api/sites/:siteId/elementor', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const rows = await prisma.elementorSection.findMany({
    where: { siteId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    ok: s.ok,
    useCase: s.useCase,
    placement: s.placement,
    notes: s.notes,
    rationale: s.rationale,
    size: s.size,
    json: s.json,
  }))
})

app.get('/api/sites/:siteId/review', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const rows = await prisma.reviewItem.findMany({
    where: { siteId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((r) => {
    let diff: Record<string, unknown> | null = null
    if (r.payloadJson) {
      try {
        const p = JSON.parse(r.payloadJson) as Record<string, unknown>
        if (p.diff) diff = p.diff as Record<string, unknown>
      } catch {
        /* skip */
      }
    }
    return {
    id: r.id,
    title: r.title,
    detail: r.detail,
    type: r.type,
    risk: r.risk,
    reviewer: r.reviewer,
    dest: r.dest,
    actionKind: r.actionKind,
    findingId: r.findingId,
    executedAt: r.executedAt?.toISOString() ?? null,
    publishTier: r.actionKind ? actionTier(r.actionKind) : null,
    diff,
    verification: r.verificationJson ? JSON.parse(r.verificationJson) : null,
    // status is persisted; the client can treat it as the preset/initial value.
    preset: r.status === 'Pending' ? undefined : r.status,
  }
  })
})

// Persist an approve/reject decision on a review item. Stamps decidedAt so the
// Overview "Recently published" card can order by when work was approved.
app.post('/api/sites/:siteId/review/:itemId/status', async (req, reply) => {
  const { siteId, itemId } = req.params as { siteId: string; itemId: string }
  const { status } = req.body as { status?: string }
  if (status !== 'Approved' && status !== 'Rejected' && status !== 'Pending') {
    return reply.code(400).send({ error: 'status must be Approved, Rejected, or Pending' })
  }
  const item = await prisma.reviewItem.findUnique({ where: { id: itemId } })
  if (!item || item.siteId !== siteId) return reply.code(404).send({ error: 'Review item not found' })
  const user = (req as { user?: { id: string } }).user
  await prisma.reviewItem.update({
    where: { id: itemId },
    data: {
      status,
      decidedAt: status === 'Pending' ? null : new Date(),
      decidedById: status === 'Pending' ? null : (user?.id ?? null),
    },
  })
  if (status === 'Approved') {
    await markPageWorkComplete(siteId, item.detail, { findingId: item.findingId })
  } else if (status === 'Rejected') {
    await markPageWorkComplete(siteId, item.detail, { findingId: item.findingId, rejected: true })
  }
  return { id: itemId, status }
})

/** Push an approved review item to WordPress (draft by default). Separate from Approve. */
app.post('/api/sites/:siteId/review/:itemId/publish', async (req, reply) => {
  const { siteId, itemId } = req.params as { siteId: string; itemId: string }
  const body = (req.body ?? {}) as { title?: string; description?: string }
  try {
    const result = await executeApprovedReviewItem(siteId, itemId, body)
    return result
  } catch (err) {
    return reply.code(400).send({ error: (err as Error).message })
  }
})

/** Stage edited SEO title/meta and ensure a review item exists before approve/publish. */
app.post('/api/sites/:siteId/review/stage-seo-meta', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const body = req.body as {
    path?: string
    title?: string
    description?: string
    reviewItemId?: string
    stepTitle?: string
    findingId?: string
  }
  const path = (body.path ?? '').trim()
  if (!path) return reply.code(400).send({ error: 'path is required' })

  const page = await loadPageForPath(siteId, path)
  if (!page) return reply.code(404).send({ error: 'Page not found — sync WordPress first' })

  await upsertSeoRecommendations(siteId, path, {
    title: body.title,
    description: body.description,
  })

  const recs = await loadRecommendationsForPath(siteId, path)
  const diff = buildReviewDiff(urlPath(normalizeUrl(path)), recs, {
    title: page.title ?? null,
    metaDesc: page.metaDesc ?? null,
    contentSnippet: null,
  })

  let reviewItemId = body.reviewItemId
  if (reviewItemId) {
    const existing = await prisma.reviewItem.findFirst({
      where: { id: reviewItemId, siteId },
    })
    if (!existing) reviewItemId = undefined
    else {
      let preservedDiff = diff
      try {
        const p = JSON.parse(existing.payloadJson ?? '{}') as { diff?: Record<string, unknown> }
        const prev = p.diff as {
          title?: { before?: string; after?: string }
          meta?: { before?: string; after?: string }
        } | undefined
        if (prev) {
          preservedDiff = {
            ...diff,
            title:
              diff.title &&
              diff.title.before === diff.title.after &&
              prev.title?.before &&
              prev.title.before !== diff.title.after
                ? { before: prev.title.before, after: diff.title.after }
                : diff.title,
            meta:
              diff.meta &&
              diff.meta.before === diff.meta.after &&
              prev.meta?.before &&
              prev.meta.before !== diff.meta.after
                ? { before: prev.meta.before, after: diff.meta.after }
                : diff.meta,
          }
        }
      } catch {
        /* use fresh diff */
      }
      await prisma.reviewItem.update({
        where: { id: reviewItemId },
        data: {
          payloadJson: JSON.stringify({
            kind: 'meta_rewrite',
            path: urlPath(normalizeUrl(path)),
            diff: preservedDiff,
          }),
        },
      })
      return { reviewItemId, path: urlPath(normalizeUrl(path)), diff: preservedDiff }
    }
  }

  if (!reviewItemId) {
    reviewItemId = await ensureMetaReviewItem(siteId, path, {
      title: body.stepTitle ?? `SEO title & meta — ${urlPath(normalizeUrl(path))}`,
      diff,
      findingId: body.findingId ?? null,
    })
  }

  return { reviewItemId, path: urlPath(normalizeUrl(path)), diff }
})

app.get('/api/sites/:siteId/connections/summary', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })
  const pageCount = await prisma.page.count({ where: { siteId } })
  const facts = await prisma.siteFact.findMany({ where: { siteId } })
  const plugins = facts.filter((f) => f.kind === 'wp_plugin')
  const hasElementor = plugins.some((p) => /elementor/i.test(`${p.key} ${p.value}`))
  const seoPlugin = summarizeSeoPlugins(plugins.map((p) => ({ key: p.key, value: p.value })))
  const hasSitemap = facts.some((f) => f.kind === 'sitemap')
  const synced = site.lastSyncedAt?.toISOString() ?? null
  const wpConnected = !!(site.wpBaseUrl && site.wpUsername && site.wpAppPasswordEnc)
  let connectorInstalled = false
  let connectorVersion: string | null = null
  if (wpConnected) {
    try {
      const probe = await probeGroundworkConnector({
        baseUrl: site.wpBaseUrl!,
        username: site.wpUsername!,
        appPassword: decrypt(site.wpAppPasswordEnc!),
      })
      connectorInstalled = probe.installed && probe.seoWrite
      connectorVersion = probe.version
    } catch {
      /* connector not installed */
    }
  }
  return {
    wordpress: {
      connected: wpConnected,
      baseUrl: site.wpBaseUrl,
      pageCount,
      lastSyncedAt: synced,
      connectorInstalled,
      connectorVersion,
    },
    gsc: {
      connected: !!(site.googleRefreshTokenEnc && site.gscProperty),
      property: site.gscProperty,
      lastSyncedAt: synced,
    },
    ga4: {
      connected: !!(site.googleRefreshTokenEnc && site.ga4Property),
      property: site.ga4Property,
      lastSyncedAt: synced,
    },
    elementor: { detected: hasElementor, detail: hasElementor ? 'Elementor detected via WP sync' : 'Sync WordPress to detect' },
    seoPlugin: {
      detected: seoPlugin.detected,
      detail: seoPlugin.detail,
      primary: seoPlugin.primary?.name ?? null,
      extensions: seoPlugin.extensions.map((e) => e.name),
      capabilities: seoPlugin.capabilities,
    },
    sitemap: { detected: hasSitemap, detail: hasSitemap ? 'Sitemap found' : 'Not detected yet' },
  }
})

app.get('/api/sites/:siteId/dashboard', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const { range } = req.query as { range?: string }
  const periodDays = RANGE_DAYS[range ?? '28'] ?? 28
  return computeDashboard(siteId, periodDays)
})

// ---------------------------------------------------------------------------
// Phase 1: WordPress connector — connect, sync, and read back pulled pages.
// ---------------------------------------------------------------------------

app.get('/api/sites/:siteId/connections/wordpress', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })
  return {
    connected: !!(site.wpBaseUrl && site.wpUsername && site.wpAppPasswordEnc),
    baseUrl: site.wpBaseUrl,
    username: site.wpUsername,
  }
})

app.post('/api/sites/:siteId/connections/wordpress', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const body = req.body as { baseUrl?: string; username?: string; appPassword?: string }
  if (!body.baseUrl || !body.username || !body.appPassword) {
    return reply.code(400).send({ error: 'baseUrl, username, and appPassword are all required' })
  }

  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })

  const auth = { baseUrl: body.baseUrl, username: body.username, appPassword: body.appPassword }
  try {
    await testWpConnection(auth)
  } catch (err) {
    return reply.code(401).send({ error: (err as Error).message })
  }

  await prisma.site.update({
    where: { id: siteId },
    data: {
      wpBaseUrl: normalizeBaseUrl(body.baseUrl),
      wpUsername: body.username,
      wpAppPasswordEnc: encrypt(body.appPassword),
    },
  })
  return { connected: true }
})

app.post('/api/sites/:siteId/sync/wordpress', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })
  if (!site.wpBaseUrl || !site.wpUsername || !site.wpAppPasswordEnc) {
    return reply.code(400).send({ error: 'This site has no WordPress connection configured yet' })
  }

  const auth = {
    baseUrl: site.wpBaseUrl,
    username: site.wpUsername,
    appPassword: decrypt(site.wpAppPasswordEnc),
  }

  let content
  try {
    content = await fetchWpContent(auth)
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message })
  }

  let elementorFound = 0
  for (const item of content) {
    if (item.elementorData) elementorFound++
    const canonical = item.link ? normalizeUrl(item.link) : null
    const unresolved = !canonical
    await prisma.page.upsert({
      where: { siteId_wpId: { siteId, wpId: item.id } },
      create: {
        siteId,
        wpId: item.id,
        slug: item.slug,
        url: canonical,
        unresolved,
        type: item.contentType,
        title: item.title,
        metaTitle: item.metaTitle,
        metaDesc: item.metaDesc,
        liveSchemaJson: item.liveSchemaJson,
        elementorData: item.elementorData,
        contentHtml: item.contentHtml,
      },
      update: {
        slug: item.slug,
        url: canonical,
        unresolved,
        type: item.contentType,
        title: item.title,
        metaTitle: item.metaTitle,
        metaDesc: item.metaDesc,
        liveSchemaJson: item.liveSchemaJson,
        elementorData: item.elementorData,
        contentHtml: item.contentHtml,
      },
    })
    // Snapshot every sync (PRD safety model §6): a local revert record even
    // though there's no staging/backup access on the client's WP hosting.
    if (item.elementorData) {
      await prisma.snapshot.create({
        data: { siteId, slug: item.slug, kind: 'elementor', payload: item.elementorData },
      })
    }
  }

  // Capture SiteFact rows (plugins, treatments, authors, sitemap).
  try {
    const factInputs = await captureSiteFacts(auth, content)
    for (const f of factInputs) {
      await prisma.siteFact.upsert({
        where: { siteId_kind_key: { siteId, kind: f.kind, key: f.key } },
        create: { siteId, kind: f.kind, key: f.key, value: JSON.stringify(f.value) },
        update: { value: JSON.stringify(f.value), observedAt: new Date() },
      })
    }
  } catch (err) {
    app.log.warn({ err, siteId }, 'SiteFact capture failed')
  }

  try {
    const paths = content.slice(0, 10).map((c) => {
      try {
        return c.link ? new URL(c.link).pathname : `/${c.slug}`
      } catch {
        return `/${c.slug}`
      }
    })
    const psiFacts = await capturePagespeedFacts(site.wpBaseUrl!, paths)
    for (const f of psiFacts) {
      await prisma.siteFact.upsert({
        where: { siteId_kind_key: { siteId, kind: f.kind, key: f.key } },
        create: { siteId, kind: f.kind, key: f.key, value: JSON.stringify(f.value) },
        update: { value: JSON.stringify(f.value), observedAt: new Date() },
      })
    }
    await captureIndexationFacts(siteId, paths)
  } catch (err) {
    app.log.warn({ err, siteId }, 'PageSpeed/indexation capture failed')
  }

  await prisma.site.update({ where: { id: siteId }, data: { lastSyncedAt: new Date() } })
  await runSiteAudits(siteId).catch((err) => app.log.warn({ err }, 'Audit run after WP sync failed'))
  return { pagesSynced: content.length, elementorFound }
})

app.get('/api/sites/:siteId/pages', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const rows = await prisma.page.findMany({ where: { siteId }, orderBy: { slug: 'asc' } })
  return rows.map((p) => ({
    id: p.id,
    wpId: p.wpId,
    slug: p.slug,
    title: p.title,
    metaTitle: p.metaTitle,
    metaDesc: p.metaDesc,
    hasElementor: !!p.elementorData,
    updatedAt: p.updatedAt,
  }))
})

app.get('/api/sites/:siteId/pages/:pageId', async (req, reply) => {
  const { pageId } = req.params as { pageId: string }
  const p = await prisma.page.findUnique({ where: { id: pageId } })
  if (!p) return reply.code(404).send({ error: 'Page not found' })
  return p
})

// ---------------------------------------------------------------------------
// Pages workspace: real site-wide index + per-page drill-in insights.
// ---------------------------------------------------------------------------

const MS_DAY = 24 * 60 * 60 * 1000

/** Every page of the site with its real 28d search stats, sorted by traffic.
 *  Includes synced WP pages with zero search rows — invisible pages are a
 *  finding, not noise. */
app.get('/api/sites/:siteId/pages-index', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const [gscRows, pageRows, opps] = await Promise.all([
    prisma.gscRow.findMany({ where: { siteId, query: null } }),
    prisma.page.findMany({ where: { siteId }, select: { ...PAGE_LITE_SELECT } }),
    prisma.opportunity.findMany({ where: { siteId }, select: { page: true } }),
  ])
  const pages = pageRows.map(toPageLite).filter((p) => p.url)

  let maxTs = 0
  for (const r of gscRows) if (r.date.getTime() > maxTs) maxTs = r.date.getTime()
  const curStart = maxTs - 27 * MS_DAY
  const prevEnd = maxTs - 28 * MS_DAY
  const prevStart = maxTs - 55 * MS_DAY

  type Agg = { clicks: number; impr: number; posw: number }
  const cur = new Map<string, Agg>()
  const prev = new Map<string, Agg>()
  for (const r of gscRows) {
    const t = r.date.getTime()
    const bucket = t >= curStart ? cur : t >= prevStart && t <= prevEnd ? prev : null
    if (!bucket) continue
    const p = pagePath(r.page)
    const a = bucket.get(p) ?? { clicks: 0, impr: 0, posw: 0 }
    a.clicks += r.clicks
    a.impr += r.impressions
    a.posw += r.position * r.impressions
    bucket.set(p, a)
  }

  const byUrl = new Map(pages.map((p) => [p.url!, p]))
  const oppCounts = new Map<string, number>()
  for (const o of opps) {
    const raw = o.page.split(' ')[0]
    const key = byUrl.has(raw) ? raw : normalizeUrl(raw)
    oppCounts.set(key, (oppCounts.get(key) ?? 0) + 1)
  }

  const rows = [...new Set([...cur.keys(), ...prev.keys()])].map((path) => {
    const c = cur.get(path)
    const pv = prev.get(path)
    const wp = byUrl.get(path)
    return {
      path: urlPath(path),
      url: path,
      title: wp?.title ?? null,
      type: wp?.type ?? 'page',
      synced: !!wp,
      clicks: c?.clicks ?? 0,
      prevClicks: pv?.clicks ?? null,
      impressions: c?.impr ?? 0,
      position: c && c.impr > 0 ? c.posw / c.impr : null,
      oppCount: oppCounts.get(path) ?? 0,
    }
  })

  const seenUrls = new Set(rows.map((r) => r.url))
  for (const p of pages) {
    if (!seenUrls.has(p.url!)) {
      rows.push({
        path: urlPath(p.url!),
        url: p.url!,
        title: p.title,
        type: p.type,
        synced: true,
        clicks: 0,
        prevClicks: null,
        impressions: 0,
        position: null,
        oppCount: oppCounts.get(p.url!) ?? 0,
      })
    }
  }

  rows.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.path.localeCompare(b.path))
  return rows
})

/** Real headings from the synced page content: rendered HTML first, then the
 *  Elementor tree (heading widgets) for pure-builder pages. */
function parseHeadings(
  page: { contentHtml: string | null; elementorData: string | null } | null,
): { tag: string; text: string }[] {
  if (!page) return []
  const out: { tag: string; text: string }[] = []
  if (page.contentHtml) {
    for (const m of page.contentHtml.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
      const text = stripHtml(m[2])
      if (text) out.push({ tag: `H${m[1]}`, text })
      if (out.length >= 24) return out
    }
  }
  if (out.length === 0 && page.elementorData) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walk = (nodes: any[]) => {
        for (const n of nodes ?? []) {
          if (out.length >= 24) return
          if (n?.widgetType === 'heading' && n?.settings?.title) {
            out.push({
              tag: String(n.settings.header_size ?? 'h2').toUpperCase(),
              text: stripHtml(String(n.settings.title)),
            })
          }
          if (Array.isArray(n?.elements)) walk(n.elements)
        }
      }
      walk(JSON.parse(page.elementorData))
    } catch {
      // unparseable builder data — no headings is an honest answer
    }
  }
  return out
}

// Words too common to count as "topic coverage" when matching queries to headings.
import { significantTokens } from './textTokens.ts'

/**
 * Structure diagnostic: is there exactly one H1, and which real search queries
 * (with impressions) does no heading actually address? A query counts as
 * "uncovered" when a distinctive term from it appears in none of the headings —
 * e.g. headings say "Information / Hours" while the page gets thousands of
 * impressions for "botox nashville" with "botox" nowhere in the structure.
 */
function computeStructure(
  headings: { tag: string; text: string }[],
  queries: { query: string; impressions: number }[],
) {
  const h1s = headings.filter((h) => h.tag === 'H1')
  const headingTokens = new Set(significantTokens(headings.map((h) => h.text).join(' ')))
  const uncovered: { query: string; impressions: number; missing: string[] }[] = []
  for (const q of queries) {
    if (q.impressions < 100) continue
    const toks = significantTokens(q.query)
    if (toks.length === 0) continue
    const missing = toks.filter((t) => !headingTokens.has(t))
    if (missing.length > 0) uncovered.push({ query: q.query, impressions: q.impressions, missing })
  }
  uncovered.sort((a, b) => b.impressions - a.impressions)
  return {
    h1Count: h1s.length,
    h1Text: h1s[0]?.text ?? null,
    headingCount: headings.length,
    uncovered: uncovered.slice(0, 5),
  }
}

/** Everything the page drill-in renders: 28d stats + deltas, 90d daily trend,
 *  real queries with CTR gaps, current metadata, headings, open opportunities. */
app.get('/api/sites/:siteId/page-insights', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const { path } = req.query as { path?: string }
  if (!path) return reply.code(400).send({ error: 'path is required' })
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })

  const seg = lastSegment(path)
  const pageRow = await findPageByPath(siteId, path)
  const canonical = pageRow?.url ? normalizeUrl(pageRow.url) : normalizeUrl(path)

  const pageRows = (
    await prisma.gscRow.findMany({ where: { siteId, query: null, ...(seg ? { page: { contains: seg } } : {}) } })
  ).filter((r) => urlsEqual(pagePath(r.page), canonical))

  let maxTs = 0
  for (const r of pageRows) if (r.date.getTime() > maxTs) maxTs = r.date.getTime()

  type Agg = { clicks: number; impr: number; posw: number }
  const mk = (): Agg => ({ clicks: 0, impr: 0, posw: 0 })
  const curA = mk()
  const prevA = mk()
  const curStart = maxTs - 27 * MS_DAY
  const prevEnd = maxTs - 28 * MS_DAY
  const prevStart = maxTs - 55 * MS_DAY

  // 90-day daily series — the "watch your change land" monitor.
  const DAYS = 90
  const dayStart = maxTs - (DAYS - 1) * MS_DAY
  const daily = Array.from({ length: DAYS }, (_, i) => ({
    date: new Date(dayStart + i * MS_DAY).toISOString().slice(0, 10),
    clicks: 0,
    impressions: 0,
    posw: 0,
  }))
  for (const r of pageRows) {
    const t = r.date.getTime()
    if (t >= curStart) {
      curA.clicks += r.clicks
      curA.impr += r.impressions
      curA.posw += r.position * r.impressions
    } else if (t >= prevStart && t <= prevEnd) {
      prevA.clicks += r.clicks
      prevA.impr += r.impressions
      prevA.posw += r.position * r.impressions
    }
    const di = Math.round((t - dayStart) / MS_DAY)
    if (di >= 0 && di < DAYS) {
      daily[di].clicks += r.clicks
      daily[di].impressions += r.impressions
      daily[di].posw += r.position * r.impressions
    }
  }

  const pos = (a: Agg) => (a.impr > 0 ? a.posw / a.impr : null)
  const curPos = pos(curA)
  const hasPrev = pageRows.some((r) => {
    const t = r.date.getTime()
    return t >= prevStart && t <= prevEnd
  })

  // Real queries for this path with their CTR gap vs the position benchmark.
  const queryRows = (
    await prisma.gscRow.findMany({ where: { siteId, query: { not: null }, ...(seg ? { page: { contains: seg } } : {}) } })
  ).filter((r) => urlsEqual(pagePath(r.page), canonical))
  const byQuery = new Map<string, Agg>()
  for (const r of queryRows) {
    const a = byQuery.get(r.query!) ?? mk()
    a.clicks += r.clicks
    a.impr += r.impressions
    a.posw += r.position * r.impressions
    byQuery.set(r.query!, a)
  }
  const queries = [...byQuery.entries()]
    .map(([query, a]) => {
      const qPos = a.impr > 0 ? a.posw / a.impr : 0
      const ctr = a.impr > 0 ? a.clicks / a.impr : 0
      return {
        query,
        impressions: a.impr,
        clicks: a.clicks,
        ctr,
        position: qPos,
        // Percentage-point gap to the benchmark CTR for this position.
        gap: ctr - benchmarkCtr(qPos),
      }
    })
    .sort((x, y) => y.impressions - x.impressions || x.query.localeCompare(y.query))
    .slice(0, 10)

  const opps = (await prisma.opportunity.findMany({ where: { siteId } }))
    .filter((o) => urlsEqual(o.page.split(' ')[0], canonical))
    .map((o) => ({ id: o.id, title: o.title, expected: o.expected, effort: o.effort, type: o.type, status: o.status }))

  const headings = parseHeadings(pageRow)
  const liveUrl = pageRow?.url ?? (site.wpBaseUrl ? `${site.wpBaseUrl}${urlPath(canonical)}` : null)
  return {
    liveUrl,
    page: pageRow
      ? {
          slug: pageRow.slug,
          title: pageRow.title,
          metaTitle: pageRow.metaTitle,
          metaDesc: pageRow.metaDesc,
          hasElementor: !!pageRow.elementorData,
          url: pageRow.url,
          schemaTypes: collectSchemaTypes(resolvePageSchema(pageRow)),
        }
      : null,
    stats: {
      clicks: curA.clicks,
      prevClicks: hasPrev ? prevA.clicks : null,
      impressions: curA.impr,
      prevImpressions: hasPrev ? prevA.impr : null,
      position: curPos,
      prevPosition: hasPrev ? pos(prevA) : null,
      ctr: curA.impr > 0 ? curA.clicks / curA.impr : 0,
      expectedCtr: curPos != null ? benchmarkCtr(curPos) : null,
    },
    daily: daily.map((d) => ({
      date: d.date,
      clicks: d.clicks,
      position: d.impressions > 0 ? d.posw / d.impressions : null,
    })),
    queries,
    headings,
    structure: computeStructure(headings, queries),
    opportunities: opps,
  }
})

/** Live JSON-LD from Yoast (refreshes from WordPress on demand). */
app.get('/api/sites/:siteId/page-live-schema', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const { path } = req.query as { path?: string }
  if (!path) return reply.code(400).send({ error: 'path is required' })

  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })

  const pageRow = await loadPageForPath(siteId, path)
  let liveSchema = resolvePageSchema(pageRow)

  if (pageRow?.wpId && site.wpBaseUrl && site.wpUsername && site.wpAppPasswordEnc) {
    try {
      const auth = {
        baseUrl: site.wpBaseUrl,
        username: site.wpUsername,
        appPassword: decrypt(site.wpAppPasswordEnc),
      }
      const fresh = await fetchPageLiveSchema(
        auth,
        pageRow.wpId,
        pageRow.type === 'post' ? 'post' : 'page',
      )
      if (fresh) {
        liveSchema = fresh
        await prisma.page.update({
          where: { id: pageRow.id },
          data: { liveSchemaJson: fresh },
        })
      }
    } catch {
      /* use cached */
    }
  }

  const types = collectSchemaTypes(liveSchema)
  const liveUrl = pageRow?.url ?? (site.wpBaseUrl ? `${site.wpBaseUrl}${urlPath(canonicalPath(path))}` : null)

  return {
    path,
    liveUrl,
    types,
    typeSummary: formatSchemaTypeSummary(types),
    formatted: formatLiveSchemaDisplay(liveSchema),
    source: liveSchema ? 'yoast' : 'none',
  }
})

// ---------------------------------------------------------------------------
// Phase 2: Google OAuth + Search Console / GA4 sync.
// ---------------------------------------------------------------------------

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'

app.get('/api/auth/google/start', async (req, reply) => {
  const { siteId } = req.query as { siteId?: string }
  if (!siteId) return reply.code(400).send({ error: 'siteId is required' })
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })

  let url: string
  try {
    url = getGoogleAuthUrl(siteId)
  } catch (err) {
    return reply.code(500).send({ error: (err as Error).message })
  }
  return reply.redirect(url)
})

app.get('/api/auth/google/callback', async (req, reply) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string }
  if (error) return reply.redirect(`${FRONTEND_URL}/?googleError=${encodeURIComponent(error)}`)
  if (!code || !state) return reply.code(400).send({ error: 'Missing code or state from Google' })

  const site = await prisma.site.findUnique({ where: { id: state } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })

  try {
    const { refreshToken, email } = await exchangeGoogleCode(code)
    await prisma.site.update({
      where: { id: state },
      data: { googleEmail: email, googleRefreshTokenEnc: encrypt(refreshToken) },
    })
  } catch (err) {
    // Surfaced to the user via the redirect, but log server-side too since the
    // toast it produces fades in ~2.6s and is easy to miss.
    app.log.error({ err }, 'Google OAuth code exchange failed')
    return reply.redirect(`${FRONTEND_URL}/?googleError=${encodeURIComponent((err as Error).message)}`)
  }

  return reply.redirect(`${FRONTEND_URL}/?googleConnected=1`)
})

app.get('/api/sites/:siteId/connections/google', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })
  return {
    connected: !!site.googleRefreshTokenEnc,
    email: site.googleEmail,
    gscProperty: site.gscProperty,
    ga4Property: site.ga4Property,
  }
})

async function requireGoogleAuth(siteId: string, reply: import('fastify').FastifyReply) {
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) {
    reply.code(404).send({ error: 'Site not found' })
    return null
  }
  if (!site.googleRefreshTokenEnc) {
    reply.code(400).send({ error: 'Connect a Google account first' })
    return null
  }
  return site
}

app.get('/api/sites/:siteId/google/gsc-sites', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await requireGoogleAuth(siteId, reply)
  if (!site) return
  try {
    return await listGscSites(decrypt(site.googleRefreshTokenEnc!))
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message })
  }
})

app.get('/api/sites/:siteId/google/ga4-properties', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await requireGoogleAuth(siteId, reply)
  if (!site) return
  try {
    return await listGa4Properties(decrypt(site.googleRefreshTokenEnc!))
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message })
  }
})

app.post('/api/sites/:siteId/connections/gsc', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const { propertyUrl } = req.body as { propertyUrl?: string }
  if (!propertyUrl) return reply.code(400).send({ error: 'propertyUrl is required' })
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })
  await prisma.site.update({ where: { id: siteId }, data: { gscProperty: propertyUrl } })
  return { saved: true }
})

app.post('/api/sites/:siteId/connections/ga4', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const { propertyId } = req.body as { propertyId?: string }
  if (!propertyId) return reply.code(400).send({ error: 'propertyId is required' })
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })
  await prisma.site.update({ where: { id: siteId }, data: { ga4Property: propertyId } })
  return { saved: true }
})

app.post('/api/sites/:siteId/sync/gsc', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await requireGoogleAuth(siteId, reply)
  if (!site) return
  if (!site.gscProperty) return reply.code(400).send({ error: 'Select a Search Console property first' })

  const pageRange = defaultGscPageRange()
  const queryRange = defaultGscQueryRange()
  let rows
  try {
    rows = await fetchGscData(decrypt(site.googleRefreshTokenEnc!), site.gscProperty, pageRange, queryRange)
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message })
  }

  // Full replace of the pulled window keeps re-syncs idempotent without a
  // unique constraint (SQLite treats each NULL `query` as distinct, so
  // upserting page-level rows isn't reliable) — simpler than true delta sync
  // for v1, revisit if daily syncs get expensive at scale. The page-level
  // window spans the query window, so clearing it covers both.
  await prisma.gscRow.deleteMany({
    where: { siteId, date: { gte: new Date(pageRange.startDate), lte: new Date(pageRange.endDate) } },
  })
  if (rows.length) {
    await prisma.gscRow.createMany({
      data: rows.map((r) => ({
        siteId,
        date: new Date(r.date),
        page: r.page,
        query: r.query,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      })),
    })
  }

  const audit = await regenerateForSite(siteId)
  const measured = await measureChangeLogVerdicts(siteId)
  await prisma.site.update({ where: { id: siteId }, data: { lastSyncedAt: new Date() } })
  return { rowsSynced: rows.length, pageRange, queryRange, opportunitiesGenerated: audit.total, audit, measured }
})

app.post('/api/sites/:siteId/sync/ga4', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await requireGoogleAuth(siteId, reply)
  if (!site) return
  if (!site.ga4Property) return reply.code(400).send({ error: 'Select a GA4 property first' })

  const { startDate, endDate } = defaultGa4Range()
  let rows
  try {
    rows = await fetchGa4Data(decrypt(site.googleRefreshTokenEnc!), site.ga4Property, startDate, endDate)
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message })
  }

  await prisma.ga4Row.deleteMany({
    where: { siteId, date: { gte: new Date(startDate), lte: new Date(endDate) } },
  })
  if (rows.length) {
    await prisma.ga4Row.createMany({
      data: rows.map((r) => ({
        siteId,
        date: new Date(r.date),
        landingPage: r.landingPage,
        sessions: r.sessions,
        engagementRate: r.engagementRate,
        conversions: r.conversions,
      })),
    })
  }

  const audit = await regenerateForSite(siteId)
  await prisma.site.update({ where: { id: siteId }, data: { lastSyncedAt: new Date() } })
  return { rowsSynced: rows.length, startDate, endDate, opportunitiesGenerated: audit.total, audit }
})

// Manual recompute (no fresh pull) — handy after tuning, or to rebuild from cache.
app.post('/api/sites/:siteId/opportunities/generate', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })
  const audit = await regenerateForSite(siteId)
  return { opportunitiesGenerated: audit.total, audit }
})

// Phase 4: generate a real title/meta rewrite for one opportunity with Claude,
// grounded in the page's synced content + its actual GSC queries.
const lastSegment = (p: string) =>
  p.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? ''

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Aggregate a page's top GSC queries by its slug segment (page URLs carry utm
 * variants, so match by substring and roll up per query). Shared by the
 * meta-rewrite generator and the opportunity context drawer.
 */
async function topQueriesForSlug(siteId: string, seg: string): Promise<GscQuerySample[]> {
  if (!seg) return []
  const gscRows = await prisma.gscRow.findMany({
    where: { siteId, query: { not: null }, page: { contains: seg } },
    orderBy: { impressions: 'desc' },
    take: 500,
  })
  const byQuery = new Map<string, { impressions: number; clicks: number; posw: number }>()
  for (const r of gscRows) {
    const q = r.query!
    const a = byQuery.get(q) ?? { impressions: 0, clicks: 0, posw: 0 }
    a.impressions += r.impressions
    a.clicks += r.clicks
    a.posw += r.position * r.impressions
    byQuery.set(q, a)
  }
  return [...byQuery.entries()]
    .map(([query, a]) => ({
      query,
      impressions: a.impressions,
      clicks: a.clicks,
      ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
      position: a.impressions > 0 ? a.posw / a.impressions : 0,
    }))
    .sort((x, y) => y.impressions - x.impressions || x.query.localeCompare(y.query))
    .slice(0, 8)
}

// Real per-opportunity context for the Opportunities tab drawer: the matched
// WordPress page (current metadata), its live URL, and its actual GSC queries.
app.get('/api/sites/:siteId/opportunities/:oppId/context', async (req, reply) => {
  const { siteId, oppId } = req.params as { siteId: string; oppId: string }
  const opp = await prisma.opportunity.findUnique({ where: { id: oppId } })
  if (!opp || opp.siteId !== siteId) return reply.code(404).send({ error: 'Opportunity not found' })
  const site = await prisma.site.findUnique({ where: { id: siteId } })

  // Cannibalization rows read "/path +2 more" — the first token is the path.
  const path = opp.page.split(' ')[0]
  const seg = lastSegment(path)
  const page = await loadPageForPath(siteId, path)
  const queries = await topQueriesForSlug(siteId, seg)
  const base = site?.wpBaseUrl ?? (site ? `https://${site.domain}` : null)

  return {
    matchedPage: page
      ? { slug: page.slug, title: page.title, metaTitle: page.metaTitle, metaDesc: page.metaDesc }
      : null,
    liveUrl: base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : null,
    queries,
  }
})

/**
 * Draft a real title + meta rewrite for one opportunity with Claude, grounded in
 * the page's synced content + its actual GSC queries. Writes reviewable
 * Recommendation rows + a Review Queue item, and flips the opportunity to
 * "Drafted". Reused by the manual generate route and the auto-draft on refresh.
 */
type OppRow = Awaited<ReturnType<typeof prisma.opportunity.findUnique>>
async function draftMetaForOpportunity(siteId: string, opp: NonNullable<OppRow>) {
  const path = opp.page.split(' ')[0]
  const seg = lastSegment(path)
  const page = await loadPageForPath(siteId, path)
  const queries = await topQueriesForSlug(siteId, seg)
  const authorContext = await loadAuthorContext(siteId)

  const result = await generateMetaRewrite({
    path: opp.page,
    pageTitle: page?.title ?? null,
    currentMetaTitle: page?.metaTitle ?? null,
    currentMetaDesc: page?.metaDesc ?? null,
    contentSnippet: page?.contentHtml ? stripHtml(page.contentHtml).slice(0, 1500) : null,
    diagnosis: opp.why,
    queries,
    authorContext,
  })

  const wpPlugins = await prisma.siteFact.findMany({ where: { siteId, kind: 'wp_plugin' } })
  const seoSummary = summarizeSeoPlugins(wpPlugins.map((p) => ({ key: p.key, value: p.value })))

  // Idempotent per page+tab; the Review Queue item surfaces the work for approval.
  const queriesJson = JSON.stringify(result.targetQueries)
  await prisma.recommendation.deleteMany({
    where: { siteId, page: opp.page, tab: { in: ['title', 'meta'] } },
  })
  await prisma.recommendation.createMany({
    data: [
      {
        siteId,
        tab: 'title',
        page: opp.page,
        current: page?.metaTitle ?? page?.title ?? '(none)',
        suggested: result.titleTag,
        reason: result.titleReason,
        queries: queriesJson,
        chars: true,
      },
      {
        siteId,
        tab: 'meta',
        page: opp.page,
        current: page?.metaDesc ?? '(none)',
        suggested: result.metaDescription,
        reason: result.metaReason,
        queries: queriesJson,
        chars: true,
      },
    ],
  })
  const displayPath = urlPath(normalizeUrl(path))
  const diff = buildReviewDiff(
    displayPath,
    [
      {
        tab: 'title',
        current: page?.metaTitle ?? page?.title ?? '(none)',
        suggested: result.titleTag,
      },
      {
        tab: 'meta',
        current: page?.metaDesc ?? '(none)',
        suggested: result.metaDescription,
      },
    ],
    {
      title: page?.title ?? null,
      metaDesc: page?.metaDesc ?? null,
      contentSnippet: null,
    },
  )
  await prisma.reviewItem.deleteMany({
    where: {
      siteId,
      status: 'Pending',
      actionKind: 'meta_rewrite',
      detail: displayPath,
    },
  })
  const activeFindings = await prisma.finding.findMany({
    where: { siteId, status: { in: ['open', 'drafted', 'in_review'] } },
  })
  const linkedFinding =
    activeFindings.find((f) => pathsMatch(f.subjectRef, displayPath) && /meta|ranking/i.test(f.title)) ??
    activeFindings.find((f) => pathsMatch(f.subjectRef, displayPath))
  await prisma.reviewItem.create({
    data: {
      siteId,
      title: opp.title,
      detail: displayPath,
      type: 'Metadata',
      risk: 'Low',
      reviewer: 'Unassigned',
      dest: seoPublishDest(seoSummary),
      status: 'Pending',
      actionKind: 'meta_rewrite',
      findingId: linkedFinding?.id ?? null,
      payloadJson: JSON.stringify({ kind: 'meta_rewrite', path: displayPath, diff, opportunityId: opp.id }),
    },
  })
  await prisma.opportunity.update({ where: { id: opp.id }, data: { status: 'Drafted' } })

  return { title: result.titleTag, meta: result.metaDescription, matchedPage: !!page, queryCount: queries.length }
}

app.post('/api/sites/:siteId/opportunities/:oppId/generate', async (req, reply) => {
  const { siteId, oppId } = req.params as { siteId: string; oppId: string }
  const opp = await prisma.opportunity.findUnique({ where: { id: oppId } })
  if (!opp || opp.siteId !== siteId) return reply.code(404).send({ error: 'Opportunity not found' })
  try {
    return await prepareOpportunityGamePlan(siteId, opp)
  } catch (err) {
    app.log.error({ err }, 'Game plan generation failed')
    return reply.code(502).send({ error: (err as Error).message })
  }
})

/** Autonomous run: generate → readiness-verify → auto-approve to a verified draft. */
app.post('/api/sites/:siteId/opportunities/:oppId/run-autonomous', async (req, reply) => {
  const { siteId, oppId } = req.params as { siteId: string; oppId: string }
  const opp = await prisma.opportunity.findUnique({ where: { id: oppId } })
  if (!opp || opp.siteId !== siteId) return reply.code(404).send({ error: 'Opportunity not found' })
  try {
    return await runAutonomousOpportunity(siteId, opp)
  } catch (err) {
    app.log.error({ err }, 'Autonomous run failed')
    return reply.code(502).send({ error: (err as Error).message })
  }
})

/** Alias — same handler as /generate. */
app.post('/api/sites/:siteId/opportunities/:oppId/prepare-game-plan', async (req, reply) => {
  const { siteId, oppId } = req.params as { siteId: string; oppId: string }
  const opp = await prisma.opportunity.findUnique({ where: { id: oppId } })
  if (!opp || opp.siteId !== siteId) return reply.code(404).send({ error: 'Opportunity not found' })
  try {
    return await prepareOpportunityGamePlan(siteId, opp)
  } catch (err) {
    app.log.error({ err }, 'Game plan generation failed')
    return reply.code(502).send({ error: (err as Error).message })
  }
})

// Mark an opportunity Done or Dismissed (checklist actions) or reopen it. A Done/
// Dismissed item survives re-audits, so the checklist doesn't resurface it.
app.post('/api/sites/:siteId/opportunities/:oppId/status', async (req, reply) => {
  const { siteId, oppId } = req.params as { siteId: string; oppId: string }
  const { status } = req.body as { status?: string }
  if (!['Open', 'Drafted', 'Done', 'Dismissed'].includes(status ?? '')) {
    return reply.code(400).send({ error: 'status must be Open, Drafted, Done, or Dismissed' })
  }
  const opp = await prisma.opportunity.findUnique({ where: { id: oppId } })
  if (!opp || opp.siteId !== siteId) return reply.code(404).send({ error: 'Opportunity not found' })
  await prisma.opportunity.update({
    where: { id: oppId },
    data: { status, decidedAt: status === 'Done' || status === 'Dismissed' ? new Date() : null },
  })
  return { id: oppId, status }
})

/**
 * One-click refresh (the top-nav ⟳): re-pull every connected source and merge the
 * opportunity checklist (preserving status/progress). Game plans are built on
 * demand when the user opens an opportunity — not during refresh.
 */
app.post('/api/sites/:siteId/refresh', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })

  const synced: string[] = []
  const syncErrors: string[] = []
  const tryInject = async (label: string, url: string) => {
    try {
      const res = await app.inject({ method: 'POST', url, payload: {} })
      if (res.statusCode === 200) synced.push(label)
      else syncErrors.push(`${label}: ${(res.json() as { error?: string })?.error ?? res.statusCode}`)
    } catch (err) {
      syncErrors.push(`${label}: ${(err as Error).message}`)
    }
  }
  // Only attempt sources that are actually configured.
  if (site.wpBaseUrl && site.wpAppPasswordEnc) await tryInject('WordPress', `/api/sites/${siteId}/sync/wordpress`)
  if (site.googleRefreshTokenEnc && site.gscProperty) await tryInject('Search Console', `/api/sites/${siteId}/sync/gsc`)
  if (site.googleRefreshTokenEnc && site.ga4Property) await tryInject('GA4', `/api/sites/${siteId}/sync/ga4`)

  // Merge the checklist against the freshest data (idempotent; also covers a
  // WordPress-only refresh, since the WP sync route doesn't re-audit itself).
  const audit = await regenerateForSite(siteId)

  // Flagship: auto-write the single best blog opportunity not yet drafted —
  // "your next blog is already written." Deduped by keyword so each refresh
  // writes the *next* best gap. Grounded in demand + competitor gaps.
  // The topic supply governor can veto this: at saturation or above the
  // velocity ceiling the right recommendation is to publish LESS, not more.
  let blogWritten: { id: string; title: string } | null = null
  let blogError: string | null = null
  let blogSkipped: string | null = null
  try {
    const governor = await siteGovernor(siteId)
    const ideas = governor.allowNewPosts ? await computeBlogIdeas(siteId) : []
    if (!governor.allowNewPosts) blogSkipped = governor.reason
    const existing = new Set(
      (await prisma.blogPost.findMany({ where: { siteId }, select: { targetKeyword: true } })).map((b) =>
        b.targetKeyword.toLowerCase(),
      ),
    )
    const next = ideas.find((i) => !existing.has(i.keyword.toLowerCase()))
    if (next) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const post = await writeBlogForKeyword(siteId, next.keyword, null, next.estClicks)
          blogWritten = { id: post.id, title: post.title }
          break
        } catch (err) {
          const msg = (err as Error).message
          if (attempt === 0 && /rate_limit|429/.test(msg)) {
            await new Promise((r) => setTimeout(r, 20_000))
            continue
          }
          blogError = msg.slice(0, 120)
          break
        }
      }
    }
  } catch (err) {
    blogError = (err as Error).message.slice(0, 120)
  }

  // Auto-draft top unified findings (refresh + metadata), capped at 2 per refresh.
  let findingsDrafted = 0
  const topFindings = await prisma.finding.findMany({
    where: { siteId, status: 'open', auditId: { in: ['content', 'metadata'] } },
    orderBy: { priorityValue: 'desc' },
    take: 2,
  })
  for (const f of topFindings) {
    const actions = JSON.parse(f.actionsJson) as { kind: string }[]
    const kind = actions[0]?.kind
    if (!kind || kind === 'monitor' || kind === 'prune' || kind === 'consolidate') continue
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/sites/${siteId}/findings/${f.id}/draft-fix`,
        payload: { actionKind: kind },
      })
      if (res.statusCode === 200) findingsDrafted++
    } catch {
      /* skip on rate limit / missing data */
    }
  }

  await prisma.site.update({ where: { id: siteId }, data: { lastSyncedAt: new Date() } })
  return { synced, syncErrors, audit, drafted: 0, draftErrors: [] as string[], blogWritten, blogError, blogSkipped, findingsDrafted }
})

// Phase 6: generate real on-page content updates (H1/H2s, body, FAQ, schema,
// internal links) for one page — grounded in its headings, GSC queries, the
// "uncovered searches" diagnostic, its content, and (for links) other pages.
const ALL_CONTENT_TYPES: ContentUpdateType[] = ['headings', 'body', 'faq', 'schema', 'links']

/**
 * Generate on-page content updates for one page and store them as reviewable
 * Recommendation rows (+ a Content review item unless skipReview). Reused by the
 * manual generate-updates route and the eager per-opportunity preparation on
 * refresh. Sequential with a 429 backoff to respect the Claude rate limit.
 */
/**
 * The actual rendered body text of a page — extracted from Elementor
 * text-editors when the page is built in Elementor, else from contentHtml.
 * Link anchors are grounded on THIS so a verbatim anchor from the AI will
 * actually be found by the in-body link placer.
 */
function renderedBodyText(
  page: { elementorData: string | null; contentHtml: string | null } | null,
): string {
  if (!page) return ''
  if (page.elementorData?.trim()) {
    try {
      const parsed = parseElementorRoot(page.elementorData)
      const text = collectTextEditors(parsed.root)
        .map((ed) => stripHtml(String(ed.settings?.editor ?? '')))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) return text
    } catch {
      /* fall through to contentHtml */
    }
  }
  return stripHtml(page.contentHtml ?? '')
}

async function generatePageContentUpdates(
  siteId: string,
  path: string,
  types: ContentUpdateType[],
  opts: { skipReview?: boolean } = {},
): Promise<{ path: string; generated: string[]; errors: string[]; matchedPage: boolean }> {
  const seg = lastSegment(path)
  const page = await loadPageForPath(siteId, path)
  const queries = await topQueriesForSlug(siteId, seg)
  const headings = parseHeadings(page)
  const structure = computeStructure(headings, queries)
  const authorContext = await loadAuthorContext(siteId)

  // Outbound link targets: deterministic topical overlap with this page's GSC queries + content.
  const bodyText = renderedBodyText(page)
  let linkCandidates: ContentGenInput['linkCandidates'] = []
  let selectedLinkTargets: ReturnType<typeof selectLinkTargets> = []
  if (types.includes('links')) {
    // High-signal topic vector: title + GSC queries + headings. Raw body prose
    // is deliberately excluded — it injects incidental words that pollute
    // relevance ranking (a page's title/queries describe its true topic).
    const headingText = headings.map((h) => h.text).join(' ')
    const sourceText = `${page?.title ?? ''} ${queries
      .slice(0, 12)
      .map((q) => q.query)
      .join(' ')} ${headingText}`
    const others = await prisma.page.findMany({
      where: { siteId, slug: { not: seg } },
      select: { slug: true, title: true, contentHtml: true, type: true, url: true },
    })
    const ranked = rankLinkCandidates(sourceText, others, seg, { titleText: page?.title ?? '' })
    // Cap candidate count to the healthy contextual range for this body length.
    selectedLinkTargets = selectLinkTargets(ranked, maxContextualLinksForWordCount(countWords(bodyText)))
    linkCandidates = selectedLinkTargets.map(({ path, title, snippet, score, matchedTerms }) => ({
      path,
      title,
      snippet,
      score,
      matchedTerms,
    }))
  }

  const liveSchema = resolvePageSchema(page)
  const liveSchemaDisplay = formatLiveSchemaDisplay(liveSchema)

  const genInput: ContentGenInput = {
    path,
    pageTitle: page?.metaTitle ?? page?.title ?? null,
    pageType: page?.type ?? 'page',
    // Ground on the real rendered body (Elementor editors) so link anchors the
    // AI copies verbatim will actually be found in place. Larger slice for links.
    contentSnippet: bodyText ? bodyText.slice(0, types.includes('links') ? 6000 : 1800) : null,
    headings,
    queries,
    uncoveredQueries: structure.uncovered.map((u) => u.query),
    existingSchema: liveSchema,
    schemaTypesPresent: collectSchemaTypesForGen(liveSchema),
    linkCandidates,
    authorContext,
  }

  // Sequential with a 429 backoff to respect the Claude per-minute rate limit.
  const generated: string[] = []
  const errors: string[] = []
  for (const type of types) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (type === 'schema') {
          const faqRow = await prisma.recommendation.findFirst({
            where: { siteId, page: path, tab: 'faq' },
          })
          const faqPairs = faqRow?.suggested ? parseFaqPairs(faqRow.suggested) : []
          const delta = planSchemaDelta(liveSchema, {
            pageType: page?.type ?? 'page',
            hasFaqContent: faqPairs.length > 0,
          })

          if (delta.missing.length === 0) {
            await prisma.recommendation.deleteMany({ where: { siteId, page: path, tab: 'schema' } })
            await prisma.recommendation.create({
              data: {
                siteId,
                tab: 'schema',
                page: path,
                current: liveSchemaDisplay,
                suggested: '',
                reason: `Live schema (Yoast) already outputs ${formatSchemaTypeSummary(delta.present)}. Nothing to add.`,
                queries: JSON.stringify(queries.slice(0, 5).map((q) => q.query)),
                chars: false,
              },
            })
            generated.push(type)
            break
          }

          if (delta.missing.length === 1 && delta.missing[0] === 'FAQPage' && faqPairs.length > 0) {
            const pageUrl = page?.url ? normalizeUrl(page.url) : path
            const suggested = buildFaqPageSchema(faqPairs, pageUrl)
            await prisma.recommendation.deleteMany({ where: { siteId, page: path, tab: 'schema' } })
            await prisma.recommendation.create({
              data: {
                siteId,
                tab: 'schema',
                page: path,
                current: liveSchemaDisplay,
                suggested,
                reason: `Add FAQPage to Yoast's graph (${faqPairs.length} Q&A pairs from the FAQ tab). Pushes via Groundwork Connector into Yoast schema output.`,
                queries: JSON.stringify(queries.slice(0, 5).map((q) => q.query)),
                chars: false,
              },
            })
            generated.push(type)
            break
          }
        }

        const res = await generateContentUpdate(type, genInput)
        let suggested = res.suggested
        let reason = res.reason
        if (type === 'schema') {
          const faqRow = await prisma.recommendation.findFirst({
            where: { siteId, page: path, tab: 'faq' },
          })
          const faqPairs = faqRow?.suggested ? parseFaqPairs(faqRow.suggested) : []
          const delta = planSchemaDelta(liveSchema, {
            pageType: page?.type ?? 'page',
            hasFaqContent: faqPairs.length > 0,
          })
          suggested = res.suggested
          reason = `Add to live graph: ${delta.missing.join(', ')}. ${res.reason}`
        }
        if (type === 'links') {
          const allPages = await prisma.page.findMany({
            where: { siteId },
            select: { slug: true, url: true, type: true },
          })
          const aliases = buildPagePathAliasMap(allPages)
          suggested = mergeLinkSuggestionsWithTargets(suggested, selectedLinkTargets, aliases)
          suggested = resolveLinkSuggestionsText(suggested, aliases)
          reason = buildLinkEvidenceReason(selectedLinkTargets, queries)
        }

        const faqPairs = type === 'faq' ? parseFaqPairs(suggested) : []
        const elementorJson =
          type === 'faq' ? faqElementorJsonForPage(faqPairs, page) : null
        const faqCurrent =
          type === 'faq' ? faqCurrentFromPage(page) : res.current

        await prisma.recommendation.deleteMany({ where: { siteId, page: path, tab: type } })
        await prisma.recommendation.create({
          data: {
            siteId,
            tab: type,
            page: path,
            current: type === 'schema' ? liveSchemaDisplay : type === 'faq' ? faqCurrent : res.current,
            suggested,
            elementorJson,
            reason:
              type === 'faq'
                ? `${reason}${faqReasonSuffix(page, elementorJson, faqPairs)}`
                : reason,
            queries: JSON.stringify(res.targetQueries),
            chars: false,
          },
        })
        generated.push(type)
        break
      } catch (err) {
        const msg = (err as Error).message
        if (attempt === 0 && /rate_limit|429/.test(msg)) {
          await new Promise((r) => setTimeout(r, 20_000))
          continue
        }
        errors.push(`${type}: ${msg.slice(0, 100)}`)
        break
      }
    }
  }

  if (generated.length && !opts.skipReview) {
    const recs = await loadRecommendationsForPath(siteId, path)
    const diff = buildReviewDiff(path, recs, {
      title: page?.title ?? null,
      metaDesc: page?.metaDesc ?? null,
      contentSnippet: page?.contentHtml?.slice(0, 500) ?? null,
    })
    await prisma.reviewItem.deleteMany({
      where: { siteId, status: 'Pending', actionKind: 'content_update', detail: path },
    })
    await prisma.reviewItem.create({
      data: {
        siteId,
        title: `Content updates — ${path}`,
        detail: path,
        type: 'Content',
        risk: 'Low',
        reviewer: 'Unassigned',
        dest: 'WordPress',
        status: 'Pending',
        actionKind: 'content_update',
        payloadJson: JSON.stringify({ kind: 'content_update', path, generated, diff }),
      },
    })
  }
  return { path, generated, errors, matchedPage: !!page }
}

type GamePlanResult = {
  prepared: boolean
  generated: string[]
  errors: string[]
  reviewItemId?: string
}

function clicksFromExpected(expected: string): number {
  const m = expected.match(/(\d[\d,]*)/)
  return m ? Number(m[1].replace(/,/g, '')) : 0
}

/** Merge all recommendations for a page into one review-queue item. */
async function syncGamePlanReviewItem(
  siteId: string,
  opts: { title: string; opportunityId?: string; findingId?: string },
  path: string,
  generated: string[],
): Promise<string> {
  const displayPath = urlPath(normalizeUrl(path))
  const page = await loadPageForPath(siteId, path)
  const recs = await loadRecommendationsForPath(siteId, path)
  const diff = buildReviewDiff(displayPath, recs, {
    title: page?.title ?? null,
    metaDesc: page?.metaDesc ?? null,
    contentSnippet: page?.contentHtml?.slice(0, 500) ?? null,
  })
  const wpPlugins = await prisma.siteFact.findMany({ where: { siteId, kind: 'wp_plugin' } })
  const seoSummary = summarizeSeoPlugins(wpPlugins.map((p) => ({ key: p.key, value: p.value })))
  await prisma.reviewItem.deleteMany({
    where: {
      siteId,
      detail: displayPath,
      actionKind: { in: ['meta_rewrite', 'content_update'] },
      executedAt: null,
    },
  })
  const review = await prisma.reviewItem.create({
    data: {
      siteId,
      title: opts.title,
      detail: displayPath,
      type: 'Content',
      risk: 'Low',
      reviewer: 'Unassigned',
      dest: seoPublishDest(seoSummary),
      status: 'Pending',
      actionKind: 'content_update',
      findingId: opts.findingId ?? null,
      payloadJson: JSON.stringify({
        kind: 'content_update',
        path: displayPath,
        generated,
        diff,
        opportunityId: opts.opportunityId ?? null,
      }),
    },
  })
  return review.id
}

/**
 * On-demand game plan for one opportunity: everything the user needs to act —
 * title, meta, headings, body, FAQ, schema, internal links (page updates), or a
 * blog draft / Elementor section for new-content opportunities.
 */
async function prepareOpportunityGamePlan(siteId: string, opp: NonNullable<OppRow>): Promise<GamePlanResult> {
  const generated: string[] = []
  const errors: string[] = []

  if (opp.type === 'New page') {
    const keywordMatch = opp.title.match(/"([^"]+)"/) ?? opp.why.match(/"([^"]+)"/)
    const keyword = keywordMatch?.[1] ?? opp.title
    try {
      const post = await writeBlogForKeyword(siteId, keyword, null, clicksFromExpected(opp.expected))
      await prisma.opportunity.update({ where: { id: opp.id }, data: { status: 'Drafted' } })
      return { prepared: true, generated: ['blog_post'], errors: [], reviewItemId: undefined }
    } catch (err) {
      return { prepared: false, generated: [], errors: [(err as Error).message.slice(0, 200)] }
    }
  }

  if (opp.type === 'Technical') {
    return {
      prepared: false,
      generated: [],
      errors: ['This change is manual. Follow the diagnosis, then mark done when complete.'],
    }
  }

  const path = opp.page.split(' ')[0]

  try {
    await draftMetaForOpportunity(siteId, opp)
    generated.push('title', 'meta')
  } catch (err) {
    errors.push(`title/meta: ${(err as Error).message.slice(0, 120)}`)
  }

  const contentRes = await generatePageContentUpdates(siteId, path, ALL_CONTENT_TYPES, { skipReview: true })
  generated.push(...contentRes.generated)
  errors.push(...contentRes.errors)

  if (generated.length === 0) {
    if (errors.length) throw new Error(errors[0])
    return { prepared: false, generated, errors }
  }

  const reviewItemId = await syncGamePlanReviewItem(
    siteId,
    { title: opp.title, opportunityId: opp.id },
    path,
    generated,
  )
  await prisma.opportunity.update({ where: { id: opp.id }, data: { status: 'Drafted' } })
  return { prepared: true, generated, errors, reviewItemId }
}

type AutonomousResult = {
  ok: boolean
  stage: 'prepared' | 'approved' | 'verified' | 'blocked'
  reviewItemId?: string
  generated: string[]
  errors: string[]
  readiness: PublishReadiness | null
  requiresHumanPublish: boolean
  message: string
}

/**
 * Autonomous run for one opportunity, up to a VERIFIED DRAFT.
 * Generates every artifact, auto-approves the review item, then proves each
 * planned change lands (readiness pre-flight). It deliberately STOPS before the
 * live write: clinical/YMYL content and DRAFT_ONLY_DEFAULT policy require a human
 * to click Publish. The live post-push verification runs at that publish step.
 */
async function runAutonomousOpportunity(
  siteId: string,
  opp: NonNullable<OppRow>,
): Promise<AutonomousResult> {
  const plan = await prepareOpportunityGamePlan(siteId, opp)
  if (!plan.prepared || !plan.reviewItemId) {
    return {
      ok: false,
      stage: 'blocked',
      generated: plan.generated,
      errors: plan.errors.length ? plan.errors : ['Nothing to prepare for this opportunity'],
      readiness: null,
      requiresHumanPublish: false,
      message:
        plan.generated.includes('blog_post')
          ? 'New page drafted — review the blog draft, then publish.'
          : 'Could not prepare this opportunity automatically.',
    }
  }

  const reviewItemId = plan.reviewItemId
  const item = await prisma.reviewItem.findUnique({ where: { id: reviewItemId } })
  const path = item?.detail ?? opp.page.split(' ')[0]

  // Readiness pre-flight BEFORE approving, so a broken payload never gets approved.
  let readiness: PublishReadiness | null = null
  try {
    readiness = await buildPublishReadiness(siteId, path)
  } catch (err) {
    readiness = {
      ok: false,
      checkedAt: new Date().toISOString(),
      path,
      usesElementor: false,
      checks: [{ label: 'Readiness', ok: false, detail: (err as Error).message.slice(0, 160) }],
    }
  }

  await prisma.reviewItem.update({
    where: { id: reviewItemId },
    data: { readinessJson: JSON.stringify(readiness) },
  })

  if (!readiness.ok) {
    return {
      ok: false,
      stage: 'blocked',
      reviewItemId,
      generated: plan.generated,
      errors: plan.errors,
      readiness,
      requiresHumanPublish: false,
      message: 'Prepared, but the readiness check found gaps — not auto-approved. Review the flagged items.',
    }
  }

  // Payload is provably complete → auto-approve to the verified-draft stage.
  const user = null
  await prisma.reviewItem.update({
    where: { id: reviewItemId },
    data: { status: 'Approved', decidedAt: new Date(), decidedById: user },
  })
  await markPageWorkComplete(siteId, path, { findingId: item?.findingId ?? null })

  return {
    ok: true,
    stage: 'verified',
    reviewItemId,
    generated: plan.generated,
    errors: plan.errors,
    readiness,
    requiresHumanPublish: true,
    message: 'Verified draft ready. Every change was proven to land. Click Publish to push live.',
  }
}

/**
 * On-demand game plan for a unified-audit finding (same artifacts as opportunities).
 */
async function prepareFindingGamePlan(siteId: string, findingId: string): Promise<GamePlanResult> {
  const finding = await prisma.finding.findUnique({ where: { id: findingId } })
  if (!finding || finding.siteId !== siteId) throw new Error('Finding not found')

  const actions = JSON.parse(finding.actionsJson) as { kind: ActionKind; label: string; updateTypes?: string[] }[]
  const kind = actions[0]?.kind
  if (!kind) throw new Error('No action available for this finding')

  if (kind === 'blog_post') {
    const keyword = finding.subjectType === 'query' ? finding.subjectRef : finding.title
    const post = await writeBlogForKeyword(siteId, keyword, null, finding.estMonthlyClicks)
    await prisma.finding.update({ where: { id: findingId }, data: { status: 'drafted' } })
    return { prepared: true, generated: ['blog_post'], errors: [] }
  }

  if (kind === 'elementor_page' || kind === 'elementor_section') {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/findings/${findingId}/draft-fix`,
      payload: { actionKind: kind },
    })
    if (res.statusCode !== 200) throw new Error((res.json() as { error?: string })?.error ?? 'Elementor generation failed')
    const body = res.json() as { reviewId?: string; kind: string }
    return { prepared: true, generated: [kind], errors: [], reviewItemId: body.reviewId }
  }

  if (kind === 'meta_rewrite' || kind === 'content_update') {
    const path = finding.subjectRef
    const generated: string[] = []
    const errors: string[] = []
    const opp = await prisma.opportunity.findFirst({ where: { siteId, page: { startsWith: path } } })
    if (opp) {
      try {
        await draftMetaForOpportunity(siteId, opp)
        generated.push('title', 'meta')
      } catch (err) {
        errors.push(`title/meta: ${(err as Error).message.slice(0, 120)}`)
      }
    } else {
      const seg = lastSegment(path)
      const queries = await topQueriesForSlug(siteId, seg)
      const page = await loadPageForPath(siteId, path)
      const authorContext = await loadAuthorContext(siteId)
      try {
        const res = await generateMetaRewrite({
          path,
          pageTitle: page?.title ?? null,
          currentMetaTitle: page?.metaTitle ?? null,
          currentMetaDesc: page?.metaDesc ?? null,
          contentSnippet: page?.contentHtml ? stripHtml(page.contentHtml).slice(0, 1500) : null,
          diagnosis: finding.title,
          queries,
          authorContext,
        })
        await prisma.recommendation.deleteMany({ where: { siteId, page: path, tab: { in: ['title', 'meta'] } } })
        await prisma.recommendation.createMany({
          data: [
            {
              siteId,
              tab: 'title',
              page: path,
              current: page?.metaTitle ?? page?.title ?? '(none)',
              suggested: res.titleTag,
              reason: res.titleReason,
              queries: JSON.stringify(res.targetQueries),
              chars: true,
            },
            {
              siteId,
              tab: 'meta',
              page: path,
              current: page?.metaDesc ?? '(none)',
              suggested: res.metaDescription,
              reason: res.metaReason,
              queries: JSON.stringify(res.targetQueries),
              chars: true,
            },
          ],
        })
        generated.push('title', 'meta')
      } catch (err) {
        errors.push(`title/meta: ${(err as Error).message.slice(0, 120)}`)
      }
    }
    const contentRes = await generatePageContentUpdates(siteId, path, ALL_CONTENT_TYPES, { skipReview: true })
    generated.push(...contentRes.generated)
    errors.push(...contentRes.errors)
    if (generated.length === 0) {
      if (errors.length) throw new Error(errors[0])
      return { prepared: false, generated, errors }
    }
    const reviewItemId = await syncGamePlanReviewItem(
      siteId,
      { title: finding.title, findingId },
      path,
      generated,
    )
    await prisma.finding.update({ where: { id: findingId }, data: { status: 'drafted' } })
    return { prepared: true, generated, errors, reviewItemId }
  }

  const res = await app.inject({
    method: 'POST',
    url: `/api/sites/${siteId}/findings/${findingId}/draft-fix`,
    payload: { actionKind: kind },
  })
  if (res.statusCode !== 200) throw new Error((res.json() as { error?: string })?.error ?? 'Could not prepare this finding')
  const body = res.json() as { reviewId?: string; kind: string }
  return { prepared: true, generated: [kind], errors: [], reviewItemId: body.reviewId }
}

app.post('/api/sites/:siteId/findings/:findingId/prepare-game-plan', async (req, reply) => {
  const { siteId, findingId } = req.params as { siteId: string; findingId: string }
  try {
    return await prepareFindingGamePlan(siteId, findingId)
  } catch (err) {
    app.log.error({ err }, 'Finding game plan failed')
    return reply.code(502).send({ error: (err as Error).message })
  }
})

app.post('/api/sites/:siteId/pages/generate-updates', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const body = req.body as { path?: string; types?: ContentUpdateType[]; skipReview?: boolean }
  const path = (body.path ?? '').trim()
  if (!path) return reply.code(400).send({ error: 'A page path is required' })
  const types = (body.types?.length ? body.types : ALL_CONTENT_TYPES).filter((t) =>
    ALL_CONTENT_TYPES.includes(t),
  )
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })
  return generatePageContentUpdates(siteId, path, types, { skipReview: body.skipReview })
})

// Phase 5: generate an importable Elementor section with Claude, styled to
// match the site's existing builder data.
app.post('/api/sites/:siteId/elementor/generate', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const body = req.body as { request?: string; placement?: string }
  const request = (body.request ?? '').trim()
  if (!request) return reply.code(400).send({ error: 'Describe the section to build' })

  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })

  // Use a real synced page's Elementor data as the styling reference.
  const stylePage = await prisma.page.findFirst({
    where: { siteId, elementorData: { not: null } },
    orderBy: { updatedAt: 'desc' },
  })

  let result
  try {
    result = await generateElementorSection({
      request,
      placement: body.placement?.trim() || null,
      styleReference: stylePage?.elementorData ?? null,
    })
  } catch (err) {
    app.log.error({ err }, 'Elementor generation failed')
    return reply.code(502).send({ error: (err as Error).message })
  }

  const json = JSON.stringify(result.elementor, null, 2)
  const sizeKb = `${(Buffer.byteLength(json, 'utf8') / 1024).toFixed(1)} KB`
  const section = await prisma.elementorSection.create({
    data: {
      siteId,
      name: result.name,
      status: 'Generated · validated',
      ok: true,
      useCase: result.useCase,
      placement: result.placement,
      notes: result.notes,
      rationale: result.rationale,
      size: sizeKb,
      json,
    },
  })
  return { id: section.id, name: section.name, size: sizeKb, styledFrom: stylePage?.slug ?? null }
})

// Phase 5: competitor analysis — fetch competitor URLs, study the gap with Claude.
function extractCompetitorPage(url: string, html: string): CompetitorPage {
  const pick = (re: RegExp) => (html.match(re)?.[1] ?? '').trim() || null
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const metaDesc =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
    pick(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)
  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter(Boolean)
    .slice(0, 30)
  const text = stripHtml(html)
  return {
    url,
    title: title ? stripHtml(title) : null,
    metaDesc,
    headings,
    wordCount: text ? text.split(/\s+/).length : 0,
    textSnippet: text.slice(0, 1500),
  }
}

async function fetchCompetitorPage(url: string): Promise<CompetitorPage> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GroundworkSEO/1.0)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  const html = await res.text()
  return extractCompetitorPage(url, html)
}

app.get('/api/sites/:siteId/competitors/scans', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const rows = await prisma.competitorScan.findMany({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  return rows.map((r) => ({
    id: r.id,
    targetKeyword: r.targetKeyword,
    ourPath: r.ourPath,
    urls: JSON.parse(r.urls),
    findings: JSON.parse(r.findings),
    createdAt: r.createdAt,
  }))
})

app.post('/api/sites/:siteId/competitors/analyze', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const body = req.body as { targetKeyword?: string; urls?: string[]; ourPath?: string }
  const targetKeyword = (body.targetKeyword ?? '').trim()
  const urls = (body.urls ?? []).map((u) => u.trim()).filter(Boolean).slice(0, 5)
  if (!targetKeyword) return reply.code(400).send({ error: 'A target keyword is required' })
  if (urls.length === 0) return reply.code(400).send({ error: 'Add at least one competitor URL' })

  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })

  // Fetch competitor pages (best-effort; skip any that fail).
  const competitors: CompetitorPage[] = []
  const failures: string[] = []
  for (const url of urls) {
    try {
      competitors.push(await fetchCompetitorPage(url))
    } catch (err) {
      failures.push(`${url} (${(err as Error).message})`)
    }
  }
  if (competitors.length === 0) {
    return reply.code(502).send({ error: `Couldn't fetch any competitor page: ${failures.join(', ')}` })
  }

  // Ground with our own page if a path was given.
  const ourPath = body.ourPath?.trim() || null
  const seg = ourPath ? lastSegment(ourPath) : ''
  const ourPage = ourPath ? await loadPageForPath(siteId, ourPath) : null

  let findings
  try {
    findings = await analyzeCompetitors({
      targetKeyword,
      ourPath,
      ourTitle: ourPage?.metaTitle ?? ourPage?.title ?? null,
      ourSnippet: ourPage?.contentHtml ? stripHtml(ourPage.contentHtml).slice(0, 1500) : null,
      competitors,
    })
  } catch (err) {
    app.log.error({ err }, 'Competitor analysis failed')
    return reply.code(502).send({ error: (err as Error).message })
  }

  const scan = await prisma.competitorScan.create({
    data: {
      siteId,
      targetKeyword,
      ourPath,
      urls: JSON.stringify(urls),
      findings: JSON.stringify(findings),
    },
  })
  await runSiteAudits(siteId).catch((err) => app.log.warn({ err }, 'Audit run after competitor analyze failed'))
  return {
    id: scan.id,
    targetKeyword,
    ourPath,
    urls,
    findings,
    createdAt: scan.createdAt,
    fetched: competitors.length,
    failures,
  }
})

// ---------------------------------------------------------------------------
// Phase 6: Content Studio — generate net-new blog posts from real search gaps.
// ---------------------------------------------------------------------------

type BlogRow = Awaited<ReturnType<typeof prisma.blogPost.findFirst>>
function blogToJson(p: NonNullable<BlogRow>) {
  return {
    id: p.id,
    targetKeyword: p.targetKeyword,
    title: p.title,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    slug: p.slug,
    excerpt: p.excerpt,
    bodyHtml: p.bodyHtml,
    faqs: JSON.parse(p.faqsJson) as { q: string; a: string }[],
    keywordCluster: JSON.parse(p.clusterJson) as {
      primary?: string
      supporting?: { keyword: string; monthlyImpressions: number | null }[]
    },
    internalLinks: JSON.parse(p.internalLinks) as { path: string; anchor: string }[],
    inboundLinks: JSON.parse(p.inboundLinksJson) as { path: string; anchor: string }[],
    categories: JSON.parse(p.categoriesJson) as string[],
    imageQuery: p.imageQuery,
    imageUrl: p.imageUrl,
    imageAlt: p.imageAlt,
    imageCredit: p.imageCredit,
    estClicks: p.estClicks,
    status: p.status,
    wpPostId: p.wpPostId,
    wpEditUrl: p.wpEditUrl,
    reviewerName: p.reviewerName,
    reviewerCredentials: p.reviewerCredentials,
    reviewApprovedAt: p.reviewApprovedAt,
    contentUpdatedAt: p.contentUpdatedAt,
    createdAt: p.createdAt,
  }
}

/** GSC queries overlapping the keyword's significant tokens — the real demand to write to. */
async function relatedQueriesForKeyword(siteId: string, keyword: string): Promise<GscQuerySample[]> {
  const tokens = significantTokens(keyword)
  if (!tokens.length) return []
  const rows = await prisma.gscRow.findMany({
    where: { siteId, query: { not: null } },
    orderBy: { impressions: 'desc' },
    take: 6000,
  })
  const byQuery = new Map<string, { impr: number; clicks: number; posw: number }>()
  for (const r of rows) {
    const q = r.query!
    if (!tokens.some((t) => q.toLowerCase().includes(t))) continue
    const a = byQuery.get(q) ?? { impr: 0, clicks: 0, posw: 0 }
    a.impr += r.impressions
    a.clicks += r.clicks
    a.posw += r.position * r.impressions
    byQuery.set(q, a)
  }
  return [...byQuery.entries()]
    .map(([query, a]) => ({
      query,
      impressions: a.impr,
      clicks: a.clicks,
      ctr: a.impr > 0 ? a.clicks / a.impr : 0,
      position: a.impr > 0 ? a.posw / a.impr : 0,
    }))
    .sort((x, y) => y.impressions - x.impressions || x.query.localeCompare(y.query))
    .slice(0, 12)
}

/** Blog topic ideas: real query demand where we rank weakly and have no
 *  dedicated page — net-new content would win traffic we're currently leaking. */
async function computeBlogIdeas(siteId: string) {
  const [rows, pageRows] = await Promise.all([
    prisma.gscRow.findMany({ where: { siteId, query: { not: null } } }),
    prisma.page.findMany({ where: { siteId }, select: PAGE_LITE_SELECT }),
  ])
  const pages = pageRows.map(toPageLite).filter((p) => p.url)
  const pathTokens = new Set<string>()
  for (const p of pages) {
    const segments = urlPath(p.url!).split('/').filter(Boolean)
    for (const seg of segments) for (const t of significantTokens(seg.replace(/-/g, ' '))) pathTokens.add(t)
  }

  const byQuery = new Map<string, { impr: number; clicks: number; posw: number }>()
  for (const r of rows) {
    const q = r.query!
    const a = byQuery.get(q) ?? { impr: 0, clicks: 0, posw: 0 }
    a.impr += r.impressions
    a.clicks += r.clicks
    a.posw += r.position * r.impressions
    byQuery.set(q, a)
  }
  // query-level rows span ~120 days → monthly factor.
  const monthly = 30 / 120
  return [...byQuery.entries()]
    .map(([query, a]) => ({ query, impr: a.impr, pos: a.impr > 0 ? a.posw / a.impr : 0 }))
    // real demand, but we rank off page 1 → a dedicated post could win it
    .filter((x) => x.impr >= 200 && x.pos > 10)
    // drop queries already well-covered by an existing page slug
    .filter((x) => {
      const toks = significantTokens(x.query)
      return !(toks.length > 0 && toks.every((t) => pathTokens.has(t)))
    })
    .map((x) => ({
      keyword: x.query,
      monthlyImpressions: Math.round(x.impr * monthly),
      position: Number(x.pos.toFixed(1)),
      estClicks: Math.round(benchmarkCtr(6) * x.impr * monthly * 0.5),
    }))
    .sort((a, b) => b.estClicks - a.estClicks || a.keyword.localeCompare(b.keyword))
    .slice(0, 12)
}

/** Topic supply governor state for a site: keyword-universe coverage + velocity. */
async function siteGovernor(siteId: string) {
  const policy = await resolveSitePolicy(siteId)
  const [gscRows, pageRows, postsLast30d] = await Promise.all([
    prisma.gscRow.findMany({ where: { siteId, query: { not: null } } }),
    prisma.page.findMany({ where: { siteId }, select: PAGE_LITE_SELECT }),
    prisma.blogPost.count({
      where: { siteId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
  ])
  const pages = pageRows.map(toPageLite)
  // Aggregate the current window's query demand.
  let maxTs = 0
  for (const r of gscRows) if (r.date.getTime() > maxTs) maxTs = r.date.getTime()
  const curStart = new Date(maxTs - (policy.windowDays - 1) * 24 * 60 * 60 * 1000)
  const byQuery = new Map<string, { impr: number; posw: number }>()
  for (const r of gscRows) {
    if (r.date < curStart) continue
    const a = byQuery.get(r.query!) ?? { impr: 0, posw: 0 }
    a.impr += r.impressions
    a.posw += r.position * r.impressions
    byQuery.set(r.query!, a)
  }
  const queries: QueryAggLite[] = [...byQuery.entries()].map(([query, a]) => ({
    query,
    impressions: a.impr,
    position: a.impr > 0 ? a.posw / a.impr : 0,
  }))
  return computeGovernor(queries, pages, postsLast30d, policy)
}

async function resolveSitePolicy(siteId: string) {
  return resolveContentPolicy(siteId)
}

/**
 * The refresh queue — the Content Engine's primary output. Refreshing existing
 * URLs beats publishing new ones on ROI, so this ranks every page's recommended
 * action (refresh / rewrite / consolidate / prune / leave alone) by commercial
 * value. Computed on demand from cached GSC/GA4 data; recommends only, never
 * writes to the client site.
 */
app.get('/api/sites/:siteId/content/refresh-queue', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const policy = await resolveSitePolicy(siteId)
  const [gscRows, ga4Rows, pageRows] = await Promise.all([
    prisma.gscRow.findMany({ where: { siteId } }),
    prisma.ga4Row.findMany({ where: { siteId }, select: { date: true, landingPage: true, conversions: true } }),
    prisma.page.findMany({ where: { siteId }, select: PAGE_LITE_SELECT }),
  ])
  const pages = pageRows.map(toPageLite)
  let queue = evaluateSite(gscRows, ga4Rows, pages, policy)
  queue = await validateConsolidateTargets(queue)
  const governor = await siteGovernor(siteId)
  const sufficiency = computeDataSufficiency(gscRows, ga4Rows, pages, policy)
  const reconciliation = reconcile(queue, pages)
  if (!reconciliation.balanced) {
    app.log.warn({ siteId, reconciliation }, 'Content Engine reconciliation FAILED — queue marked untrusted')
  }
  // With no conversion tracking, ranking on conversions would sort on noise —
  // the engine drops to a traffic-and-intent-only score and we label it.
  const priorityMode = sufficiency.ga4Status === 'none' ? 'traffic-intent-only' : 'value-weighted'
  const counts: Record<string, number> = {}
  for (const r of queue) counts[r.action] = (counts[r.action] ?? 0) + 1

  // Store the data profile so the confidence panel reads a consistent snapshot.
  const profileData = {
    gscHistoryMonths: sufficiency.gscHistoryMonths,
    gscCoverageGaps: JSON.stringify(sufficiency.gscCoverageGaps),
    pagesTotal: sufficiency.pagesTotal,
    pagesWithGscData: sufficiency.pagesWithGscData,
    ga4Conversions: sufficiency.ga4Conversions,
    ga4Status: sufficiency.ga4Status,
    keywordUniverseSize: governor.universeSize,
    universeSeededAt: sufficiency.lastDataDate ? new Date(sufficiency.lastDataDate) : null,
  }
  await prisma.contentDataProfile.upsert({
    where: { siteId },
    create: { siteId, ...profileData },
    update: profileData,
  })

  return {
    queue,
    governor,
    sufficiency: {
      ...sufficiency,
      keywordUniverseSize: governor.universeSize,
      universeSource: `Search Console demand, ${policy.windowDays}-day window ending ${sufficiency.lastDataDate ?? '—'}`,
      pruneBarMonths: policy.pruneMinHistoryMonths,
      pagesUnresolved: pageRows.filter((p) => p.unresolved || !p.url).length,
    },
    reconciliation,
    trusted: reconciliation.balanced,
    priorityMode,
    counts,
    policy: { windowDays: policy.windowDays },
  }
})

/** Full GSC history for one page (monthly) + its inbound internal links — the
 *  evidence a human must see before confirming a destructive action. */
app.get('/api/sites/:siteId/content/page-history', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const { path } = req.query as { path?: string }
  if (!path) return reply.code(400).send({ error: 'path is required' })

  const seg = lastSegment(path)
  const [gscRows, pages] = await Promise.all([
    prisma.gscRow.findMany({ where: { siteId, query: null, ...(seg ? { page: { contains: seg } } : {}) } }),
    prisma.page.findMany({ where: { siteId }, select: { slug: true, title: true, contentHtml: true, url: true, type: true } }),
  ])
  const mine = gscRows.filter((r) => pagePath(r.page) === path)
  const byMonth = new Map<string, { clicks: number; impressions: number }>()
  for (const r of mine) {
    const key = r.date.toISOString().slice(0, 7)
    const m = byMonth.get(key) ?? { clicks: 0, impressions: 0 }
    m.clicks += r.clicks
    m.impressions += r.impressions
    byMonth.set(key, m)
  }
  const monthly = [...byMonth.entries()]
    .map(([month, m]) => ({ month, ...m }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // Inbound internal links: pages whose synced content links to this path.
  const inboundLinks = pages
    .filter((p) => p.slug !== seg && p.contentHtml && (p.contentHtml.includes(`href="${path}`) || p.contentHtml.includes(`/${seg}`)))
    .map((p) => ({ path: pageDisplayPath(p), title: p.title }))
    .slice(0, 20)

  return {
    path,
    monthly,
    inboundLinks,
    firstSeen: monthly[0]?.month ?? null,
    lastSeen: monthly[monthly.length - 1]?.month ?? null,
  }
})

/**
 * Stage a destructive action (prune / consolidate) for human execution. One item
 * at a time, no bulk path exists. The server re-validates the sufficiency gate —
 * the UI cannot stage what the engine wouldn't recommend. Recommends only: this
 * creates a Review Queue task; it never deletes or merges anything on the site.
 */
app.post('/api/sites/:siteId/content/stage-destructive', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const body = req.body as { path?: string; action?: string; confirmed?: boolean }
  const path = (body.path ?? '').trim()
  if (!path || (body.action !== 'prune' && body.action !== 'consolidate')) {
    return reply.code(400).send({ error: 'path and action (prune | consolidate) are required' })
  }
  if (body.confirmed !== true) {
    return reply.code(400).send({ error: 'Destructive actions require explicit confirmation.' })
  }

  // Re-validate against the live engine — never trust the client's claim.
  const [gscRows, ga4Rows, pageRows] = await Promise.all([
    prisma.gscRow.findMany({ where: { siteId } }),
    prisma.ga4Row.findMany({ where: { siteId }, select: { date: true, landingPage: true, conversions: true } }),
    prisma.page.findMany({ where: { siteId }, select: PAGE_LITE_SELECT }),
  ])
  const pages = pageRows.map(toPageLite)
  const policy = await resolveSitePolicy(siteId)
  let queue = await validateConsolidateTargets(evaluateSite(gscRows, ga4Rows, pages, policy))
  const rec = queue.find((r) => r.path === path || urlsEqual(r.path, path))
  const reconciliation = reconcile(queue, pages)
  if (!reconciliation.balanced) {
    app.log.warn({ siteId, reconciliation }, 'Content Engine reconciliation FAILED at stage-destructive')
  }
  if (!rec || rec.action !== body.action) {
    return reply.code(409).send({
      error: `The engine ${rec ? `now recommends "${rec.action}"` : 'has no recommendation'} for ${path} — ${rec?.action === 'insufficient_data' ? rec.reason : 'refusing to stage a destructive action it does not support.'}`,
    })
  }

  const item = await prisma.reviewItem.create({
    data: {
      siteId,
      title: `${body.action === 'prune' ? 'Prune' : 'Consolidate'} — ${path}`,
      detail:
        body.action === 'consolidate' && rec.consolidateInto
          ? `301 ${path} → ${rec.consolidateInto} · ${rec.reason}`
          : rec.reason,
      type: body.action === 'prune' ? 'Prune' : 'Consolidate',
      risk: 'High',
      reviewer: 'Unassigned',
      dest: 'WordPress · manual action',
      status: 'Pending',
    },
  })
  return { staged: true, reviewItemId: item.id, action: body.action, path, consolidateInto: rec.consolidateInto }
})

app.get('/api/sites/:siteId/blog/topic-ideas', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const governor = await siteGovernor(siteId)
  // Above the saturation threshold (or the velocity ceiling) recommend ZERO new
  // posts — no filler topics to fill a queue.
  const ideas = governor.allowNewPosts ? await computeBlogIdeas(siteId) : []
  return { governor, ideas }
})

/**
 * Write a full blog post for a keyword with Claude — grounded in the real GSC
 * demand cluster, competitor gaps, and internal-link targets — and persist it as
 * a Draft BlogPost. Reused by the manual generate route and the auto-write on
 * refresh (the flagship "your next blog is already written" flow).
 */
async function writeBlogForKeyword(siteId: string, keyword: string, angle: string | null, estClicks: number | null) {
  const [relatedQueries, pages, latestScan, authorContext] = await Promise.all([
    relatedQueriesForKeyword(siteId, keyword),
    prisma.page.findMany({ where: { siteId }, select: { slug: true, title: true } }),
    prisma.competitorScan.findFirst({ where: { siteId }, orderBy: { createdAt: 'desc' } }),
    loadAuthorContext(siteId),
  ])
  const internalLinkTargets = pages.filter((p) => p.url).map((p) => ({ path: urlPath(p.url!), title: p.title }))
  let competitorNotes: string | null = null
  if (latestScan) {
    try {
      const f = JSON.parse(latestScan.findings) as { gaps?: { title: string }[] }
      competitorNotes = (f.gaps ?? []).slice(0, 5).map((g) => `- ${g.title}`).join('\n') || null
    } catch {
      competitorNotes = null
    }
  }

  const result = await generateBlogPost({
    targetKeyword: keyword,
    angle,
    relatedQueries,
    internalLinkTargets,
    competitorNotes,
    authorContext,
  })

  // Attach real monthly search demand to each supporting keyword in the cluster.
  const imprByQuery = new Map(relatedQueries.map((q) => [q.query.toLowerCase(), q.impressions]))
  const supporting = result.keywordCluster.supporting.map((kw) => {
    const impr = imprByQuery.get(kw.toLowerCase())
    return { keyword: kw, monthlyImpressions: impr != null ? Math.round((impr * 30) / 120) : null }
  })
  const cluster = { primary: result.keywordCluster.primary || keyword, supporting }

  return prisma.blogPost.create({
    data: {
      siteId,
      targetKeyword: keyword,
      title: result.title,
      metaTitle: result.metaTitle,
      metaDescription: result.metaDescription,
      slug: result.slug,
      excerpt: result.excerpt,
      bodyHtml: result.bodyHtml,
      faqsJson: JSON.stringify(result.faqs),
      clusterJson: JSON.stringify(cluster),
      internalLinks: JSON.stringify(result.internalLinks),
      inboundLinksJson: JSON.stringify(result.inboundLinks),
      categoriesJson: JSON.stringify(result.categories),
      imageQuery: result.imageQuery,
      estClicks,
      status: 'Draft',
    },
  })
}

app.get('/api/sites/:siteId/blog', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const rows = await prisma.blogPost.findMany({ where: { siteId }, orderBy: { createdAt: 'desc' } })
  return rows.map(blogToJson)
})

app.get('/api/sites/:siteId/blog/:postId', async (req, reply) => {
  const { siteId, postId } = req.params as { siteId: string; postId: string }
  const p = await prisma.blogPost.findUnique({ where: { id: postId } })
  if (!p || p.siteId !== siteId) return reply.code(404).send({ error: 'Post not found' })
  return blogToJson(p)
})

app.post('/api/sites/:siteId/blog/generate', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const body = req.body as { keyword?: string; angle?: string; estClicks?: number }
  const keyword = (body.keyword ?? '').trim()
  if (!keyword) return reply.code(400).send({ error: 'A target keyword / topic is required' })
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })
  const auditRun = await runSiteAudits(siteId).catch(() => null)
  if (auditRun && !auditRun.governor.allowNewPosts) {
    return reply.code(403).send({ error: auditRun.governor.reason ?? 'Publishing paused by topic supply governor' })
  }
  try {
    const post = await writeBlogForKeyword(siteId, keyword, body.angle?.trim() || null, body.estClicks ?? null)
    return blogToJson(post)
  } catch (err) {
    app.log.error({ err }, 'Blog generation failed')
    return reply.code(502).send({ error: (err as Error).message })
  }
})

// Pick a Pexels featured image for a post (preview/swap before publishing).
app.post('/api/sites/:siteId/blog/:postId/image', async (req, reply) => {
  const { siteId, postId } = req.params as { siteId: string; postId: string }
  const p = await prisma.blogPost.findUnique({ where: { id: postId } })
  if (!p || p.siteId !== siteId) return reply.code(404).send({ error: 'Post not found' })
  let photo
  try {
    photo = await searchPexels(p.imageQuery || p.targetKeyword)
  } catch (err) {
    return reply.code(502).send({ error: (err as Error).message })
  }
  if (!photo) return reply.code(404).send({ error: 'No stock photo found for this topic' })
  const updated = await prisma.blogPost.update({
    where: { id: postId },
    data: { imageUrl: photo.url, imageAlt: p.title, imageCredit: photo.credit },
  })
  return blogToJson(updated)
})

// YMYL approval: med spa content requires a named, credentialed reviewer before
// it can publish. This records who approved it and when; the publish route (and
// a SQLite trigger underneath it) refuse to proceed without it.
app.post('/api/sites/:siteId/blog/:postId/approve', async (req, reply) => {
  const { siteId, postId } = req.params as { siteId: string; postId: string }
  const body = req.body as { reviewerName?: string; reviewerCredentials?: string }
  const reviewerName = (body.reviewerName ?? '').trim()
  const reviewerCredentials = (body.reviewerCredentials ?? '').trim()
  if (!reviewerName || !reviewerCredentials) {
    return reply.code(400).send({
      error: 'YMYL content needs a named reviewer and their credentials (e.g. "Sarah Lopez, RN"). "Staff writer" does not meet the E-E-A-T bar.',
    })
  }
  const p = await prisma.blogPost.findUnique({ where: { id: postId } })
  if (!p || p.siteId !== siteId) return reply.code(404).send({ error: 'Post not found' })
  const updated = await prisma.blogPost.update({
    where: { id: postId },
    data: { reviewerName, reviewerCredentials, reviewApprovedAt: new Date() },
  })
  return blogToJson(updated)
})

// Upload a featured image manually (data URL) instead of picking from Pexels.
app.post('/api/sites/:siteId/blog/:postId/image/upload', async (req, reply) => {
  const { siteId, postId } = req.params as { siteId: string; postId: string }
  const { dataUrl } = req.body as { dataUrl?: string }
  if (!dataUrl || !/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) {
    return reply.code(400).send({ error: 'Provide a PNG, JPG, or WebP image.' })
  }
  const p = await prisma.blogPost.findUnique({ where: { id: postId } })
  if (!p || p.siteId !== siteId) return reply.code(404).send({ error: 'Post not found' })
  const updated = await prisma.blogPost.update({
    where: { id: postId },
    data: { imageUrl: dataUrl, imageAlt: p.title, imageCredit: 'Uploaded image' },
  })
  return blogToJson(updated)
})

// Publish a post to WordPress as a DRAFT in Posts — uploads the featured image,
// then creates the draft with body + FAQ, meta description (excerpt), slug, and
// categories.
app.post('/api/sites/:siteId/blog/:postId/publish', async (req, reply) => {
  const { siteId, postId } = req.params as { siteId: string; postId: string }
  const body = (req.body ?? {}) as { isSubstantive?: boolean }
  const p = await prisma.blogPost.findUnique({ where: { id: postId } })
  if (!p || p.siteId !== siteId) return reply.code(404).send({ error: 'Post not found' })
  // YMYL hard gate (also enforced by a SQLite trigger at the data layer).
  if (!p.reviewerName?.trim() || !p.reviewerCredentials?.trim() || !p.reviewApprovedAt) {
    return reply.code(400).send({
      error: 'This is YMYL content — a named, credentialed reviewer must approve it before it can publish.',
    })
  }
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site?.wpBaseUrl || !site.wpUsername || !site.wpAppPasswordEnc) {
    return reply.code(400).send({ error: 'Connect WordPress first (Settings) to publish.' })
  }
  const auth = { baseUrl: site.wpBaseUrl, username: site.wpUsername, appPassword: decrypt(site.wpAppPasswordEnc) }

  // Ensure a featured image (auto-pick from Pexels if none chosen yet).
  let { imageUrl, imageAlt, imageCredit } = p
  if (!imageUrl && hasPexelsKey()) {
    try {
      const photo = await searchPexels(p.imageQuery || p.targetKeyword)
      if (photo) {
        imageUrl = photo.url
        imageAlt = p.title
        imageCredit = photo.credit
      }
    } catch {
      /* publish without an image rather than fail */
    }
  }

  let featuredMediaId: number | null = null
  if (imageUrl) {
    try {
      const media = await uploadWpMedia(auth, imageUrl, `${p.slug || 'featured'}.jpg`, imageAlt ?? p.title)
      featuredMediaId = media.id
    } catch (err) {
      app.log.warn({ err }, 'featured image upload failed; publishing without it')
    }
  }

  // Body = article + an FAQ section (also FAQ-schema-friendly in WP).
  const faqs = JSON.parse(p.faqsJson) as { q: string; a: string }[]
  const faqHtml = faqs.length
    ? `\n<h2>Frequently Asked Questions</h2>\n${faqs.map((f) => `<h3>${f.q}</h3>\n<p>${f.a}</p>`).join('\n')}`
    : ''

  let created
  try {
    created = await createWpDraftPost(auth, {
      title: p.title,
      content: p.bodyHtml + faqHtml,
      excerpt: p.metaDescription,
      slug: p.slug,
      categories: JSON.parse(p.categoriesJson) as string[],
      featuredMediaId,
      existingId: p.wpPostId, // re-publish updates the same post instead of duplicating
    })
  } catch (err) {
    app.log.error({ err }, 'WordPress publish failed')
    return reply.code(502).send({ error: (err as Error).message })
  }

  // Lastmod integrity: the date only advances on a substantive change. A first
  // publish is inherently substantive; a re-publish must say so explicitly or
  // contentUpdatedAt stays put (the SQLite gate enforces the same rule).
  const substantive = p.wpPostId == null || body.isSubstantive === true
  const updated = await prisma.blogPost.update({
    where: { id: postId },
    data: {
      status: 'Published',
      wpPostId: created.id,
      wpEditUrl: created.editUrl,
      imageUrl,
      imageAlt,
      imageCredit,
      isSubstantive: substantive,
      ...(substantive ? { contentUpdatedAt: new Date() } : {}),
    },
  })
  await writeChangeLog({
    siteId,
    page: created.link,
    element: 'blog_post',
    before: null,
    after: p.title,
  })
  return blogToJson(updated)
})

// ---------------------------------------------------------------------------
// Unified Audit → Findings → Actions API
// ---------------------------------------------------------------------------

/** Unified next steps — audits + GSC opportunities, deduped. */
app.get('/api/sites/:siteId/next-steps', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const { limit } = req.query as { limit?: string }
  const n = limit ? Math.min(Number(limit) || 5, 50) : undefined
  return buildNextSteps(siteId, n)
})

/** Master prioritized queue — single source of truth across all audits. */
app.get('/api/sites/:siteId/audit/queue', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const { category, status } = req.query as { category?: string; status?: string }
  let rows = await prisma.finding.findMany({
    where: {
      siteId,
      ...(category && category !== 'All' ? { category } : {}),
      ...(status && status !== 'All' ? { status } : {}),
    },
    orderBy: [{ priorityValue: 'desc' }, { estMonthlyClicks: 'desc' }],
  })
  if (!rows.length) {
    const run = await runSiteAudits(siteId)
    rows = await prisma.finding.findMany({
      where: { siteId },
      orderBy: [{ priorityValue: 'desc' }, { estMonthlyClicks: 'desc' }],
    })
    return {
      findings: rows.map(findingToJson),
      governor: run.governor,
      sufficiency: run.sufficiency,
      counts: run.counts,
      auditCounts: run.auditCounts,
      trusted: true,
    }
  }
  const run = await runSiteAudits(siteId).catch(() => null)
  return {
    findings: rows.filter((r) => r.status !== 'dismissed' && r.status !== 'done').map(findingToJson),
    governor: run?.governor ?? null,
    sufficiency: run?.sufficiency ?? null,
    counts: run?.counts ?? {},
    auditCounts: run?.auditCounts ?? {},
    trusted: true,
  }
})

app.post('/api/sites/:siteId/audit/run', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })
  const run = await runSiteAudits(siteId)
  const rows = await prisma.finding.findMany({
    where: { siteId, status: { notIn: ['dismissed', 'done'] } },
    orderBy: [{ priorityValue: 'desc' }],
  })
  return { findings: rows.map(findingToJson), ...run, persist: run.persist }
})

app.post('/api/sites/:siteId/findings/:findingId/status', async (req, reply) => {
  const { siteId, findingId } = req.params as { siteId: string; findingId: string }
  const body = req.body as { status?: string }
  const status = body.status ?? 'done'
  const f = await prisma.finding.findUnique({ where: { id: findingId } })
  if (!f || f.siteId !== siteId) return reply.code(404).send({ error: 'Finding not found' })
  const updated = await prisma.finding.update({
    where: { id: findingId },
    data: { status, decidedAt: ['done', 'dismissed'].includes(status) ? new Date() : null },
  })
  return findingToJson(updated)
})

/** Generic "Draft fix" — dispatches to the right AI primitive for a Finding. */
app.post('/api/sites/:siteId/findings/:findingId/draft-fix', async (req, reply) => {
  const { siteId, findingId } = req.params as { siteId: string; findingId: string }
  const body = req.body as { actionKind?: ActionKind }
  const finding = await prisma.finding.findUnique({ where: { id: findingId } })
  if (!finding || finding.siteId !== siteId) return reply.code(404).send({ error: 'Finding not found' })

  const actions = JSON.parse(finding.actionsJson) as { kind: ActionKind; label: string; updateTypes?: string[] }[]
  const kind = body.actionKind ?? actions[0]?.kind
  if (!kind) return reply.code(400).send({ error: 'No action available for this finding' })

  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return reply.code(404).send({ error: 'Site not found' })

  let result: Record<string, unknown> = { kind }

  if (kind === 'blog_post') {
    const keyword = finding.subjectType === 'query' ? finding.subjectRef : finding.title
    const post = await writeBlogForKeyword(siteId, keyword, null, finding.estMonthlyClicks)
    result = { kind, blogPostId: post.id, title: post.title }
  } else if (kind === 'meta_rewrite') {
    const path = finding.subjectRef
    const seg = lastSegment(path)
    const opp = await prisma.opportunity.findFirst({ where: { siteId, page: { startsWith: path } } })
    if (opp) await draftMetaForOpportunity(siteId, opp)
    else {
      const queries = await topQueriesForSlug(siteId, seg)
      const page = await loadPageForPath(siteId, path)
      const res = await generateMetaRewrite({
        page: path,
        title: page?.metaTitle ?? page?.title ?? path,
        meta: page?.metaDesc ?? '',
        queries: queries.slice(0, 8),
      })
      await prisma.recommendation.deleteMany({ where: { siteId, page: path, tab: { in: ['title', 'meta'] } } })
      await prisma.recommendation.createMany({
        data: [
          { siteId, tab: 'title', page: path, current: page?.metaTitle ?? '', suggested: res.title, reason: res.reason, queries: '[]', chars: true },
          { siteId, tab: 'meta', page: path, current: page?.metaDesc ?? '', suggested: res.meta, reason: res.reason, queries: '[]', chars: true },
        ],
      })
    }
    result = { kind, path }
    const recs = await loadRecommendationsForPath(siteId, path)
    const pageRow = await loadPageForPath(siteId, path)
    result.diff = buildReviewDiff(path, recs, {
      title: pageRow?.title ?? null,
      metaDesc: pageRow?.metaDesc ?? null,
      contentSnippet: pageRow?.contentHtml?.slice(0, 500) ?? null,
    })
  } else if (kind === 'content_update') {
    const action = actions.find((a) => a.kind === 'content_update')
    const types = (action?.updateTypes ?? ['headings', 'body']) as ContentUpdateType[]
    const path = finding.subjectRef
    const res = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/pages/generate-updates`,
      payload: { path, types, skipReview: true },
    })
    const gen = res.json() as { path: string; generated: string[] }
    const recs = await loadRecommendationsForPath(siteId, path)
    const pageRow = await loadPageForPath(siteId, path)
    result = {
      kind,
      ...gen,
      diff: buildReviewDiff(path, recs, {
        title: pageRow?.title ?? null,
        metaDesc: pageRow?.metaDesc ?? null,
        contentSnippet: pageRow?.contentHtml?.slice(0, 500) ?? null,
      }),
    }
  } else if (kind === 'elementor_page' || kind === 'elementor_section') {
    const stylePage = await prisma.page.findFirst({
      where: { siteId, elementorData: { not: null } },
      orderBy: { updatedAt: 'desc' },
    })
    const gen = await generateElementorSection({
      request: finding.title,
      placement: finding.subjectRef,
      styleReference: stylePage?.elementorData ?? null,
    })
    const json = JSON.stringify(gen.elementor, null, 2)
    const section = await prisma.elementorSection.create({
      data: {
        siteId,
        name: gen.name,
        status: 'Generated · validated',
        ok: true,
        useCase: gen.useCase,
        placement: gen.placement,
        notes: gen.notes,
        rationale: gen.rationale,
        size: `${(Buffer.byteLength(json, 'utf8') / 1024).toFixed(1)} KB`,
        json,
      },
    })
    if (kind === 'elementor_page' && site.wpBaseUrl && site.wpUsername && site.wpAppPasswordEnc) {
      const auth = { baseUrl: site.wpBaseUrl, username: site.wpUsername, appPassword: decrypt(site.wpAppPasswordEnc) }
      const slug = finding.subjectRef.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
      const created = await createWpDraftPage(auth, {
        title: finding.subjectLabel,
        slug,
        content: `<p>${finding.title}</p>`,
        elementorData: json,
      })
      result = { kind, elementorId: section.id, wpPageId: created.id, editUrl: created.editUrl }
    } else {
      result = { kind, elementorId: section.id }
    }
  } else if (kind === 'consolidate' || kind === 'prune') {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/content/stage-destructive`,
      payload: { path: finding.subjectRef, action: kind, confirmed: true },
    })
    result = { kind, ...(res.json() as object) }
  } else if (kind === 'gbp_post') {
    const evidence = JSON.parse(finding.evidenceJson) as { metric: string; value: string | number; detail?: string }[]
    const draft = [
      finding.title,
      '',
      evidence.map((e) => (e.detail ? e.detail : `${e.metric}: ${e.value}`)).join('\n'),
      '',
      'Paste this into Google Business Profile. No API connection is configured yet.',
    ].join('\n')
    result = { kind, draft, copyText: draft, copyReady: true, manual: true }
  } else if (kind === 'redirect') {
    const evidence = JSON.parse(finding.evidenceJson) as { metric: string; value: string | number }[]
    const target = String(evidence.find((e) => e.metric === 'target')?.value ?? '')
    result = {
      kind,
      source: finding.subjectLabel,
      target,
      status: Number(evidence.find((e) => e.metric === 'redirect_status')?.value ?? 301),
      manual: false,
    }
  } else {
    result = { kind, message: 'Action noted — manual step required' }
  }

  const meta = actionReviewMeta(kind, finding.title, finding.subjectRef)
  const review = await prisma.reviewItem.create({
    data: {
      siteId,
      title: finding.title,
      detail: `Drafted via ${kind}`,
      type: meta.type,
      risk: meta.risk,
      reviewer: 'Unassigned',
      dest: meta.dest,
      findingId,
      actionKind: kind,
      payloadJson: JSON.stringify(result),
    },
  })

  await prisma.finding.update({ where: { id: findingId }, data: { status: 'drafted' } })
  return { findingId, reviewId: review.id, ...result }
})

app.get('/api/sites/:siteId/impact/changes', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const rows = await prisma.changeLog.findMany({
    where: { siteId },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  })
  return rows.map((r) => ({
    id: r.id,
    page: r.page,
    element: r.element,
    publishedAt: r.publishedAt.toISOString(),
    verdict: r.verdict ?? 'Monitoring',
    clicksBefore28d: r.clicksBefore28d,
    clicksAfter28d: r.clicksAfter28d,
    positionBefore: r.positionBefore,
    positionAfter: r.positionAfter,
    findingId: r.findingId,
  }))
})

app.get('/api/sites/:siteId/reports/client', async (req, reply) => {
  const { siteId } = req.params as { siteId: string }
  const { days } = req.query as { days?: string }
  try {
    return await buildClientReport(siteId, days ? Number(days) : 28)
  } catch {
    return reply.code(404).send({ error: 'Site not found' })
  }
})

/** Proactive alerts from GSC click deltas (rank/traffic loss). */
app.get('/api/sites/:siteId/alerts', async (req) => {
  const { siteId } = req.params as { siteId: string }
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const prior = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
  const rows = await prisma.gscRow.findMany({
    where: { siteId, query: { not: null }, date: { gte: prior } },
  })
  const recent = new Map<string, number>()
  const older = new Map<string, number>()
  for (const r of rows) {
    const q = r.query!
    if (r.date >= since) recent.set(q, (recent.get(q) ?? 0) + r.clicks)
    else older.set(q, (older.get(q) ?? 0) + r.clicks)
  }
  const alerts: { type: string; query: string; message: string; severity: string }[] = []
  for (const [query, prev] of older) {
    const cur = recent.get(query) ?? 0
    if (prev >= 10 && cur < prev * 0.6) {
      alerts.push({
        type: 'traffic_loss',
        query,
        message: `Clicks dropped from ${prev} to ${cur} in the last 14 days`,
        severity: 'high',
      })
    }
  }
  return { alerts: alerts.slice(0, 20) }
})

// Convenience: everything the app needs for one site in a single round-trip.
// The DataProvider hydrates from this bootstrap query.
app.get('/api/bootstrap', async (req) => {
  const { siteId } = req.query as { siteId?: string }
  const site = await resolveSite(siteId)
  if (!site) return { site: null }

  const [opportunities, recommendations, elementor, review, auditQueue, nextSteps] = await Promise.all([
    app.inject({ method: 'GET', url: `/api/sites/${site.id}/opportunities` }),
    app.inject({ method: 'GET', url: `/api/sites/${site.id}/recommendations` }),
    app.inject({ method: 'GET', url: `/api/sites/${site.id}/elementor` }),
    app.inject({ method: 'GET', url: `/api/sites/${site.id}/review` }),
    app.inject({ method: 'GET', url: `/api/sites/${site.id}/audit/queue` }),
    buildNextSteps(site.id, 5),
  ])
  const auditQueuePayload = auditQueue.json() as {
    governor?: unknown
    sufficiency?: unknown
    counts?: unknown
    auditCounts?: unknown
    trusted?: boolean
  }

  return {
    site: { id: site.id, name: site.name, domain: site.domain, lastSyncedAt: site.lastSyncedAt?.toISOString() ?? null },
    opportunities: opportunities.json(),
    recommendations: recommendations.json(),
    elementor: elementor.json(),
    review: review.json(),
    // Findings are fetched on demand (Audit / Act / Technical). Shipping hundreds
    // of full finding objects here bloated bootstrap to ~250KB and blocked the UI.
    auditQueue: {
      governor: auditQueuePayload.governor ?? null,
      sufficiency: auditQueuePayload.sufficiency ?? null,
      counts: auditQueuePayload.counts ?? {},
      auditCounts: auditQueuePayload.auditCounts ?? {},
      trusted: auditQueuePayload.trusted ?? true,
      findings: [],
    },
    nextSteps,
  }
})

// Own dedicated var (not the generic PORT) so a dev/preview harness that sets
// PORT for the web server can't accidentally rebind the API onto the same port.
const port = Number(process.env.API_PORT ?? 8787)

async function refreshSiteData(siteId: string) {
  await app.inject({ method: 'POST', url: `/api/sites/${siteId}/refresh`, payload: '{}' })
}
startSyncScheduler(refreshSiteData)

app
  .listen({ port, host: '127.0.0.1' })
  .then(() => app.log.info(`Groundwork API listening on http://127.0.0.1:${port}`))
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
