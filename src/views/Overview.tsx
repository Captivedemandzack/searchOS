import { useData, useDataLoading, useDataStatus, useCurrentSite, useSiteId } from '../data/DataProvider'
import { useWorkItems } from '../selectors'
import { useStore } from '../store'
import { colors, pill } from '../theme'
import { Card } from '../components/primitives'
import { EstimateUpside } from '../components/EstimateUpside'
import { OpportunityRowButton } from '../components/OpportunityRowButton'
import { TrendChart } from '../components/TrendChart'
import {
  ListCardSkeleton,
  MetricCardsSkeleton,
  SeoScoreSkeleton,
  TrendChartSkeleton,
} from '../components/Skeleton'
import { HButton } from '../lib/Hover'
import { openOpportunity } from '../lib/workflow'
import type { NextStep } from '../lib/api'

/** A scan's overall severity — the level of its most urgent gap. */
function scanSeverity(highCount: number, mediumCount: number): 'High' | 'Medium' | 'Low' {
  if (highCount > 0) return 'High'
  if (mediumCount > 0) return 'Medium'
  return 'Low'
}
function severityPill(sev: string) {
  if (sev === 'High') return pill(colors.red, colors.redBg)
  if (sev === 'Medium') return pill(colors.amber, colors.amberBg)
  return pill(colors.muted, colors.chipBg)
}

export function OverviewView() {
  const { state, setState, nav } = useStore()
  const { openCount, todo } = useWorkItems()
  const {
    competitorScans,
    losingPages,
    metrics,
    recentPublished,
    scoreParts,
    seoScore,
    trend,
    trendSeries,
    reviewData,
  } = useData()
  const site = useCurrentSite()
  const siteId = useSiteId()

  const topOpportunities = todo.slice(0, 3)

  function handleOpenStep(step: NextStep) {
    openOpportunity(step, { nav, setState }, reviewData, { siteId: siteId ?? undefined })
  }

  const dataStatus = useDataStatus()
  const { bootstrapLoading, dashboardLoading } = useDataLoading()
  const metricsLoading = dashboardLoading && metrics.length === 0
  const hasTrend = (trendSeries?.current?.clicks?.length ?? trend.current.length) >= 2
  const showDataBanner =
    dataStatus === 'live' &&
    !bootstrapLoading &&
    openCount === 0 &&
    (!hasTrend || metrics.length === 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 18px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Dashboard</h1>
        <span style={{ fontSize: 12.5, color: colors.muted2 }}>
          {site.domain} · {state.dateRange}
        </span>
      </div>

      {showDataBanner && (
        <Card style={{ padding: '12px 16px', marginBottom: 14, background: colors.amberBg, border: `1px solid ${colors.amber}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>
            {!hasTrend ? 'Connect your data sources to see performance and opportunities.' : 'No opportunities yet — run a full sync from Settings.'}
          </div>
          <div style={{ fontSize: 12, color: colors.muted2, marginTop: 4 }}>
            After WordPress, Search Console, and GA4 sync, your highest-impact fixes rank here automatically.
          </div>
        </Card>
      )}

      {metricsLoading ? (
        <MetricCardsSkeleton />
      ) : (
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
      )}

      {metricsLoading ? (
        <TrendChartSkeleton />
      ) : (
        <Card style={{ padding: '16px 18px 10px', marginBottom: 14 }}>
          <TrendChart series={trendSeries ?? undefined} fallbackTrend={trend} />
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 332px', gap: 14, alignItems: 'start', marginBottom: 14 }}>
        {metricsLoading ? (
          <SeoScoreSkeleton />
        ) : (
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>SEO Operating Score</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1 }}>
                {seoScore.overall}
              </span>
              <span style={{ fontSize: 13, color: colors.muted2 }}>/ 100</span>
              {seoScore.delta !== 0 && (
                <span
                  title="vs. the previous period"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: seoScore.delta >= 0 ? colors.green : colors.red,
                    background: seoScore.delta >= 0 ? colors.greenBg : colors.redBg,
                    borderRadius: 99,
                    padding: '2px 8px',
                  }}
                >
                  {seoScore.delta >= 0 ? '▲' : '▼'}
                  {Math.abs(seoScore.delta)}
                </span>
              )}
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
        )}

        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Top opportunities</div>
            <HButton
              onClick={() => nav('opportunities')}
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
              View all {openCount} →
            </HButton>
          </div>
          {bootstrapLoading ? (
            <div style={{ fontSize: 12, color: colors.muted2 }}>Loading…</div>
          ) : topOpportunities.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topOpportunities.map((step) => (
                <div
                  key={step.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: `1px solid ${colors.hair3}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {step.title}
                    </div>
                    <div style={{ fontSize: 11, color: colors.muted2, marginTop: 2 }}>{step.context}</div>
                  </div>
                  <EstimateUpside estMonthlyClicks={step.estMonthlyClicks} compact />
                  <OpportunityRowButton variant="start" onClick={() => handleOpenStep(step)} size="compact" />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: colors.muted2, lineHeight: 1.5 }}>
              Ranked fixes from Search Console and site audits will appear here after your next sync.
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {metricsLoading ? (
          <>
            <ListCardSkeleton title="Pages losing traffic" rows={4} />
            <ListCardSkeleton title="Recently completed" rows={3} />
          </>
        ) : (
          <>
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
                      onClick={() => {
                        setState({ selectedPage: p.path })
                        nav('pages')
                      }}
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
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Recently completed</div>
                <HButton
                  onClick={() => {
                    setState({ oppTab: 'completed' })
                    nav('opportunities')
                  }}
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
                  View all →
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
                        Completed
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: colors.muted2 }}>{rp.meta}</div>
                  </div>
                ))}
                {recentPublished.length === 0 && (
                  <div style={{ fontSize: 12, color: colors.muted2 }}>
                    Approved and pushed changes show up here after you complete work in Opportunities.
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>

      {!metricsLoading && competitorScans.length > 0 && (
        <Card style={{ padding: '14px 18px', marginTop: 14 }}>
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
              New analysis →
            </HButton>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {competitorScans.map((scan, i) => (
              <HButton
                key={scan.id}
                onClick={() => nav('competitors')}
                hover={{ background: '#fafaf7' }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderTop: i === 0 ? 'none' : `1px solid ${colors.hair2}`,
                  borderRadius: 6,
                  padding: '8px 2px',
                  cursor: 'pointer',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: colors.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    “{scan.keyword}”
                  </span>
                  {scan.topGap && (
                    <span
                      title={scan.topGap}
                      style={{
                        display: 'block',
                        fontSize: 11.5,
                        color: colors.muted2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: 2,
                      }}
                    >
                      {scan.topGap}
                    </span>
                  )}
                </span>
                <span style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={severityPill(scanSeverity(scan.highCount, scan.mediumCount))}>
                    {scanSeverity(scan.highCount, scan.mediumCount)}
                  </span>
                  <span style={{ fontSize: 10.5, color: colors.faint }}>{scan.when}</span>
                </span>
              </HButton>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
