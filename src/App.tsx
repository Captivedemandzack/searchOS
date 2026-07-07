import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Toast } from './components/Toast'
import { useStore } from './store'
import { colors } from './theme'

import { OverviewView } from './views/Overview'
import { OpportunitiesView } from './views/Opportunities'
import { PageDetailView } from './views/PageDetail'
import { ContentEditorView } from './views/ContentEditor'
import { ElementorView } from './views/Elementor'
import { CompetitorsView } from './views/Competitors'
import { TechnicalView } from './views/Technical'
import { ReviewQueueView } from './views/ReviewQueue'
import { ImpactView } from './views/Impact'
import { SettingsView } from './views/Settings'

const views = {
  overview: OverviewView,
  opportunities: OpportunitiesView,
  pages: PageDetailView,
  editor: ContentEditorView,
  elementor: ElementorView,
  competitors: CompetitorsView,
  technical: TechnicalView,
  review: ReviewQueueView,
  impact: ImpactView,
  settings: SettingsView,
} as const

export function App() {
  const { state } = useStore()
  const CurrentView = views[state.view]

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
          <CurrentView />
        </main>
      </div>
      <Toast />
    </div>
  )
}
