/**
 * DataProvider — the single seam between the UI and the backend.
 *
 * Views read their data through `useData()` instead of importing static consts
 * from `../data`. Site content (opportunities, findings, review queue) loads once
 * per site. Overview metrics/trend refetch when the date range changes, but
 * previous numbers stay visible while the new window loads.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
  useQuery,
} from '@tanstack/react-query'
import * as D from '../data'
import { api, type ApiSite, type DashboardPayload } from '../lib/api'
import { useStore } from '../store'

/** Offline demo bundle — only shown when the API is unreachable. */
const fallbackBundle = {
  sites: D.sites as (D.Site & { id?: string; lastSyncedAt?: string | null })[],
  opps: D.opps,
  editorData: D.editorData,
  elemDefs: D.elemDefs,
  reviewData: D.reviewData,
  metrics: D.metrics,
  losingPages: D.losingPages,
  compGaps: D.compGaps,
  scoreParts: D.scoreParts,
  readyItems: D.readyItems,
  recentPublished: D.recentPublished,
  pageQueries: D.pageQueries,
  pageComps: D.pageComps,
  planLinks: D.planLinks,
  planChecklist: D.planChecklist,
  planDefs: D.planDefs,
  competitors: D.competitors,
  kwGaps: D.kwGaps,
  contentGapCards: D.contentGapCards,
  serpFeatures: D.serpFeatures,
  techIssues: D.techIssues,
  impactRows: D.impactRows,
  connections: D.connections,
  seoScore: { overall: 72, delta: 4 } as { overall: number; delta: number },
    trend: { current: [] as number[], previous: [] as number[], labels: [] as string[] },
    trendSeries: null as DashboardPayload['trendSeries'] | null,
  competitorScans: [] as CompetitorScanRow[],
  findings: [] as import('../lib/api').Finding[],
  nextSteps: [] as import('../lib/api').NextStep[],
  completedSteps: [] as import('../lib/api').CompletedStep[],
  nextStepsTotal: 0,
  auditGovernor: null as import('../lib/api').AuditQueueResponse['governor'],
}

const emptyEditorData: Record<D.RecommendationTabId, D.EditorItem[]> = {
  title: [],
  meta: [],
  headings: [],
  body: [],
  faq: [],
  schema: [],
  links: [],
}

/** Never expose an empty sites list — views assume a current site exists. */
function resolveSites(
  sites: ApiSite[] | undefined,
  bootstrapSite?: ApiSite | null,
): DataBundle['sites'] {
  if (sites?.length) return sites
  if (bootstrapSite) return [bootstrapSite]
  return fallbackBundle.sites
}

/** Empty shell used while live data is loading — never seed/demo numbers. */
function emptyLiveBundle(sites: ApiSite[] | undefined, bootstrapSite?: ApiSite | null): DataBundle {
  return {
    sites: resolveSites(sites, bootstrapSite),
    opps: [],
    editorData: emptyEditorData,
    elemDefs: [],
    reviewData: [],
    metrics: [],
    losingPages: [],
    compGaps: [],
    scoreParts: [],
    readyItems: [],
    recentPublished: [],
    pageQueries: [],
    pageComps: [],
    planLinks: [],
    planChecklist: [],
    planDefs: [],
    competitors: [],
    kwGaps: [],
    contentGapCards: [],
    serpFeatures: [],
    techIssues: [],
    impactRows: [],
    connections: [],
    seoScore: { overall: 0, delta: 0 },
    trend: { current: [], previous: [], labels: [] },
  trendSeries: null,
    competitorScans: [],
    findings: [],
    nextSteps: [],
    completedSteps: [],
    nextStepsTotal: 0,
    auditGovernor: null,
  }
}

export type CompetitorScanRow = {
  id: string
  keyword: string
  when: string
  highCount: number
  mediumCount: number
  gapCount: number
  topGap: string | null
}

const RANGE_PARAM: Record<string, string> = {
  'Last 28 days': '28',
  'Last 3 months': '90',
  'Last 12 months': '365',
}

export type DataBundle = typeof fallbackBundle
export type DataStatus = 'loading' | 'live' | 'fallback'

type DataValue = {
  data: DataBundle
  status: DataStatus
  siteId?: string
  bootstrapLoading: boolean
  dashboardLoading: boolean
}

const DataContext = createContext<DataValue | null>(null)

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
})

function mergeDashboard(data: DataBundle, dash: DashboardPayload | undefined): DataBundle {
  if (!dash) return data
  return {
    ...data,
    metrics: dash.metrics ?? data.metrics,
    losingPages: dash.losingPages ?? data.losingPages,
    scoreParts: dash.scoreParts ?? data.scoreParts,
    seoScore: dash.seoScore ?? data.seoScore,
    trend: dash.trend ?? data.trend,
    trendSeries: dash.trendSeries ?? data.trendSeries,
    readyItems: dash.readyItems ?? data.readyItems,
    recentPublished: dash.recentPublished ?? data.recentPublished,
    competitorScans: dash.competitorScans ?? data.competitorScans,
  }
}

function buildFromBootstrap(
  b: NonNullable<Awaited<ReturnType<typeof api.bootstrap>>>,
  sites: ApiSite[] | undefined,
  dash: DashboardPayload | undefined,
  findings: DataBundle['findings'],
): DataBundle {
  const data = mergeDashboard(
    {
      ...emptyLiveBundle(sites, b.site),
      opps: b.opportunities ?? [],
      editorData: {
        ...emptyEditorData,
        ...b.recommendations,
      },
      elemDefs: b.elementor ?? [],
      reviewData: b.review ?? [],
      findings,
      nextSteps: b.nextSteps?.steps ?? [],
      completedSteps: b.nextSteps?.completed ?? [],
      nextStepsTotal: b.nextSteps?.total ?? 0,
      auditGovernor: b.auditQueue?.governor ?? null,
    },
    dash,
  )
  return data
}

function Hydrator({ children }: { children: ReactNode }) {
  const { state } = useStore()

  const sitesQuery = useQuery({ queryKey: ['sites'], queryFn: api.sites })
  const sites: ApiSite[] | undefined = sitesQuery.data
  const siteId = sites?.[state.siteIdx]?.id

  const bootstrapQuery = useQuery({
    queryKey: ['bootstrap', siteId ?? 'default'],
    queryFn: () => api.bootstrap(siteId),
    enabled: sitesQuery.isSuccess,
    placeholderData: keepPreviousData,
  })

  const findingsQuery = useQuery({
    queryKey: ['audit-findings', siteId],
    queryFn: async () => (await api.auditQueue(siteId!)).findings,
    enabled: sitesQuery.isSuccess && !!siteId,
    staleTime: 60_000,
  })

  const range = RANGE_PARAM[state.dateRange] ?? '28'
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', siteId ?? 'default', range],
    queryFn: () => api.dashboard(siteId!, range),
    enabled: sitesQuery.isSuccess && !!siteId,
    placeholderData: keepPreviousData,
  })

  const bootstrapLoading = bootstrapQuery.isPending && !bootstrapQuery.data
  const dashboardLoading =
    !!siteId && dashboardQuery.isPending && !dashboardQuery.data

  const value = useMemo<DataValue>(() => {
    if (sitesQuery.isError || bootstrapQuery.isError) {
      return {
        data: fallbackBundle,
        status: 'fallback',
        siteId,
        bootstrapLoading: false,
        dashboardLoading: false,
      }
    }

    const b = bootstrapQuery.data
    const findings = findingsQuery.data ?? b?.auditQueue?.findings ?? []

    if (!b) {
      const shell = mergeDashboard({ ...emptyLiveBundle(sites), findings }, dashboardQuery.data)
      return {
        data: shell,
        status: 'loading',
        siteId,
        bootstrapLoading,
        dashboardLoading,
      }
    }

    return {
      data: buildFromBootstrap(b, sites, dashboardQuery.data, findings),
      status: 'live',
      siteId: b.site?.id ?? siteId,
      bootstrapLoading,
      dashboardLoading,
    }
  }, [
    bootstrapQuery.data,
    bootstrapQuery.isError,
    findingsQuery.data,
    dashboardQuery.data,
    bootstrapLoading,
    dashboardLoading,
    sitesQuery.isError,
    sites,
    siteId,
  ])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function DataProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Hydrator>{children}</Hydrator>
    </QueryClientProvider>
  )
}

/** Read the current data bundle. Shapes match the old `data.ts` exports. */
export function useData(): DataBundle {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx.data
}

/** Whether data is loading, live from the API, or the offline fallback. */
export function useDataStatus(): DataStatus {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDataStatus must be used within DataProvider')
  return ctx.status
}

/** Granular loading flags for skeleton UI. */
export function useDataLoading() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDataLoading must be used within DataProvider')
  return {
    bootstrapLoading: ctx.bootstrapLoading,
    dashboardLoading: ctx.dashboardLoading,
  }
}

/** Current site for the active index — always defined. */
export function useCurrentSite() {
  const { sites } = useData()
  const { state } = useStore()
  const site = sites[state.siteIdx] ?? sites[0]
  return site ?? { name: 'Loading…', domain: '…', id: '', lastSyncedAt: null as string | null }
}

/** The current site's database id, or undefined until the bootstrap resolves. */
export function useSiteId(): string | undefined {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useSiteId must be used within DataProvider')
  return ctx.siteId
}

/** Invalidate site-scoped queries after a sync or publish. */
export function invalidateSiteData(client: QueryClient, siteId?: string) {
  const id = siteId ?? 'default'
  client.invalidateQueries({ queryKey: ['bootstrap', id] })
  client.invalidateQueries({ queryKey: ['dashboard', id] })
  client.invalidateQueries({ queryKey: ['audit-findings', id] })
  client.invalidateQueries({ queryKey: ['next-steps', id] })
}
