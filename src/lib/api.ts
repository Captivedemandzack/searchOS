/**
 * Typed client for the Groundwork API. In dev, Vite proxies `/api` to the
 * Fastify server (see vite.config.ts), so requests are same-origin.
 */
import type {
  EditorItem,
  ElemDef,
  Opportunity,
  ReviewRow,
  Site,
} from '../data'

export type ApiSite = Site & { id: string; lastSyncedAt?: string | null }

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

export type NextStepsResponse = { steps: NextStep[]; completed: CompletedStep[]; total: number }

/** Site content loaded once per visit — not tied to the Overview date range. */
export type Bootstrap = {
  site: ApiSite | null
  opportunities: Opportunity[]
  recommendations: Partial<Record<import('../data').RecommendationTabId, EditorItem[]>>
  elementor: ElemDef[]
  review: ReviewRow[]
  auditQueue?: AuditQueueResponse
  nextSteps?: NextStepsResponse
}

/** Overview metrics — refetched when the user changes 28 / 90 / 365 day window. */
export type DashboardPayload = {
  metrics: { label: string; value: string; delta: string; up: boolean }[]
  losingPages: { path: string; delta: string }[]
  scoreParts: { label: string; val: number; pct: string; color: string }[]
  seoScore: { overall: number; delta: number }
  trend: { current: number[]; previous: number[]; labels: string[] }
  trendSeries: {
    labels: string[]
    current: Record<'clicks' | 'impressions' | 'position' | 'conversions' | 'engagementRate', number[]>
    previous: Record<'clicks' | 'impressions' | 'position' | 'conversions' | 'engagementRate', number[]>
  }
  readyItems: { label: string; kind: string }[]
  recentPublished: { label: string; meta: string; status: string; good: boolean }[]
  competitorScans: {
    id: string
    keyword: string
    when: string
    highCount: number
    mediumCount: number
    gapCount: number
    topGap: string | null
  }[]
  periodDays?: number
  hasPriorPeriod?: boolean
}

export type EvidencePoint = {
  source: string
  metric: string
  value: number | string
  window?: string
  detail?: string
}

export type FindingAction = {
  kind: string
  label: string
  requiresReviewer: boolean
  updateTypes?: string[]
}

export type Finding = {
  id: string
  auditId: string
  category: string
  subject: { type: string; ref: string; label: string }
  title: string
  evidence: EvidencePoint[]
  estMonthlyClicks: number
  estBookingValue: number | null
  confidence: number
  effort: string
  actions: FindingAction[]
  priorityValue: number
  status: string
  reviewAfter: string | null
  fingerprint: string | null
  impact: string
  source: string
}

export type AuditQueueResponse = {
  findings: Finding[]
  governor: {
    coveragePct: number
    saturated: boolean
    allowNewPosts: boolean
    reason: string | null
  } | null
  sufficiency: Record<string, unknown> | null
  counts: Record<string, number>
  auditCounts: Record<string, number>
  trusted: boolean
}

export type ImpactChangeRow = {
  id: string
  page: string
  element: string
  publishedAt: string
  verdict: string
  clicksBefore28d: number | null
  clicksAfter28d: number | null
  positionBefore: number | null
  positionAfter: number | null
  findingId: string | null
}

export type ConnectionsSummary = {
  wordpress: { connected: boolean; baseUrl: string | null; pageCount: number; lastSyncedAt: string | null; connectorInstalled?: boolean; connectorVersion?: string | null }
  gsc: { connected: boolean; property: string | null; lastSyncedAt: string | null }
  ga4: { connected: boolean; property: string | null; lastSyncedAt: string | null }
  elementor: { detected: boolean; detail: string }
  seoPlugin: {
    detected: boolean
    detail: string
    primary: string | null
    extensions: string[]
    capabilities: {
      metaWrite: boolean
      metaAdapters: string[]
      redirects: boolean
      redirectAdapters: string[]
      redirectPublish: boolean
    }
  }
  sitemap: { detected: boolean; detail: string }
}

export type PublishReviewResult = {
  kind: string
  tier: string
  draftOnly: boolean
  wpPostId?: number
  wpPageId?: number
  editUrl?: string
  link?: string
  seoPlugin?: string
}

export type WpConnectionStatus = { connected: boolean; baseUrl: string | null; username: string | null }
export type WpConnectInput = { baseUrl: string; username: string; appPassword: string }
export type WpSyncResult = { pagesSynced: number; elementorFound: number }
export type ApiError = { error: string }
export type PageSummary = {
  id: string
  wpId: number | null
  slug: string
  title: string | null
  metaTitle: string | null
  metaDesc: string | null
  hasElementor: boolean
  updatedAt: string
}

export type GoogleConnectionStatus = {
  connected: boolean
  email: string | null
  gscProperty: string | null
  ga4Property: string | null
}
export type Ga4PropertySummary = { propertyId: string; displayName: string }
export type GenerateResult = {
  title: string
  meta: string
  matchedPage: boolean
  queryCount: number
}
export type PrepareGamePlanResult = {
  prepared: boolean
  generated: string[]
  errors: string[]
  reviewItemId?: string
}
export type ReadinessCheck = { label: string; ok: boolean; detail: string }
export type PublishReadiness = {
  ok: boolean
  checkedAt: string
  path: string
  usesElementor: boolean
  checks: ReadinessCheck[]
}
export type AutonomousResult = {
  ok: boolean
  stage: 'prepared' | 'approved' | 'verified' | 'blocked'
  reviewItemId?: string
  generated: string[]
  errors: string[]
  readiness: PublishReadiness | null
  requiresHumanPublish: boolean
  message: string
}
export type OppQueryRow = {
  query: string
  impressions: number
  clicks: number
  ctr: number
  position: number
}
export type OppContext = {
  matchedPage: {
    slug: string
    title: string | null
    metaTitle: string | null
    metaDesc: string | null
  } | null
  liveUrl: string | null
  queries: OppQueryRow[]
}

export type PageLiveSchema = {
  path: string
  liveUrl: string | null
  types: string[]
  typeSummary: string
  formatted: string
  source: 'yoast' | 'none'
}

export type PageIndexRow = {
  path: string
  /** Full synced permalink (https://…). */
  url: string
  title: string | null
  type: string // "page" | "post"
  synced: boolean
  clicks: number
  prevClicks: number | null
  impressions: number
  position: number | null
  oppCount: number
}
export type PageInsights = {
  liveUrl: string
  page: {
    slug: string
    title: string | null
    metaTitle: string | null
    metaDesc: string | null
    hasElementor: boolean
  } | null
  stats: {
    clicks: number
    prevClicks: number | null
    impressions: number
    prevImpressions: number | null
    position: number | null
    prevPosition: number | null
    ctr: number
    expectedCtr: number | null
  }
  daily: { date: string; clicks: number; position: number | null }[]
  queries: (OppQueryRow & { gap: number })[]
  headings: { tag: string; text: string }[]
  structure: {
    h1Count: number
    h1Text: string | null
    headingCount: number
    uncovered: { query: string; impressions: number; missing: string[] }[]
  }
  opportunities: { id: string; title: string; expected: string; effort: string; type: string; status: string }[]
}
export type SyncResult = {
  rowsSynced: number
  startDate?: string
  endDate?: string
  pageRange?: { startDate: string; endDate: string }
  queryRange?: { startDate: string; endDate: string }
  opportunitiesGenerated?: number
}

export type RefreshResult = {
  synced: string[]
  syncErrors: string[]
  audit: { total: number; added: number; resolved: number }
  drafted: number
  draftErrors: string[]
  blogWritten: { id: string; title: string } | null
  blogError: string | null
}

export type BlogTopicIdea = {
  keyword: string
  monthlyImpressions: number
  position: number
  estClicks: number
}
export type ContentGovernor = {
  coveragePct: number
  universeSize: number
  coveredCount: number
  saturated: boolean
  postsLast30d: number
  velocityExceeded: boolean
  allowNewPosts: boolean
  reason: string | null
}
export type TopicIdeasResponse = { governor: ContentGovernor; ideas: BlogTopicIdea[] }
export type RefreshQueueItem = {
  path: string
  title: string | null
  pageType: string
  action: 'refresh' | 'rewrite' | 'consolidate' | 'prune' | 'leave_alone' | 'insufficient_data'
  triggers: { id: string; reason: string }[]
  reason: string
  effort: 'Low' | 'Medium' | 'High'
  priority: number
  intent: 'transactional' | 'local' | 'informational'
  primaryKeyword: string | null
  position: number | null
  clicks: number
  conversions: number
  estMonthlyUpside: number
  lowConfidence: boolean
  reviewAfter: string | null
  consolidateInto: string | null
}
export type DataSufficiency = {
  gscHistoryMonths: number
  gscCoverageGaps: string[]
  pruneWindowGaps: string[]
  pagesTotal: number
  pagesWithGscData: number
  pagesUnresolved?: number
  ga4Conversions: number
  ga4Status: 'active' | 'partial' | 'none'
  firstDataDate: string | null
  lastDataDate: string | null
  keywordUniverseSize: number
  universeSource: string
  pruneBarMonths: number
}
export type ReconciliationResult = {
  balanced: boolean
  totalRecs: number
  resolvedPages: number
  unknownPages: number
  insufficientMissingGsc: number
  allRecsResolved: boolean
  failures: string[]
}
export type RefreshQueueResponse = {
  queue: RefreshQueueItem[]
  governor: ContentGovernor
  sufficiency: DataSufficiency
  reconciliation: ReconciliationResult
  trusted: boolean
  priorityMode: 'value-weighted' | 'traffic-intent-only'
  counts: Record<string, number>
  policy: { windowDays: number }
}
export type PageHistoryResponse = {
  path: string
  monthly: { month: string; clicks: number; impressions: number }[]
  inboundLinks: { path: string; title: string | null }[]
  firstSeen: string | null
  lastSeen: string | null
}
export type BlogPost = {
  id: string
  targetKeyword: string
  title: string
  metaTitle: string
  metaDescription: string
  slug: string
  excerpt: string
  bodyHtml: string
  faqs: { q: string; a: string }[]
  keywordCluster: { primary?: string; supporting?: { keyword: string; monthlyImpressions: number | null }[] }
  internalLinks: { path: string; anchor: string }[]
  inboundLinks: { path: string; anchor: string }[]
  categories: string[]
  imageQuery: string
  imageUrl: string | null
  imageAlt: string | null
  imageCredit: string | null
  estClicks: number | null
  status: string
  wpPostId: number | null
  wpEditUrl: string | null
  reviewerName: string | null
  reviewerCredentials: string | null
  reviewApprovedAt: string | null
  contentUpdatedAt: string | null
  createdAt: string
}

export type CompetitorGap = { title: string; detail: string; priority: 'High' | 'Medium' | 'Low' }
export type CompetitorFindings = {
  summary: string
  gaps: CompetitorGap[]
  recommendedSections: string[]
  competitorNotes: { url: string; observation: string }[]
}
export type CompetitorScan = {
  id: string
  targetKeyword: string
  ourPath: string | null
  urls: string[]
  findings: CompetitorFindings
  createdAt: string
  fetched?: number
  failures?: string[]
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as T | ApiError
  if (!res.ok) throw new Error((json as ApiError).error ?? `${path} → ${res.status}`)
  return json as T
}

export const api = {
  sites: () => get<ApiSite[]>('/api/sites'),
  createSite: (body: { name: string; domain: string }) =>
    post<ApiSite>('/api/sites', body),
  siteSettings: (siteId: string) =>
    get<{ maxNewPostsPerMonth: number; localModifiers: string[]; reviewerRoster: string[] }>(
      `/api/sites/${siteId}/settings`,
    ),
  updateSiteSettings: (
    siteId: string,
    body: { maxNewPostsPerMonth?: number; localModifiers?: string[]; reviewerRoster?: string[] },
  ) => post<{ saved: true }>(`/api/sites/${siteId}/settings`, body),
  clientReport: (siteId: string, days = 28) =>
    get<Record<string, unknown>>(`/api/sites/${siteId}/reports/client?days=${days}`),
  alerts: (siteId: string) =>
    get<{ alerts: { type: string; query: string; message: string; severity: string }[] }>(
      `/api/sites/${siteId}/alerts`,
    ),
  bootstrap: (siteId?: string) => {
    const qs = new URLSearchParams()
    if (siteId) qs.set('siteId', siteId)
    const s = qs.toString()
    return get<Bootstrap>(`/api/bootstrap${s ? `?${s}` : ''}`)
  },
  nextSteps: (siteId: string, limit?: number) =>
    get<NextStepsResponse>(
      limit != null
        ? `/api/sites/${siteId}/next-steps?limit=${limit}`
        : `/api/sites/${siteId}/next-steps`,
    ),
  dashboard: (siteId: string, range = '28') =>
    get<DashboardPayload>(`/api/sites/${siteId}/dashboard?range=${encodeURIComponent(range)}`),
  setReviewStatus: (siteId: string, itemId: string, status: 'Approved' | 'Rejected' | 'Pending') =>
    post<{ id: string; status: string }>(`/api/sites/${siteId}/review/${itemId}/status`, { status }),
  stageSeoMeta: (
    siteId: string,
    body: {
      path: string
      title?: string
      description?: string
      reviewItemId?: string
      stepTitle?: string
      findingId?: string
    },
  ) =>
    post<{ reviewItemId: string; path: string }>(`/api/sites/${siteId}/review/stage-seo-meta`, body),
  publishReviewItem: (
    siteId: string,
    itemId: string,
    body?: { title?: string; description?: string },
  ) => post<PublishReviewResult>(`/api/sites/${siteId}/review/${itemId}/publish`, body ?? {}),
  connectionsSummary: (siteId: string) =>
    get<ConnectionsSummary>(`/api/sites/${siteId}/connections/summary`),
  wpConnectionStatus: (siteId: string) =>
    get<WpConnectionStatus>(`/api/sites/${siteId}/connections/wordpress`),
  connectWordPress: (siteId: string, body: WpConnectInput) =>
    post<{ connected: true }>(`/api/sites/${siteId}/connections/wordpress`, body),
  syncWordPress: (siteId: string) =>
    post<WpSyncResult>(`/api/sites/${siteId}/sync/wordpress`, {}),
  pages: (siteId: string) => get<PageSummary[]>(`/api/sites/${siteId}/pages`),
  googleConnectionStatus: (siteId: string) =>
    get<GoogleConnectionStatus>(`/api/sites/${siteId}/connections/google`),
  googleAuthStartUrl: (siteId: string) => `/api/auth/google/start?siteId=${encodeURIComponent(siteId)}`,
  gscSites: (siteId: string) => get<string[]>(`/api/sites/${siteId}/google/gsc-sites`),
  ga4Properties: (siteId: string) => get<Ga4PropertySummary[]>(`/api/sites/${siteId}/google/ga4-properties`),
  connectGsc: (siteId: string, propertyUrl: string) =>
    post<{ saved: true }>(`/api/sites/${siteId}/connections/gsc`, { propertyUrl }),
  connectGa4: (siteId: string, propertyId: string) =>
    post<{ saved: true }>(`/api/sites/${siteId}/connections/ga4`, { propertyId }),
  syncGsc: (siteId: string) => post<SyncResult>(`/api/sites/${siteId}/sync/gsc`, {}),
  syncGa4: (siteId: string) => post<SyncResult>(`/api/sites/${siteId}/sync/ga4`, {}),
  generateOpportunity: (siteId: string, oppId: string) =>
    post<PrepareGamePlanResult>(`/api/sites/${siteId}/opportunities/${oppId}/generate`, {}),
  prepareGamePlan: (siteId: string, oppId: string) =>
    post<PrepareGamePlanResult>(`/api/sites/${siteId}/opportunities/${oppId}/prepare-game-plan`, {}),
  runAutonomous: (siteId: string, oppId: string) =>
    post<AutonomousResult>(`/api/sites/${siteId}/opportunities/${oppId}/run-autonomous`, {}),
  prepareFindingGamePlan: (siteId: string, findingId: string) =>
    post<PrepareGamePlanResult>(`/api/sites/${siteId}/findings/${findingId}/prepare-game-plan`, {}),
  refresh: (siteId: string) => post<RefreshResult>(`/api/sites/${siteId}/refresh`, {}),
  blogTopicIdeas: (siteId: string) => get<TopicIdeasResponse>(`/api/sites/${siteId}/blog/topic-ideas`),
  refreshQueue: (siteId: string) =>
    get<RefreshQueueResponse>(`/api/sites/${siteId}/content/refresh-queue`),
  pageHistory: (siteId: string, path: string) =>
    get<PageHistoryResponse>(`/api/sites/${siteId}/content/page-history?path=${encodeURIComponent(path)}`),
  stageDestructive: (siteId: string, body: { path: string; action: 'prune' | 'consolidate'; confirmed: boolean }) =>
    post<{ staged: boolean; reviewItemId: string; consolidateInto: string | null }>(
      `/api/sites/${siteId}/content/stage-destructive`,
      body,
    ),
  blogApprove: (siteId: string, postId: string, body: { reviewerName: string; reviewerCredentials: string }) =>
    post<BlogPost>(`/api/sites/${siteId}/blog/${postId}/approve`, body),
  blogList: (siteId: string) => get<BlogPost[]>(`/api/sites/${siteId}/blog`),
  blogGet: (siteId: string, postId: string) => get<BlogPost>(`/api/sites/${siteId}/blog/${postId}`),
  blogGenerate: (siteId: string, body: { keyword: string; angle?: string; estClicks?: number }) =>
    post<BlogPost>(`/api/sites/${siteId}/blog/generate`, body),
  blogPickImage: (siteId: string, postId: string) =>
    post<BlogPost>(`/api/sites/${siteId}/blog/${postId}/image`, {}),
  blogUploadImage: (siteId: string, postId: string, dataUrl: string) =>
    post<BlogPost>(`/api/sites/${siteId}/blog/${postId}/image/upload`, { dataUrl }),
  blogPublish: (siteId: string, postId: string, body?: { isSubstantive?: boolean }) =>
    post<BlogPost>(`/api/sites/${siteId}/blog/${postId}/publish`, body ?? {}),
  generatePageUpdates: (siteId: string, path: string, types?: string[]) =>
    post<{ path: string; generated: string[]; errors: string[]; matchedPage: boolean }>(
      `/api/sites/${siteId}/pages/generate-updates`,
      { path, types },
    ),
  setOpportunityStatus: (
    siteId: string,
    oppId: string,
    status: 'Open' | 'Drafted' | 'Done' | 'Dismissed',
  ) => post<{ id: string; status: string }>(`/api/sites/${siteId}/opportunities/${oppId}/status`, { status }),
  oppContext: (siteId: string, oppId: string) =>
    get<OppContext>(`/api/sites/${siteId}/opportunities/${oppId}/context`),
  pagesIndex: (siteId: string) => get<PageIndexRow[]>(`/api/sites/${siteId}/pages-index`),
  pageLiveSchema: (siteId: string, path: string) =>
    get<PageLiveSchema>(`/api/sites/${siteId}/page-live-schema?path=${encodeURIComponent(path)}`),
  pageInsights: (siteId: string, path: string) =>
    get<PageInsights>(`/api/sites/${siteId}/page-insights?path=${encodeURIComponent(path)}`),
  competitorScans: (siteId: string) => get<CompetitorScan[]>(`/api/sites/${siteId}/competitors/scans`),
  analyzeCompetitors: (
    siteId: string,
    body: { targetKeyword: string; urls: string[]; ourPath?: string },
  ) => post<CompetitorScan>(`/api/sites/${siteId}/competitors/analyze`, body),
  generateElementor: (siteId: string, body: { request: string; placement?: string }) =>
    post<{ id: string; name: string; size: string; styledFrom: string | null }>(
      `/api/sites/${siteId}/elementor/generate`,
      body,
    ),
  auditQueue: (siteId: string, params?: { category?: string; status?: string }) => {
    const q = new URLSearchParams()
    if (params?.category) q.set('category', params.category)
    if (params?.status) q.set('status', params.status)
    const s = q.toString()
    return get<AuditQueueResponse>(`/api/sites/${siteId}/audit/queue${s ? `?${s}` : ''}`)
  },
  runAudits: (siteId: string) => post<AuditQueueResponse & { persist: { added: number; updated: number; resolved: number } }>(
    `/api/sites/${siteId}/audit/run`,
    {},
  ),
  draftFindingFix: (siteId: string, findingId: string, actionKind?: string) =>
    post<{ findingId: string; reviewId: string; kind: string }>(
      `/api/sites/${siteId}/findings/${findingId}/draft-fix`,
      actionKind ? { actionKind } : {},
    ),
  setFindingStatus: (siteId: string, findingId: string, status: string) =>
    post<Finding>(`/api/sites/${siteId}/findings/${findingId}/status`, { status }),
  impactChanges: (siteId: string) => get<ImpactChangeRow[]>(`/api/sites/${siteId}/impact/changes`),
}
