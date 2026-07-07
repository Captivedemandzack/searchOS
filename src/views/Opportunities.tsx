import { opps } from '../data'
import { useOpportunities } from '../selectors'
import { useStore } from '../store'
import { colors, th } from '../theme'
import { Card } from '../components/primitives'
import { HButton, HDiv } from '../lib/Hover'

const selectStyle = {
  border: `1px solid ${colors.borderInput}`,
  borderRadius: 8,
  padding: '5px 8px',
  fontSize: 12,
  background: '#fff',
  color: colors.text,
}

export function OpportunitiesView() {
  const { state, setState } = useStore()
  const { filtered, mkOpp } = useOpportunities()
  const f = state.filters
  const rows = filtered.map(mkOpp)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 6px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Opportunities</h1>
        <span style={{ fontSize: 12.5, color: colors.muted2 }}>
          {filtered.length} of {opps.length} shown · sorted by priority
        </span>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: colors.muted }}>
        Ranked by expected impact × confidence, weighted against effort. Nothing here changes your site
        until it clears review.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={f.type} onChange={(e) => setState({ filters: { ...f, type: e.target.value } })} style={selectStyle}>
          <option value="All">Type: All</option>
          <option>Metadata</option>
          <option>Content</option>
          <option>Internal links</option>
          <option>Schema</option>
          <option>Technical</option>
          <option>New page</option>
        </select>
        <select value={f.impact} onChange={(e) => setState({ filters: { ...f, impact: e.target.value } })} style={selectStyle}>
          <option value="All">Impact: All</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <select value={f.effort} onChange={(e) => setState({ filters: { ...f, effort: e.target.value } })} style={selectStyle}>
          <option value="All">Effort: All</option>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
        <select value={f.source} onChange={(e) => setState({ filters: { ...f, source: e.target.value } })} style={selectStyle}>
          <option value="All">Source: All</option>
          <option>GSC</option>
          <option>GA4</option>
          <option>Crawl</option>
          <option>Competitor</option>
          <option>Manual</option>
        </select>
        <select value={f.status} onChange={(e) => setState({ filters: { ...f, status: e.target.value } })} style={selectStyle}>
          <option value="All">Status: All</option>
          <option>Open</option>
          <option>In review</option>
        </select>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1.6fr) 90px 90px 70px 110px 200px',
            gap: 12,
            alignItems: 'center',
            padding: '9px 18px',
            borderBottom: `1px solid ${colors.hair}`,
            background: colors.subtle,
          }}
        >
          <span style={th}>Opportunity</span>
          <span style={th}>Impact</span>
          <span style={th}>Confidence</span>
          <span style={th}>Effort</span>
          <span style={th}>Source</span>
          <span />
        </div>

        {rows.map((o) => (
          <HDiv key={o.id} style={o.rowStyle} hover={{ background: colors.subtleAlt }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{o.title}</div>
              <div
                style={{
                  fontSize: 12,
                  color: colors.muted2,
                  marginTop: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <span style={{ fontFamily: "'Geist Mono', monospace" }}>{o.page}</span> — {o.why}
              </div>
            </div>
            <span style={o.impactPill}>{o.impact}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 34, height: 4, background: colors.track, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: colors.accent, borderRadius: 99, width: o.confPct }} />
              </div>
              <span style={{ fontSize: 11.5, color: colors.muted }}>{o.confidence}%</span>
            </div>
            <span style={{ fontSize: 12, color: colors.text }}>{o.effort}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 550,
                color: colors.muted,
                background: colors.chipBg2,
                borderRadius: 6,
                padding: '2px 7px',
                justifySelf: 'start',
              }}
            >
              {o.source}
            </span>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              {o.inReview && (
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: colors.amber,
                    background: colors.amberBg,
                    borderRadius: 99,
                    padding: '4px 10px',
                  }}
                >
                  In review queue
                </span>
              )}
              {o.showButtons && (
                <>
                  <HButton
                    onClick={o.onReview}
                    hover={{ background: '#f6f6f1' }}
                    style={{
                      background: '#fff',
                      border: `1px solid ${colors.borderBtn}`,
                      borderRadius: 7,
                      padding: '5px 10px',
                      fontSize: 11.5,
                      fontWeight: 550,
                      color: colors.ink,
                    }}
                  >
                    Review action
                  </HButton>
                  <HButton
                    onClick={o.onGenerate}
                    hover={{ background: colors.inkStrong }}
                    style={{
                      background: colors.ink,
                      border: `1px solid ${colors.ink}`,
                      borderRadius: 7,
                      padding: '5px 10px',
                      fontSize: 11.5,
                      fontWeight: 550,
                      color: '#fff',
                    }}
                  >
                    {o.genLabel}
                  </HButton>
                </>
              )}
            </div>
          </HDiv>
        ))}

        {filtered.length === 0 && (
          <div style={{ padding: 36, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
              No opportunities match these filters
            </div>
            <div style={{ fontSize: 12, color: colors.muted2, marginTop: 4 }}>
              Try widening the impact or source filter.
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
