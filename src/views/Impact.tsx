import { useQuery } from '@tanstack/react-query'
import { useData, useSiteId } from '../data/DataProvider'
import { TrendChart } from '../components/TrendChart'
import { colors, mono, pill, th } from '../theme'
import { Card } from '../components/primitives'
import { api } from '../lib/api'

const cols = 'minmax(0,1.6fr) 100px 130px 130px 110px'

function verdictPill(verdict: string) {
  if (verdict === 'Improving') return pill(colors.green, colors.greenBg)
  if (verdict === 'Regressed') return pill(colors.red, colors.redBg)
  return pill(colors.amber, colors.amberBg)
}

export function ImpactView() {
  const { trend, trendSeries } = useData()
  const siteId = useSiteId()
  const changes = useQuery({
    queryKey: ['impact-changes', siteId],
    queryFn: () => api.impactChanges(siteId!),
    enabled: !!siteId,
  })

  const rows = changes.data ?? []

  return (
    <div>
      <div style={{ margin: '2px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Impact</h1>
        <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
          Published changes measured against 28-day before/after Search Console data.
        </div>
      </div>

      <Card style={{ padding: '16px 18px 10px', maxWidth: 980, marginBottom: 14 }}>
        <TrendChart
          series={trendSeries ?? undefined}
          fallbackTrend={trend}
          title="Organic clicks"
          height={150}
        />
      </Card>

      <Card style={{ overflow: 'hidden', maxWidth: 980 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '9px 18px', borderBottom: `1px solid ${colors.hair}`, background: colors.subtle }}>
          <span style={th}>Published change</span>
          <span style={th}>Date</span>
          <span style={th}>Clicks (28d)</span>
          <span style={th}>Position</span>
          <span style={th}>Verdict</span>
        </div>
        {changes.isLoading && <div style={{ padding: 18, fontSize: 12.5, color: colors.muted2 }}>Loading impact data…</div>}
        {rows.map((ir) => (
          <div key={ir.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '12px 18px', borderBottom: `1px solid ${colors.hair3}`, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{ir.element}</div>
              <div style={{ fontSize: 11.5, color: colors.muted2, fontFamily: mono }}>{ir.page}</div>
            </div>
            <span style={{ fontSize: 12, color: colors.text }}>{new Date(ir.publishedAt).toLocaleDateString()}</span>
            <span style={{ fontSize: 12, fontWeight: 650, color: ir.verdict === 'Improving' ? colors.green : colors.muted }}>
              {ir.clicksBefore28d != null && ir.clicksAfter28d != null
                ? `${ir.clicksBefore28d} → ${ir.clicksAfter28d}`
                : '—'}
            </span>
            <span style={{ fontSize: 12, color: colors.text }}>
              {ir.positionBefore != null && ir.positionAfter != null
                ? `${ir.positionBefore.toFixed(1)} → ${ir.positionAfter.toFixed(1)}`
                : '—'}
            </span>
            <span style={verdictPill(ir.verdict)}>{ir.verdict}</span>
          </div>
        ))}
        {!changes.isLoading && rows.length === 0 && (
          <div style={{ padding: 24, fontSize: 12.5, color: colors.muted2, textAlign: 'center' }}>
            No published changes yet. Approve items in Review Queue to start measuring impact.
          </div>
        )}
      </Card>
    </div>
  )
}
