import type { ContentPolicy } from '../contentPolicy.ts'
import type { Ga4RowLite, GscRowLite, PageLite } from '../contentEngine.ts'

export type FindingCategory =
  | 'Service pages'
  | 'Content'
  | 'Metadata'
  | 'Technical'
  | 'Local'
  | 'Conversion'
  | 'Trust'
  | 'New content'
  | 'Internal links'

export type SubjectType = 'page' | 'site' | 'treatment' | 'query' | 'setting'

export type EvidencePoint = {
  source: 'GSC' | 'GA4' | 'WP' | 'Competitor' | 'Crawl' | 'Fact'
  metric: string
  value: number | string
  window?: string
  detail?: string
}

export type ActionKind =
  | 'meta_rewrite'
  | 'content_update'
  | 'blog_post'
  | 'elementor_page'
  | 'elementor_section'
  | 'redirect'
  | 'gbp_post'
  | 'consolidate'
  | 'prune'
  | 'monitor'

export type ActionSpec = {
  kind: ActionKind
  label: string
  requiresReviewer: boolean
  /** Which content-update tabs to generate, if applicable. */
  updateTypes?: string[]
}

export type FindingDraft = {
  auditId: string
  category: FindingCategory
  subjectType: SubjectType
  subjectRef: string
  subjectLabel: string
  title: string
  evidence: EvidencePoint[]
  estMonthlyClicks: number
  estBookingValue: number | null
  confidence: number
  effort: 'Low' | 'Medium' | 'High'
  actions: ActionSpec[]
  reviewAfter: string | null
  fingerprint: string
  impact: 'High' | 'Medium' | 'Low'
  source: string
  /** Skip ranking (e.g. leave_alone, monitoring). */
  suppressRank?: boolean
}

export type SiteFactLite = {
  kind: string
  key: string
  value: string
}

export type CompetitorScanLite = {
  targetKeyword: string
  ourPath: string | null
  findings: string
}

export type AuditContext = {
  siteId: string
  pages: PageLite[]
  gsc: GscRowLite[]
  ga4: Ga4RowLite[]
  competitors: CompetitorScanLite[]
  facts: SiteFactLite[]
  policy: ContentPolicy
}

export type DataRequirement = 'gsc' | 'ga4' | 'pages' | 'facts' | 'competitors'

export interface Audit {
  id: string
  category: FindingCategory
  title: string
  requires: DataRequirement[]
  run: (ctx: AuditContext) => FindingDraft[]
}

export type RankedFinding = FindingDraft & { priorityValue: number }
