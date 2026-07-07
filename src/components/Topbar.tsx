import { sites } from '../data'
import { useReview } from '../selectors'
import { useStore, syncMeta } from '../store'
import { colors, shadow } from '../theme'
import { HButton } from '../lib/Hover'

export function Topbar() {
  const { state, setState, nav, showToast, cycleSync } = useStore()
  const { pendingCount } = useReview()
  const site = sites[state.siteIdx]
  const initials = site.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
  const sync = syncMeta(state.syncState)

  return (
    <header
      style={{
        height: 54,
        flex: 'none',
        background: colors.topbar,
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 22px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Site switcher */}
      <div style={{ position: 'relative' }}>
        <HButton
          onClick={() => setState({ siteMenuOpen: !state.siteMenuOpen })}
          hover={{ background: '#f6f6f1' }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: `1px solid ${colors.borderInput}`,
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 13,
            fontWeight: 600,
            color: colors.ink,
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              background: colors.accentSoftBg,
              color: colors.accent,
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initials}
          </span>
          {site.name}
          <span style={{ fontSize: 10, color: colors.muted2 }}>▾</span>
        </HButton>
        {state.siteMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 38,
              left: 0,
              width: 250,
              background: '#fff',
              border: `1px solid ${colors.borderInput}`,
              borderRadius: 10,
              boxShadow: shadow.menu,
              padding: 6,
              zIndex: 60,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '.05em',
                textTransform: 'uppercase',
                color: colors.muted2,
                padding: '6px 8px 4px',
              }}
            >
              Client sites
            </div>
            {sites.map((s, i) => {
              const ini = s.name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
              return (
                <HButton
                  key={s.domain}
                  onClick={() => {
                    setState({ siteIdx: i, siteMenuOpen: false })
                    showToast('Switched to ' + s.name)
                  }}
                  hover={{ background: '#f4f4ee' }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    border: 'none',
                    background: 'none',
                    padding: '7px 8px',
                    borderRadius: 7,
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      background: colors.accentSoftBg,
                      color: colors.accent,
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    {ini}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span
                      style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: colors.ink }}
                    >
                      {s.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: colors.muted2 }}>
                      {s.domain}
                    </span>
                  </span>
                  {i === state.siteIdx && (
                    <span style={{ color: colors.accent, fontSize: 12 }}>✓</span>
                  )}
                </HButton>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: colors.border }} />

      <select
        value={state.dateRange}
        onChange={(e) => setState({ dateRange: e.target.value })}
        style={{
          border: `1px solid ${colors.borderInput}`,
          borderRadius: 8,
          padding: '5px 8px',
          fontSize: 12.5,
          color: colors.text,
          background: '#fff',
        }}
      >
        <option>Last 28 days</option>
        <option>Last 3 months</option>
        <option>Last 12 months</option>
      </select>

      <button
        onClick={cycleSync}
        title="Cycle demo sync state"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12,
          color: colors.muted,
          background: 'none',
          border: 'none',
          padding: 0,
        }}
      >
        <span
          style={{ width: 7, height: 7, borderRadius: 99, background: sync.dot, animation: sync.anim }}
        />
        {sync.label}
      </button>

      <div style={{ flex: 1 }} />

      <HButton
        onClick={() => nav('review')}
        hover={{ background: '#f6f6f1' }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: '#fff',
          border: `1px solid ${colors.borderInput}`,
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12.5,
          fontWeight: 550,
          color: colors.ink,
        }}
      >
        Review queue
        <span
          style={{
            fontSize: 11,
            fontWeight: 650,
            color: colors.amber,
            background: colors.amberBg,
            borderRadius: 99,
            padding: '1px 7px',
          }}
        >
          {pendingCount}
        </span>
      </HButton>
      <HButton
        onClick={() => nav('opportunities')}
        hover={{ background: colors.inkStrong }}
        style={{
          background: colors.ink,
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '7px 13px',
          fontSize: 12.5,
          fontWeight: 550,
        }}
      >
        New update
      </HButton>
    </header>
  )
}
