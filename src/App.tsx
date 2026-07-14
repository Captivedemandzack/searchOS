import { useEffect } from 'react'
import { DemoDataBanner } from './components/DemoDataBanner'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Toast } from './components/Toast'
import { useStore } from './store'
import { colors } from './theme'

import { AuditView } from './views/AuditView'
import { ActView } from './views/ActView'
import { OverviewView } from './views/Overview'
import { OpportunitiesView } from './views/Opportunities'
import { PageDetailView } from './views/PageDetail'
import { ContentEditorView } from './views/ContentEditor'
import { ContentStudioView } from './views/ContentStudio'
import { ElementorView } from './views/Elementor'
import { CompetitorsView } from './views/Competitors'
import { TechnicalView } from './views/Technical'
import { ReviewQueueView } from './views/ReviewQueue'
import { ImpactView } from './views/Impact'
import { SettingsView } from './views/Settings'

const views = {
  overview: OverviewView,
  audit: AuditView,
  act: ActView,
  opportunities: OpportunitiesView,
  pages: PageDetailView,
  editor: ContentEditorView,
  studio: ContentStudioView,
  elementor: ElementorView,
  competitors: CompetitorsView,
  technical: TechnicalView,
  review: ReviewQueueView,
  impact: ImpactView,
  settings: SettingsView,
} as const

export function App() {
  const { state, nav, showToast } = useStore()
  const CurrentView = views[state.view]

  // The Google OAuth callback is a full-page redirect back to the SPA (not a
  // fetch), so pick up the result from the URL on first mount, surface it,
  // and strip the query string so a refresh doesn't re-trigger the toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('googleConnected')
    const error = params.get('googleError')
    if (connected || error) {
      nav('settings')
      showToast(error ? `Google connection failed: ${error}` : 'Google account connected')
      window.history.replaceState({}, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', minWidth: 1280 }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar />
        <main
          style={{
            flex: 1,
            padding: '22px 26px 48px',
            maxWidth: 1360,
            width: '100%',
            color: colors.ink,
          }}
        >
          <DemoDataBanner />
          <CurrentView />
        </main>
      </div>
      <Toast />
    </div>
  )
}
