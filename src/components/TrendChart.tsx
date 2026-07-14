import { useMemo, useState } from 'react'
import { colors } from '../theme'
import { HButton } from '../lib/Hover'

export type TrendMetricKey = 'clicks' | 'impressions' | 'position' | 'conversions' | 'engagementRate'

export type TrendSeriesPayload = {
  labels: string[]
  current: Record<TrendMetricKey, number[]>
  previous: Record<TrendMetricKey, number[]>
}

const METRIC_LABELS: Record<TrendMetricKey, string> = {
  clicks: 'Organic clicks',
  impressions: 'Impressions',
  position: 'Avg. position',
  conversions: 'Organic conversions',
  engagementRate: 'Engagement rate',
}

const LOWER_IS_BETTER: TrendMetricKey[] = ['position']

function fmtValue(key: TrendMetricKey, v: number): string {
  if (key === 'engagementRate') return `${(v * 100).toFixed(0)}%`
  if (key === 'position') return v.toFixed(1)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(Math.round(v))
}

type Props = {
  series: TrendSeriesPayload | null | undefined
  fallbackTrend?: { current: number[]; previous: number[]; labels: string[] }
  title?: string
  height?: number
}

export function TrendChart({ series, fallbackTrend, title = 'Performance trend', height = 170 }: Props) {
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [metric, setMetric] = useState<TrendMetricKey>('clicks')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const { current, previous, labels, hasData } = useMemo(() => {
    if (series?.current?.clicks?.length) {
      return {
        current: series.current[metric],
        previous: series.previous[metric],
        labels: series.labels,
        hasData: series.current[metric].length >= 2,
      }
    }
    if (fallbackTrend?.current?.length) {
      return {
        current: metric === 'clicks' ? fallbackTrend.current : [],
        previous: metric === 'clicks' ? fallbackTrend.previous : [],
        labels: fallbackTrend.labels,
        hasData: metric === 'clicks' && fallbackTrend.current.length >= 2,
      }
    }
    return { current: [], previous: [], labels: [], hasData: false }
  }, [series, fallbackTrend, metric])

  const chartW = 640
  const chartH = height
  const max = Math.max(1, ...current, ...previous)
  const min = LOWER_IS_BETTER.includes(metric) && previous.length ? Math.min(...current, ...previous) * 0.9 : 0
  const range = Math.max(max - min, 1)

  const toY = (v: number) => chartH - 12 - ((v - min) / range) * (chartH - 30)
  const toPoints = (vals: number[]) => {
    if (vals.length < 2) return ''
    const dx = chartW / (vals.length - 1)
    return vals.map((v, i) => `${(i * dx).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  }

  const curPoints = toPoints(current)
  const prevPoints = toPoints(previous)
  const areaPath = curPoints ? `M${curPoints.split(' ').join(' L')} L${chartW},${chartH - 10} L0,${chartH - 10} Z` : ''

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!current.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * chartW
    const idx = Math.round((x / chartW) * (current.length - 1))
    setHoverIdx(Math.max(0, Math.min(current.length - 1, idx)))
  }

  const tooltipX = hoverIdx != null ? (hoverIdx / Math.max(current.length - 1, 1)) * chartW : 0
  const tooltipVal = hoverIdx != null ? current[hoverIdx] : 0
  const tooltipPrev = hoverIdx != null ? previous[hoverIdx] : 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {(Object.keys(METRIC_LABELS) as TrendMetricKey[]).map((key) => (
            <HButton
              key={key}
              onClick={() => setMetric(key)}
              hover={{ background: metric === key ? colors.ink : '#f6f6f1' }}
              style={{
                background: metric === key ? colors.ink : '#fff',
                color: metric === key ? '#fff' : colors.muted,
                border: `1px solid ${metric === key ? colors.ink : colors.borderBtn}`,
                borderRadius: 99,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 550,
              }}
            >
              {METRIC_LABELS[key]}
            </HButton>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <line x1="0" y1="40" x2={chartW} y2="40" stroke="#f0f0ea" strokeWidth="1" />
          <line x1="0" y1="80" x2={chartW} y2="80" stroke="#f0f0ea" strokeWidth="1" />
          <line x1="0" y1="120" x2={chartW} y2="120" stroke="#f0f0ea" strokeWidth="1" />
          {hasData ? (
            <>
              <path d={areaPath} fill={colors.accent} opacity="0.06" />
              <polyline
                points={prevPoints}
                fill="none"
                stroke="#c9c9c0"
                strokeWidth="1.5"
                style={{ transition: prefersReducedMotion ? 'none' : 'opacity 0.2s' }}
              />
              <polyline
                points={curPoints}
                fill="none"
                stroke={colors.accent}
                strokeWidth="2"
                style={{ transition: prefersReducedMotion ? 'none' : 'opacity 0.2s' }}
              />
              {hoverIdx != null && (
                <>
                  <line
                    x1={tooltipX}
                    y1="8"
                    x2={tooltipX}
                    y2={chartH - 8}
                    stroke={colors.accent}
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    opacity="0.5"
                  />
                  <circle cx={tooltipX} cy={toY(tooltipVal ?? 0)} r="4" fill={colors.accent} />
                </>
              )}
            </>
          ) : (
            <text x={chartW / 2} y={chartH / 2} textAnchor="middle" fill={colors.faint} fontSize="12">
              {metric === 'clicks' || metric === 'impressions' || metric === 'position'
                ? 'Sync Search Console to see the trend'
                : 'Sync GA4 to see the trend'}
            </text>
          )}
        </svg>

        {hoverIdx != null && hasData && (
          <div
            style={{
              position: 'absolute',
              left: `${Math.min(Math.max((tooltipX / chartW) * 100, 8), 72)}%`,
              top: 8,
              background: '#fff',
              border: `1px solid ${colors.hair}`,
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 11.5,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <div style={{ fontWeight: 600, color: colors.ink }}>{METRIC_LABELS[metric]}</div>
            <div style={{ color: colors.text, marginTop: 4 }}>
              Current: <strong>{fmtValue(metric, tooltipVal ?? 0)}</strong>
            </div>
            <div style={{ color: colors.muted2, marginTop: 2 }}>
              Prev. period: {fmtValue(metric, tooltipPrev ?? 0)}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10.5,
          color: colors.faint,
          padding: '6px 2px 4px',
        }}
      >
        {(labels?.length ? labels : ['', '', '', '', '']).map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: colors.muted, marginTop: 2 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 2, background: colors.accent, borderRadius: 2 }} />
          Current period
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 2, background: '#c9c9c0', borderRadius: 2 }} />
          Previous period
        </span>
      </div>
    </div>
  )
}
