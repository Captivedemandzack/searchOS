import { techIssues } from '../data'
import { useStore } from '../store'
import { colors, riskPill, th } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'

const cols = 'minmax(0,1.6fr) 90px 90px 130px 140px'

export function TechnicalView() {
  const { showToast } = useStore()

  return (
    <div>
      <div style={{ margin: '2px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Technical SEO</h1>
        <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
          From last crawl · Jul 6, 4:12 AM · 214 URLs
        </div>
      </div>

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
          <span style={th}>Issue</span>
          <span style={th}>Affected</span>
          <span style={th}>Severity</span>
          <span style={th}>Status</span>
          <span />
        </div>
        {techIssues.map((ti) => (
          <div
            key={ti.issue}
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
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{ti.issue}</div>
              <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 1 }}>{ti.detail}</div>
            </div>
            <span style={{ fontSize: 12, color: colors.text }}>{ti.affected}</span>
            <span style={riskPill(ti.severity)}>{ti.severity}</span>
            <span style={{ fontSize: 12, color: colors.muted }}>{ti.status}</span>
            {ti.fixReady ? (
              <HButton
                onClick={() => showToast('Fix added to review queue')}
                hover={{ background: '#f6f6f1' }}
                style={{
                  background: '#fff',
                  border: `1px solid ${colors.borderBtn}`,
                  borderRadius: 7,
                  padding: '5px 10px',
                  fontSize: 11.5,
                  fontWeight: 550,
                  color: colors.ink,
                  justifySelf: 'end',
                }}
              >
                Queue fix
              </HButton>
            ) : (
              <span />
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}
