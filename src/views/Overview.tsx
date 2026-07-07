import {
  compGaps,
  losingPages,
  metrics,
  opps,
  readyItems,
  recentPublished,
  scoreParts,
  sites,
} from '../data'
import { useReview, useOpportunities } from '../selectors'
import { useStore } from '../store'
import { colors, pill } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'

export function OverviewView() {
  const { state, nav } = useStore()
  const { withStatus, mkOpp } = useOpportunities()
  const { pendingCount } = useReview()
  const site = sites[state.siteIdx]
  const topOpps = withStatus.slice(0, 4).map(mkOpp)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 18px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Overview</h1>
        <span style={{ fontSize: 12.5, color: colors.muted2 }}>
          {site.domain} · {state.dateRange}
        </span>
      </div>

      {/* Metric cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5,1fr)',
          gap: 12,
          marginBottom: 14,
        }}
      >
        {metrics.map((m) => (
          <Card key={m.label} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11.5, fontWeight: 550, color: colors.muted }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-.02em' }}>{m.value}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 650, color: m.up ? colors.green : colors.red }}>
                {m.delta}
              </span>
              <span style={{ fontSize: 11, color: colors.muted2 }}>vs prev. period</span>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 332px', gap: 14, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Trend chart */}
          <Card style={{ padding: '16px 18px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Organic growth trend</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginLeft: 'auto',
                  fontSize: 11.5,
                  color: colors.muted,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 2, background: colors.accent, borderRadius: 2 }} />
                  Clicks
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 2, background: '#c9c9c0', borderRadius: 2 }} />
                  Prev. period
                </span>
              </div>
            </div>
            <svg viewBox="0 0 640 170" style={{ width: '100%', height: 'auto', display: 'block' }}>
              <line x1="0" y1="40" x2="640" y2="40" stroke="#f0f0ea" strokeWidth="1" />
              <line x1="0" y1="80" x2="640" y2="80" stroke="#f0f0ea" strokeWidth="1" />
              <line x1="0" y1="120" x2="640" y2="120" stroke="#f0f0ea" strokeWidth="1" />
              <path
                d="M0,132 L53,128 L106,131 L160,120 L213,124 L266,112 L320,106 L373,110 L426,94 L480,86 L533,80 L586,68 L640,60 L640,160 L0,160 Z"
                fill={colors.accent}
                opacity="0.06"
              />
              <polyline
                points="0,138 53,134 106,136 160,130 213,133 266,126 320,124 373,127 426,120 480,118 533,116 586,113 640,112"
                fill="none"
                stroke="#c9c9c0"
                strokeWidth="1.5"
              />
              <polyline
                points="0,132 53,128 106,131 160,120 213,124 266,112 320,106 373,110 426,94 480,86 533,80 586,68 640,60"
                fill="none"
                stroke={colors.accent}
                strokeWidth="2"
              />
              <circle cx="640" cy="60" r="3.5" fill={colors.accent} />
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
              <span>Apr 14</span>
              <span>May 5</span>
              <span>May 26</span>
              <span>Jun 16</span>
              <span>Jul 7</span>
            </div>
          </Card>

          {/* Opportunity feed */}
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 18px',
                borderBottom: `1px solid ${colors.hair}`,
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Top opportunities this week</div>
              <HButton
                onClick={() => nav('opportunities')}
                hover={{ textDecoration: 'underline' }}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 550,
                  color: colors.accent,
                  padding: 0,
                }}
              >
                View all {opps.length} →
              </HButton>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {topOpps.map((o) => (
                <div
                  key={o.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 18px',
                    borderBottom: `1px solid ${colors.hair2}`,
                  }}
                >
                  <span style={o.impactPill}>{o.impact}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{o.title}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: colors.muted2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {o.page} · {o.why}
                    </div>
                  </div>
                  <div
                    style={{ fontSize: 11.5, color: colors.muted, flex: 'none', textAlign: 'right' }}
                  >
                    <div style={{ fontWeight: 600, color: colors.ink }}>{o.expected}</div>
                    <div>{o.effort} effort</div>
                  </div>
                  <HButton
                    onClick={o.onReview}
                    hover={{ background: '#f6f6f1' }}
                    style={{
                      flex: 'none',
                      background: '#fff',
                      border: `1px solid ${colors.borderBtn}`,
                      borderRadius: 7,
                      padding: '5px 11px',
                      fontSize: 12,
                      fontWeight: 550,
                      color: colors.ink,
                    }}
                  >
                    Review
                  </HButton>
                </div>
              ))}
            </div>
          </Card>

          {/* Losing traffic + competitor gaps */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Pages losing traffic</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {losingPages.map((p) => (
                  <div key={p.path} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        fontFamily: "'Geist Mono', monospace",
                        color: colors.text,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.path}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 650, color: colors.red }}>{p.delta}</span>
                    <HButton
                      onClick={() => nav('pages')}
                      hover={{ textDecoration: 'underline' }}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: 11.5,
                        color: colors.accent,
                        fontWeight: 550,
                        padding: 0,
                      }}
                    >
                      Diagnose
                    </HButton>
                  </div>
                ))}
              </div>
            </Card>
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Competitor gaps</div>
                <HButton
                  onClick={() => nav('competitors')}
                  hover={{ textDecoration: 'underline' }}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    fontSize: 11.5,
                    color: colors.accent,
                    fontWeight: 550,
                    padding: 0,
                  }}
                >
                  Open →
                </HButton>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {compGaps.map((g) => (
                  <div key={g.kw} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: colors.text }}>{g.kw}</span>
                    <span style={{ fontSize: 11.5, color: colors.muted2 }}>{g.vol}/mo</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: colors.amber }}>{g.note}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Score */}
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>SEO Operating Score</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em' }}>72</span>
              <span style={{ fontSize: 13, color: colors.muted2 }}>/ 100</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 650, color: colors.green }}>
                +4 this month
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
              {scoreParts.map((sp) => (
                <div key={sp.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 76, fontSize: 11.5, color: colors.muted }}>{sp.label}</span>
                  <div
                    style={{
                      flex: 1,
                      height: 5,
                      background: colors.track,
                      borderRadius: 99,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ height: '100%', borderRadius: 99, background: sp.color, width: sp.pct }} />
                  </div>
                  <span
                    style={{ width: 22, textAlign: 'right', fontSize: 11.5, fontWeight: 600, color: colors.text }}
                  >
                    {sp.val}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Ready for review */}
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Ready for review</div>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  fontWeight: 650,
                  color: colors.amber,
                  background: colors.amberBg,
                  borderRadius: 99,
                  padding: '1px 8px',
                }}
              >
                {pendingCount} pending
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {readyItems.map((r) => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{ width: 6, height: 6, borderRadius: 99, background: colors.amberDot, flex: 'none' }}
                  />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: colors.text,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {r.label}
                  </span>
                  <span style={{ fontSize: 11, color: colors.muted2, flex: 'none' }}>{r.kind}</span>
                </div>
              ))}
            </div>
            <HButton
              onClick={() => nav('review')}
              hover={{ background: colors.inkStrong }}
              style={{
                width: '100%',
                background: colors.ink,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 0',
                fontSize: 12.5,
                fontWeight: 550,
              }}
            >
              Open review queue
            </HButton>
          </Card>

          {/* Recently published */}
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Recently published</div>
              <HButton
                onClick={() => nav('impact')}
                hover={{ textDecoration: 'underline' }}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  fontSize: 11.5,
                  color: colors.accent,
                  fontWeight: 550,
                  padding: 0,
                }}
              >
                Impact →
              </HButton>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentPublished.map((rp) => (
                <div key={rp.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12.5,
                        fontWeight: 550,
                        color: colors.ink,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {rp.label}
                    </span>
                    <span style={rp.good ? pill(colors.green, colors.greenBg) : pill(colors.amber, colors.amberBg)}>
                      {rp.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: colors.muted2 }}>{rp.meta}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
