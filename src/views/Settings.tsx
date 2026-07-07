import { connections, sites } from '../data'
import { useStore } from '../store'
import { colors, pill } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'

export function SettingsView() {
  const { state } = useStore()
  const site = sites[state.siteIdx]

  return (
    <div>
      <div style={{ margin: '2px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Connections</h1>
        <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
          Data sources and publish targets for {site.domain}.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
        {connections.map((cn) => (
          <Card
            key={cn.abbr}
            style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: colors.chipBg2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: colors.muted,
                flex: 'none',
              }}
            >
              {cn.abbr}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{cn.name}</div>
              <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 1 }}>{cn.detail}</div>
            </div>
            <span style={pill(colors.green, colors.greenBg)}>{cn.status}</span>
            <HButton
              hover={{ background: '#f6f6f1' }}
              style={{
                background: '#fff',
                border: `1px solid ${colors.borderBtn}`,
                borderRadius: 7,
                padding: '5px 11px',
                fontSize: 11.5,
                fontWeight: 550,
                color: colors.ink,
              }}
            >
              Manage
            </HButton>
          </Card>
        ))}
      </div>
    </div>
  )
}
