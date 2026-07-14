import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { EditorTabId, ViewId } from './data'
import type { NextStep } from './lib/api'

export type SyncState = 'Synced' | 'Syncing' | 'Attention'

export type Filters = {
  type: string
  impact: string
  effort: string
  source: string
  status: string
}

export type State = {
  view: ViewId
  siteMenuOpen: boolean
  siteIdx: number
  dateRange: string
  filters: Filters
  oppStatus: Record<string, string> // id -> 'In review'
  expandedOpp: string | null // opportunity row open in the Opportunities tab
  selectedPage: string | null // path drilled into on the Pages tab
  actFindingId: string | null // Finding being acted on in Act workspace
  actOpportunityId: string | null // Opportunity being acted on in Act workspace
  actScopePath: string | null // Page path when opening Act without a finding/opp
  oppTab: 'todo' | 'in_progress' | 'completed' // Opportunities list sub-tab
  oppDetailStep: NextStep | null // Open opportunity detail screen
  /** Step ids the user has opened this session, keyed by site id. */
  inProgressSteps: Record<string, string[]>
  reviewFocusId: string | null // Resolved review item for the open opportunity
  auditCategory: string // filter lens in Audit view
  generating: Record<string, boolean>
  editorTab: EditorTabId
  approvals: Record<string, 'approved' | 'rejected'>
  editing: Record<string, boolean>
  edits: Record<string, string>
  reviewStatus: Record<string, 'Approved' | 'Rejected'>
  planIncluded: Record<string, boolean>
  planQueued: boolean
  jsonOpen: Record<string, boolean>
  queuedSections: Record<string, boolean>
  syncState: SyncState
  toast: string | null
}

const initialState: State = {
  view: 'overview',
  siteMenuOpen: false,
  siteIdx: 0,
  dateRange: 'Last 28 days',
  filters: { type: 'All', impact: 'All', effort: 'All', source: 'All', status: 'Active' },
  oppStatus: {},
  expandedOpp: null,
  selectedPage: null,
  actFindingId: null,
  actOpportunityId: null,
  actScopePath: null,
  oppTab: 'todo',
  oppDetailStep: null,
  inProgressSteps: {},
  reviewFocusId: null,
  auditCategory: 'All',
  generating: {},
  editorTab: 'seo',
  approvals: {},
  editing: {},
  edits: {},
  reviewStatus: {},
  planIncluded: { p1: true, p2: true, p3: true, p4: true, p5: false, p6: true },
  planQueued: false,
  jsonOpen: { s1: true },
  queuedSections: {},
  syncState: 'Synced',
  toast: null,
}

type Patch = Partial<State> | ((prev: State) => Partial<State>)

type StoreValue = {
  state: State
  /** Shallow-merge patch into state — mirrors the prototype's `setState`.
   *  Accepts a functional updater for patches that depend on live state. */
  setState: (patch: Patch) => void
  /** Switch view, close the site menu, scroll to top. */
  nav: (view: ViewId) => void
  showToast: (msg: string) => void
  cycleSync: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setFull] = useState<State>(initialState)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  const setState = useCallback((patch: Patch) => {
    setFull((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
  }, [])

  const nav = useCallback((view: ViewId) => {
    setFull((prev) => ({ ...prev, view, siteMenuOpen: false }))
    window.scrollTo(0, 0)
  }, [])

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current)
    setFull((prev) => ({ ...prev, toast: msg }))
    toastTimer.current = setTimeout(() => {
      setFull((prev) => ({ ...prev, toast: null }))
    }, 2600)
  }, [])

  const cycleSync = useCallback(() => {
    setFull((prev) => {
      const order: SyncState[] = ['Synced', 'Syncing', 'Attention']
      const next = order[(order.indexOf(prev.syncState) + 1) % order.length]
      return { ...prev, syncState: next }
    })
  }, [])

  const value = useMemo(
    () => ({ state, setState, nav, showToast, cycleSync }),
    [state, setState, nav, showToast, cycleSync],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

/** Human relative time, e.g. "3m ago", "2h ago", "just now". */
function relativeTime(from: Date, now: number): string {
  const secs = Math.max(0, Math.round((now - from.getTime()) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/** Real sync indicator: label + dot color, derived from the site's last sync time. */
export function syncMeta(lastSyncedAt: string | null | undefined, now: number) {
  if (!lastSyncedAt) {
    return { label: 'Not synced yet', dot: '#a0a096', anim: 'none' }
  }
  return {
    label: `Synced ${relativeTime(new Date(lastSyncedAt), now)}`,
    dot: '#22a06b',
    anim: 'none',
  }
}

/** Re-renders once a minute so relative timestamps stay current. */
export function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}
