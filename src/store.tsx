import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { EditorTabId, ViewId } from './data'

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
  filters: { type: 'All', impact: 'All', effort: 'All', source: 'All', status: 'All' },
  oppStatus: {},
  generating: {},
  editorTab: 'title',
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

/** Sync indicator label + dot color + animation, derived from syncState. */
export function syncMeta(sync: SyncState) {
  if (sync === 'Syncing') {
    return { label: 'Syncing GSC + GA4…', dot: '#d9a514', anim: 'gwPulse 1.2s ease-in-out infinite' }
  }
  if (sync === 'Attention') {
    return { label: 'GA4 token expired', dot: '#b3261e', anim: 'none' }
  }
  return { label: 'Synced 12 min ago', dot: '#22a06b', anim: 'none' }
}
