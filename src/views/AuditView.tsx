import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useData, useSiteId } from '../data/DataProvider'
import { useStore } from '../store'
import { colors, mono, th } from '../theme'
import { Card } from '../components/primitives'
import { EstimateUpside } from '../components/EstimateUpside'
import { OpportunityRowButton } from '../components/OpportunityRowButton'
import { HButton } from '../lib/Hover'
import { api, type NextStep } from '../lib/api'
import { openNextStep } from '../lib/workflow'

const CATEGORIES = [
  'All',
  'Service pages',
  'Content',
  'Metadata',
  'New content',
  'Internal links',
  'Technical',
  'Local',
  'Conversion',
  'Trust',
]

const cols = 'minmax(0,2fr) max-content 90px 90px max-content 100px'

function categoryPill(cat: string) {
  const bg =
    cat === 'Service pages' ? colors.amberBg
    : cat === 'Conversion' ? colors.greenBg
    : cat === 'Local' ? colors.accentSoftBg
    : colors.chipBg
  const color =
    cat === 'Service pages' ? colors.amber
    : cat === 'Conversion' ? colors.green
    : cat === 'Local' ? colors.accent
    : colors.muted
  return {
    background: bg,
    color,
    borderRadius: 99,
    padding: '2px 8px',
    fontSize: 10.5,
    fontWeight: 650,
    width: 'fit-content',
    justifySelf: 'start',
    whiteSpace: 'nowrap',
  }
}

export function AuditView() {
  const { state, setState, nav, showToast } = useStore()
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const { auditGovernor, reviewData } = useData()

  const queue = useQuery({
    queryKey: ['audit-queue', siteId, state.auditCategory],
    queryFn: () =>
      api.auditQueue(siteId!, {
        category: state.auditCategory === 'All' ? undefined : state.auditCategory,
      }),
    enabled: !!siteId,
    staleTime: 60_000,
  })

  const stepsQuery = useQuery({
    queryKey: ['next-steps', siteId],
    queryFn: () => api.nextSteps(siteId!, 200),
    enabled: !!siteId,
    staleTime: 60_000,
  })

  const runAudits = useMutation({
    mutationFn: () => api.runAudits(siteId!),
    onSuccess: () => {
      showToast('Audits complete')
      queryClient.invalidateQueries({ queryKey: ['audit-queue', siteId] })
      queryClient.invalidateQueries({ queryKey: ['next-steps', siteId] })
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    },
    onError: (e: Error) => showToast(e.message),
  })

  function handleOpenStep(step: NextStep) {
    openNextStep(step, { nav, setState }, reviewData, siteId ?? undefined)
  }

  const governor = queue.data?.governor ?? auditGovernor
  const steps = (stepsQuery.data?.steps ?? []).filter(
    (s) => state.auditCategory === 'All' || s.category === state.auditCategory,
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 6px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Next steps</h1>
        <span style={{ fontSize: 12.5, color: colors.muted2 }}>
          {stepsQuery.data?.total ?? steps.length} items · ranked by impact and effort
        </span>
        <HButton
          onClick={() => !runAudits.isPending && runAudits.mutate()}
          hover={{ background: colors.subtleAlt }}
          style={{
            marginLeft: 'auto',
            background: colors.subtle,
            border: `1px solid ${colors.borderBtn}`,
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 550,
          }}
        >
          {runAudits.isPending ? 'Running audits…' : 'Re-run all audits'}
        </HButton>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: colors.muted, maxWidth: 720 }}>
        One prioritized list from Search Console, Analytics, WordPress, site crawls, PageSpeed, and competitor scans.
        Duplicates are merged so each issue appears once.
      </p>

      {governor && !governor.allowNewPosts && (
        <div style={{ marginBottom: 14, background: colors.amberBg, border: `1px solid ${colors.amber}33`, borderRadius: 8, padding: '11px 14px', maxWidth: 760 }}>
          <div style={{ fontSize: 12.5, fontWeight: 650, color: colors.amber }}>
            {governor.saturated ? `Topic coverage ${governor.coveragePct}%` : 'Publishing velocity ceiling'}
          </div>
          <div style={{ fontSize: 12, color: colors.text, marginTop: 4 }}>{governor.reason}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <HButton
            key={c}
            onClick={() => setState({ auditCategory: c })}
            hover={state.auditCategory !== c ? { background: colors.chipBg } : undefined}
            style={{
              background: state.auditCategory === c ? colors.ink : '#fff',
              color: state.auditCategory === c ? '#fff' : colors.muted,
              border: `1px solid ${state.auditCategory === c ? colors.ink : colors.borderBtn}`,
              borderRadius: 99,
              padding: '5px 11px',
              fontSize: 11.5,
              fontWeight: 550,
            }}
          >
            {c}
            {queue.data?.counts?.[c] != null && c !== 'All' ? ` (${queue.data.counts[c]})` : ''}
          </HButton>
        ))}
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '9px 18px', borderBottom: `1px solid ${colors.hair}`, background: colors.subtle }}>
          <span style={th}>What to do</span>
          <span style={th}>Category</span>
          <span style={th}>Upside</span>
          <span style={th}>Effort</span>
          <span style={th}>Source</span>
          <span />
        </div>
        {stepsQuery.isLoading && <div style={{ padding: 18, fontSize: 12.5, color: colors.muted2 }}>Loading next steps…</div>}
        {steps.map((step) => (
          <div
            key={step.id}
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              gap: 12,
              padding: '12px 18px',
              borderBottom: `1px solid ${colors.hair3}`,
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{step.title}</div>
              <div style={{ fontSize: 11, color: colors.muted2, marginTop: 2, fontFamily: mono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {step.context}
              </div>
            </div>
            <span style={categoryPill(step.category)}>{step.category}</span>
            <EstimateUpside estMonthlyClicks={step.estMonthlyClicks} compact />
            <span style={{ fontSize: 12, color: colors.muted }}>{step.effort}</span>
            <span style={{ fontSize: 11, color: colors.muted2 }}>{step.source}</span>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <OpportunityRowButton variant="start" onClick={() => handleOpenStep(step)} />
            </div>
          </div>
        ))}
        {!stepsQuery.isLoading && steps.length === 0 && (
          <div style={{ padding: 24, fontSize: 12.5, color: colors.muted2, textAlign: 'center' }}>
            No next steps in this category. Sync your data sources, then re-run audits.
          </div>
        )}
      </Card>
    </div>
  )
}
