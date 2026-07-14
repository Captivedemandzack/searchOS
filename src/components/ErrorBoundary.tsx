import { Component, type ReactNode } from 'react'

/**
 * Last-resort guard so a single bad render can't white-screen the whole app —
 * upholds the "always renders" principle even if a view hits unexpected data
 * (e.g. mid-refetch after a sync). Shows a minimal recover-by-reload fallback.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Groundwork render error:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            fontFamily: 'system-ui, sans-serif',
            color: '#3c3c36',
            background: '#f6f6f3',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>Something went wrong rendering this view.</div>
          <div style={{ fontSize: 13, color: '#8b8b82', maxWidth: 420, textAlign: 'center' }}>
            {this.state.error.message}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 6,
              background: '#1c1c19',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 550,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
