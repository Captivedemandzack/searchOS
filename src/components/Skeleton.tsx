import type { CSSProperties, ReactNode, AriaAttributes } from 'react'
import { colors } from '../theme'

type SkeletonProps = {
  width?: number | string
  height?: number | string
  borderRadius?: number | string
  style?: CSSProperties
}

export function Skeleton({ width = '100%', height = 14, borderRadius = 6, style }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className="gw-skeleton"
      style={{
        width,
        height,
        borderRadius,
        background: colors.chipBg,
        ...style,
      }}
    />
  )
}

const METRIC_LABELS = [
  'Organic clicks',
  'Impressions',
  'Avg. position',
  'Organic conversions',
  'CTR',
]

export function MetricCardsSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5,1fr)',
        gap: 12,
        marginBottom: 14,
      }}
      aria-busy="true"
      aria-label="Loading metrics"
    >
      {METRIC_LABELS.map((label) => (
        <CardSkeleton key={label} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 550, color: colors.muted }}>{label}</span>
          <Skeleton height={26} width="58%" borderRadius={8} />
          <Skeleton height={12} width="72%" />
        </CardSkeleton>
      ))}
    </div>
  )
}

export function NextStepsSkeleton() {
  return (
    <CardSkeleton style={{ marginBottom: 14, overflow: 'hidden' }} aria-busy="true" aria-label="Loading next steps">
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${colors.hair}` }}>
        <Skeleton height={14} width={88} />
        <Skeleton height={11} width={280} style={{ marginTop: 8 }} />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '11px 18px',
            borderBottom: i < 4 ? `1px solid ${colors.hair3}` : undefined,
          }}
        >
          <Skeleton height={12} width={16} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton height={13} width={`${68 - i * 4}%`} />
            <Skeleton height={11} width={`${52 - i * 3}%`} style={{ marginTop: 8 }} />
          </div>
          <Skeleton height={24} width={52} borderRadius={99} />
          <Skeleton height={32} width={84} borderRadius={7} />
        </div>
      ))}
    </CardSkeleton>
  )
}

export function SeoScoreSkeleton() {
  return (
    <CardSkeleton style={{ padding: '16px 18px' }} aria-busy="true" aria-label="Loading SEO score">
      <Skeleton height={14} width={140} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <Skeleton height={36} width={48} borderRadius={8} />
        <Skeleton height={14} width={36} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Skeleton height={11} width={76} />
            <Skeleton height={5} style={{ flex: 1 }} borderRadius={99} />
            <Skeleton height={11} width={22} />
          </div>
        ))}
      </div>
    </CardSkeleton>
  )
}

export function TrendChartSkeleton() {
  return (
    <CardSkeleton style={{ padding: '16px 18px 10px' }} aria-busy="true" aria-label="Loading trend chart">
      <Skeleton height={14} width={150} />
      <Skeleton height={170} style={{ marginTop: 12 }} borderRadius={8} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={10} width={36} />
        ))}
      </div>
    </CardSkeleton>
  )
}

export function ListCardSkeleton({ rows = 4, title }: { rows?: number; title: string }) {
  return (
    <CardSkeleton style={{ padding: '14px 18px' }} aria-busy="true" aria-label={`Loading ${title}`}>
      <Skeleton height={14} width={title.length * 7} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} height={12} width={`${88 - i * 6}%`} />
        ))}
      </div>
    </CardSkeleton>
  )
}

function CardSkeleton({
  children,
  style,
  ...rest
}: {
  children: ReactNode
  style?: CSSProperties
} & AriaAttributes) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
