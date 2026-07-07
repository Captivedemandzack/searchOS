import { impactRows } from '../data'
import { colors, mono, pill, th } from '../theme'
import { Card } from '../components/primitives'

const cols = 'minmax(0,1.6fr) 100px 130px 130px 110px'

export function ImpactView() {
  return (
    <div>
      <div style={{ margin: '2px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Impact tracking</h1>
        <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
          Every published change is annotated against GSC and GA4 so you can see what actually worked.
        </div>
      </div>

      {/* annotated chart */}
      <Card style={{ padding: '16px 18px 10px', maxWidth: 980, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Organic clicks with change annotations</div>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: colors.muted2 }}>▲ = published change</span>
        </div>
        <svg viewBox="0 0 640 150" style={{ width: '100%', display: 'block' }}>
          <line x1="0" y1="35" x2="640" y2="35" stroke="#f0f0ea" />
          <line x1="0" y1="75" x2="640" y2="75" stroke="#f0f0ea" />
          <line x1="0" y1="115" x2="640" y2="115" stroke="#f0f0ea" />
          <line x1="170" y1="20" x2="170" y2="130" stroke={colors.amberDot} strokeDasharray="3,3" opacity="0.6" />
          <line x1="360" y1="20" x2="360" y2="130" stroke={colors.amberDot} strokeDasharray="3,3" opacity="0.6" />
          <line x1="500" y1="20" x2="500" y2="130" stroke={colors.amberDot} strokeDasharray="3,3" opacity="0.6" />
          <path
            d="M0,112 L64,110 L128,113 L170,108 L232,96 L296,90 L360,92 L420,78 L480,70 L500,68 L560,54 L640,46 L640,140 L0,140 Z"
            fill={colors.accent}
            opacity="0.06"
          />
          <polyline
            points="0,112 64,110 128,113 170,108 232,96 296,90 360,92 420,78 480,70 500,68 560,54 640,46"
            fill="none"
            stroke={colors.accent}
            strokeWidth="2"
          />
          <text x="164" y="16" fontSize="10" fill={colors.amber}>▲</text>
          <text x="354" y="16" fontSize="10" fill={colors.amber}>▲</text>
          <text x="494" y="16" fontSize="10" fill={colors.amber}>▲</text>
        </svg>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10.5,
            color: colors.faint,
            padding: '6px 2px 4px',
          }}
        >
          <span>May 1</span>
          <span>May 26</span>
          <span>Jun 16</span>
          <span>Jul 7</span>
        </div>
      </Card>

      {/* published change table */}
      <Card style={{ overflow: 'hidden', maxWidth: 980 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: cols,
            gap: 12,
            padding: '9px 18px',
            borderBottom: `1px solid ${colors.hair}`,
            background: colors.subtle,
          }}
        >
          <span style={th}>Published change</span>
          <span style={th}>Date</span>
          <span style={th}>Clicks</span>
          <span style={th}>Position</span>
          <span style={th}>Verdict</span>
        </div>
        {impactRows.map((ir) => (
          <div
            key={ir.label + ir.page}
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              gap: 12,
              padding: '12px 18px',
              borderBottom: `1px solid ${colors.hair3}`,
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{ir.label}</div>
              <div style={{ fontSize: 11.5, color: colors.muted2, fontFamily: mono }}>{ir.page}</div>
            </div>
            <span style={{ fontSize: 12, color: colors.text }}>{ir.date}</span>
            <span style={{ fontSize: 12, fontWeight: 650, color: ir.good ? colors.green : colors.muted }}>
              {ir.clicks}
            </span>
            <span style={{ fontSize: 12, color: colors.text }}>{ir.pos}</span>
            <span style={ir.good ? pill(colors.green, colors.greenBg) : pill(colors.amber, colors.amberBg)}>
              {ir.verdict}
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}
