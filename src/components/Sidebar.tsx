import { navDefs } from '../data'
import { useReview } from '../selectors'
import { useStore, syncMeta } from '../store'
import { colors } from '../theme'
import { HButton } from '../lib/Hover'

export function Sidebar() {
  const { state, nav, cycleSync } = useStore()
  const { pendingCount } = useReview()
  const sync = syncMeta(state.syncState)

  return (
    <nav
      style={{
        width: 216,
        flex: 'none',
        background: colors.sidebar,
        borderRight: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 10px',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 8px 14px' }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: colors.ink,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          G
        </div>
        <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-.01em' }}>Groundwork</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {navDefs.map(([id, label, count]) => {
          const active = state.view === id
          const badge = id === 'review' ? pendingCount : count ?? false
          return (
            <HButton
              key={id}
              onClick={() => nav(id)}
              hover={active ? undefined : { background: colors.chipBg }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                border: 'none',
                textAlign: 'left',
                background: active ? colors.navActiveBg : 'none',
                color: active ? colors.ink : colors.navIdle,
                fontWeight: active ? 600 : 500,
                fontSize: 13,
                padding: '7px 10px',
                borderRadius: 7,
              }}
            >
              <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
              {badge ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: colors.muted2,
                    background: '#eeeee8',
                    borderRadius: 99,
                    padding: '1px 7px',
                  }}
                >
                  {badge}
                </span>
              ) : null}
            </HButton>
          )
        })}
      </div>

      <div
        style={{
          marginTop: 'auto',
          borderTop: `1px solid ${colors.hair}`,
          padding: '12px 8px 2px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <button
          onClick={cycleSync}
          title="Cycle demo sync state"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            padding: 0,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 99,
              background: sync.dot,
              animation: sync.anim,
            }}
          />
          <span style={{ fontSize: 11.5, color: colors.muted }}>{sync.label}</span>
        </button>
        <div style={{ fontSize: 11.5, color: colors.muted2 }}>Belle Meade Digital · Agency plan</div>
      </div>
    </nav>
  )
}
