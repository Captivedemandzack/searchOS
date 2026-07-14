import type { CSSProperties } from 'react'
import type { EvidencePoint } from '../lib/api'
import { parseOpportunityWhy, displayPagePath } from '../lib/parseOpportunityWhy'
import { colors, impactPill, mono, pill } from '../theme'
import { HButton } from '../lib/Hover'

const neutralPill: CSSProperties = {
  ...pill(colors.muted, colors.chipBg),
  fontWeight: 550,
}

const outlinePill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 9px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 550,
  color: colors.text,
  background: '#fff',
  border: `1px solid ${colors.borderBtn}`,
  whiteSpace: 'nowrap',
}

const metricPill: CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  padding: '6px 10px',
  borderRadius: 8,
  background: colors.subtle,
  border: `1px solid ${colors.hair}`,
  minWidth: 72,
}

const metricLabel: CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: colors.muted2,
  lineHeight: 1.2,
}

const metricValue: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: colors.ink,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.2,
}

type Props = {
  title: string
  category: string
  impact: string
  effort: string
  pageRef: string
  siteDomain: string
  estMonthlyClicks: number
  whyText?: string | null
  evidence?: EvidencePoint[]
  prepared?: boolean
  preparing?: boolean
  showBuildGamePlan?: boolean
  buildLabel?: string
  buildHint?: string
  onBuildGamePlan?: () => void
  showRunAutonomous?: boolean
  runningAutonomous?: boolean
  onRunAutonomous?: () => void
  onBack: () => void
}

function MetricChip({
  label,
  value,
  valueStyle,
}: {
  label: string
  value: string
  valueStyle?: CSSProperties
}) {
  return (
    <div style={metricPill}>
      <span style={metricLabel}>{label}</span>
      <span style={{ ...metricValue, ...valueStyle }}>{value}</span>
    </div>
  )
}

export function OpportunityDetailHeader({
  title,
  category,
  impact,
  effort,
  pageRef,
  siteDomain,
  estMonthlyClicks,
  whyText,
  evidence,
  prepared,
  preparing,
  showBuildGamePlan,
  buildLabel = 'Build game plan',
  buildHint,
  onBuildGamePlan,
  showRunAutonomous,
  runningAutonomous,
  onRunAutonomous,
  onBack,
}: Props) {
  const parsed = whyText ? parseOpportunityWhy(whyText) : {}
  const path = displayPagePath(pageRef)
  const hasStructuredMetrics =
    parsed.keyword ||
    parsed.position != null ||
    parsed.impressions ||
    parsed.ctr ||
    (evidence && evidence.length > 0)

  return (
    <div style={{ marginBottom: 16 }}>
      <HButton
        onClick={onBack}
        hover={{ textDecoration: 'underline' }}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: 11.5,
          fontWeight: 550,
          color: colors.accent,
          marginBottom: 12,
        }}
      >
        ← Back to opportunities
      </HButton>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <span style={neutralPill}>{category}</span>
        <span style={impactPill(impact)}>{impact} impact</span>
        <span style={outlinePill}>{effort} effort</span>
      </div>

      <h1
        style={{
          margin: 0,
          fontSize: 19,
          fontWeight: 650,
          letterSpacing: '-.02em',
          lineHeight: 1.3,
          color: colors.ink,
          textWrap: 'balance',
        }}
      >
        {title}
      </h1>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          flexWrap: 'wrap',
          fontSize: 12,
        }}
      >
        <span style={{ fontFamily: mono, color: colors.text, fontWeight: 500 }}>{path}</span>
        <span style={{ color: colors.faint }}>·</span>
        <span style={{ color: colors.muted2 }}>{siteDomain}</span>
      </div>

      {hasStructuredMetrics ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'stretch' }}>
          {parsed.keyword ? (
            <MetricChip
              label="Keyword"
              value={parsed.keyword}
              valueStyle={{
                fontFamily: mono,
                maxWidth: 220,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            />
          ) : null}
          {parsed.position != null && !Number.isNaN(parsed.position) ? (
            <MetricChip label="Position" value={parsed.position.toFixed(1)} />
          ) : null}
          {parsed.impressions ? <MetricChip label="Impressions" value={parsed.impressions} /> : null}
          {parsed.ctr ? <MetricChip label="CTR" value={parsed.ctr} /> : null}
          {evidence?.slice(0, 4).map((e) => (
            <MetricChip
              key={`${e.metric}-${e.value}`}
              label={e.metric}
              value={String(e.value)}
            />
          ))}
          {estMonthlyClicks > 0 ? (
            <MetricChip
              label="Monthly clicks"
              value={`+${estMonthlyClicks.toLocaleString()}`}
              valueStyle={{ color: colors.green }}
            />
          ) : null}
        </div>
      ) : null}

      {!hasStructuredMetrics && parsed.note ? (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: colors.muted, lineHeight: 1.5, maxWidth: 640 }}>
          {parsed.note}
        </p>
      ) : null}

      {buildHint ? (
        <p
          style={{
            margin: '14px 0 0',
            fontSize: 12.5,
            color: prepared ? colors.green : colors.muted,
            lineHeight: 1.5,
            maxWidth: 640,
            fontWeight: prepared ? 550 : 400,
          }}
        >
          {buildHint}
        </p>
      ) : null}

      {(showBuildGamePlan && onBuildGamePlan) || (showRunAutonomous && onRunAutonomous) ? (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {showRunAutonomous && onRunAutonomous ? (
            <HButton
              onClick={onRunAutonomous}
              hover={runningAutonomous ? undefined : { background: colors.inkStrong }}
              style={{
                background: colors.ink,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 12.5,
                fontWeight: 600,
                opacity: runningAutonomous ? 0.7 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>✦</span>
              {runningAutonomous ? 'Running autonomously…' : 'Run autonomously'}
            </HButton>
          ) : null}
          {showBuildGamePlan && onBuildGamePlan ? (
            <HButton
              onClick={onBuildGamePlan}
              hover={preparing ? undefined : { background: colors.subtle }}
              style={{
                background: '#fff',
                color: colors.ink,
                border: `1px solid ${colors.borderBtn}`,
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 12.5,
                fontWeight: 600,
                opacity: preparing ? 0.7 : 1,
              }}
            >
              {preparing ? 'Building game plan…' : buildLabel}
            </HButton>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
