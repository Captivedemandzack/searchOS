import { competitors, contentGapCards, kwGaps, serpFeatures } from '../data'
import { useStore } from '../store'
import { colors, mono, pill, th } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'

const gapCols = 'minmax(0,1.4fr) 64px 66px 56px 64px 80px 150px'

export function CompetitorsView() {
  const { showToast } = useStore()

  return (
    <div>
      <div style={{ margin: '2px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>
          Competitor intelligence
        </h1>
        <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
          Tracked weekly against 4 competitors in the Nashville med-spa market.
        </div>
      </div>

      {/* competitor cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {competitors.map((c) => (
          <Card key={c.domain} style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 11.5, color: colors.muted2, fontFamily: mono, marginTop: 1 }}>
              {c.domain}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 10.5, color: colors.muted2 }}>Overlap</div>
                <div style={{ fontSize: 14, fontWeight: 650 }}>{c.overlap}</div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: colors.muted2 }}>They rank, we don’t</div>
                <div style={{ fontSize: 14, fontWeight: 650, color: colors.amber }}>{c.gaps} kw</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, alignItems: 'start' }}>
        {/* keyword gap table */}
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, padding: '14px 18px', borderBottom: `1px solid ${colors.hair}` }}>
            Keyword gap
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gapCols,
              gap: 10,
              padding: '8px 18px',
              borderBottom: `1px solid ${colors.hair2}`,
              background: colors.subtle,
            }}
          >
            <span style={th}>Keyword</span>
            <span style={th}>Volume</span>
            <span style={th}>Best comp.</span>
            <span style={th}>Us</span>
            <span style={th}>Difficulty</span>
            <span style={th}>Est. value</span>
            <span style={th}>Action</span>
          </div>
          {kwGaps.map((k) => (
            <div
              key={k.kw}
              style={{
                display: 'grid',
                gridTemplateColumns: gapCols,
                gap: 10,
                padding: '10px 18px',
                borderBottom: `1px solid ${colors.hair3}`,
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  color: colors.ink,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {k.kw}
              </span>
              <span style={{ fontSize: 12, color: colors.text }}>{k.vol}</span>
              <span style={{ fontSize: 12, color: colors.text }}>#{k.comp}</span>
              <span style={k.bad ? { fontSize: 12, fontWeight: 650, color: colors.red } : { fontSize: 12, color: colors.text }}>
                {k.us}
              </span>
              <span style={{ fontSize: 12, color: colors.text }}>{k.diff}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.green }}>{k.value}</span>
              <HButton
                onClick={() => showToast('Opportunity created from competitor gap')}
                hover={{ background: '#f6f6f1' }}
                style={{
                  background: '#fff',
                  border: `1px solid ${colors.borderBtn}`,
                  borderRadius: 7,
                  padding: '4px 9px',
                  fontSize: 11,
                  fontWeight: 550,
                  color: colors.ink,
                  justifySelf: 'start',
                }}
              >
                {k.action}
              </HButton>
            </div>
          ))}
        </Card>

        {/* right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Pages to create</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {contentGapCards.map((cg) => (
                <div
                  key={cg.title}
                  style={{
                    border: `1px solid ${colors.hair}`,
                    borderRadius: 8,
                    padding: '11px 13px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
                      {cg.title}
                    </span>
                    <span style={cg.priority === 'High' ? pill(colors.green, colors.greenBg) : pill(colors.amber, colors.amberBg)}>
                      {cg.priority}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: colors.muted2, lineHeight: 1.5 }}>{cg.why}</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: colors.muted }}>
                    <span>Difficulty {cg.diff}</span>
                    <span>Value {cg.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>
              SERP feature opportunities
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {serpFeatures.map((sf) => (
                <div key={sf.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 12.5, color: colors.text }}>{sf.label}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: colors.accent }}>{sf.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
