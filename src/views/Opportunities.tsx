import { useWorkItems } from '../selectors'
import { useStore } from '../store'
import { useSiteId } from '../data/DataProvider'
import { colors, mono, pill, th } from '../theme'
import { Card } from '../components/primitives'
import { HButton, HDiv } from '../lib/Hover'
import { EstimateUpside } from '../components/EstimateUpside'
import { OpportunityRowButton } from '../components/OpportunityRowButton'
import { openOpportunity, hasServerDraft } from '../lib/workflow'
import type { CompletedStep, NextStep } from '../lib/api'
import { useData } from '../data/DataProvider'
import { OpportunityDetail } from './OpportunityDetail'

const gridCols = 'minmax(0,2fr) 100px 72px 90px 110px 100px'

const selectStyle = {
  border: `1px solid ${colors.borderInput}`,
  borderRadius: 8,
  padding: '5px 8px',
  fontSize: 12,
  background: '#fff',
  color: colors.text,
}

const TAB_LABELS = {
  todo: 'To do',
  in_progress: 'In progress',
  completed: 'Completed',
} as const

function filterSteps<T extends NextStep | CompletedStep>(rows: T[], f: ReturnType<typeof useStore>['state']['filters']): T[] {
  return rows.filter(
    (step) =>
      (f.type === 'All' || step.category === f.type) &&
      (f.effort === 'All' || step.effort === f.effort) &&
      (f.impact === 'All' || step.impact === f.impact) &&
      (f.source === 'All' || step.source === f.source),
  )
}

export function OpportunitiesView() {
  const { state, setState, nav } = useStore()
  const siteId = useSiteId()
  const { reviewData } = useData()
  const { todo, inProgress, completed, openCount } = useWorkItems()
  const f = state.filters

  if (state.oppDetailStep) {
    return <OpportunityDetail />
  }

  const tab = state.oppTab
  const tabRows =
    tab === 'todo' ? todo : tab === 'in_progress' ? inProgress : completed
  const rows = filterSteps(tabRows, f)

  const tabCounts = {
    todo: todo.length,
    in_progress: inProgress.length,
    completed: completed.length,
  }

  const emptyCopy = {
    todo: {
      title: 'Nothing on your list right now',
      body: 'After your next sync, ranked opportunities from Search Console and site audits will show up here.',
    },
    in_progress: {
      title: 'No work in progress',
      body: 'Click Start on any opportunity to open its game plan. It moves here so you can pick up where you left off.',
    },
    completed: {
      title: 'No completed work yet',
      body: 'Changes appear here after you push them to WordPress. Approve-only items stay in In progress until they are live on the site.',
    },
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 6px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Opportunities</h1>
        <span style={{ fontSize: 12.5, color: colors.muted2 }}>
          {openCount} open · ranked by impact and effort
        </span>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: colors.muted }}>
        Start from To do, resume from In progress, and track verified changes under Completed.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: colors.chipBg, borderRadius: 8, padding: 3 }}>
          {(['todo', 'in_progress', 'completed'] as const).map((t) => (
            <HButton
              key={t}
              onClick={() => setState({ oppTab: t })}
              hover={{ background: tab === t ? '#fff' : colors.chipBg2 }}
              style={{
                background: tab === t ? '#fff' : 'transparent',
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: tab === t ? 600 : 500,
                color: tab === t ? colors.ink : colors.muted,
                boxShadow: tab === t ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {TAB_LABELS[t]} ({tabCounts[t]})
            </HButton>
          ))}
        </div>
        <select value={f.type} onChange={(e) => setState({ filters: { ...f, type: e.target.value } })} style={selectStyle}>
          <option value="All">Type: All</option>
          <option>Metadata</option>
          <option>Content</option>
          <option>Internal links</option>
          <option>Schema</option>
          <option>Technical</option>
          <option>New page</option>
        </select>
        <select value={f.effort} onChange={(e) => setState({ filters: { ...f, effort: e.target.value } })} style={selectStyle}>
          <option value="All">Effort: All</option>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
        <select value={f.impact} onChange={(e) => setState({ filters: { ...f, impact: e.target.value } })} style={selectStyle}>
          <option value="All">Impact: All</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gap: 12,
            alignItems: 'center',
            padding: '9px 18px',
            borderBottom: `1px solid ${colors.hair}`,
            background: colors.subtle,
          }}
        >
          <span style={th}>
            {tab === 'completed' ? 'Completed item' : 'Opportunity'}
          </span>
          <span style={{ ...th, textAlign: 'right' }}>Expected</span>
          <span style={th}>Effort</span>
          <span style={th}>Category</span>
          <span style={th}>Source</span>
          <span />
        </div>

        {rows.map((step) => (
          <WorkRow
            key={step.id}
            step={step}
            tab={tab}
            onOpen={() =>
              openOpportunity(step, { nav, setState }, reviewData, { tab, siteId: siteId ?? undefined })
            }
          />
        ))}

        {rows.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
              {emptyCopy[tab].title}
            </div>
            <div style={{ fontSize: 12, color: colors.muted2, marginTop: 6, maxWidth: 400, margin: '6px auto 0' }}>
              {emptyCopy[tab].body}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function WorkRow({
  step,
  tab,
  onOpen,
}: {
  step: NextStep | CompletedStep
  tab: 'todo' | 'in_progress' | 'completed'
  onOpen: () => void
}) {
  const completed = tab === 'completed'
  const completedStep = step as CompletedStep
  const statusLabel = completed
    ? completedStep.completedLabel ?? 'Completed'
    : hasServerDraft(step)
      ? 'Draft ready'
      : 'Started'

  return (
    <HDiv
      onClick={onOpen}
      hover={{ background: colors.subtleAlt }}
      style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gap: 12,
        alignItems: 'center',
        padding: '12px 18px',
        borderBottom: `1px solid ${colors.hair3}`,
        cursor: 'pointer',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: colors.ink,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {step.title}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: colors.muted2,
            marginTop: 2,
            fontFamily: mono,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {step.context}
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        {step.estMonthlyClicks > 0 ? (
          <EstimateUpside estMonthlyClicks={step.estMonthlyClicks} compact />
        ) : (
          <span style={{ fontSize: 11.5, color: colors.muted2 }}>—</span>
        )}
      </div>

      <span style={{ fontSize: 12, color: colors.muted }}>{step.effort}</span>
      <span style={{ fontSize: 11.5, color: colors.text }}>{step.category}</span>
      <span style={{ fontSize: 11.5, color: colors.muted2 }}>{step.source}</span>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
        {completed ? (
          <span
            style={pill(
              statusLabel === 'Rejected' ? colors.red : colors.green,
              statusLabel === 'Rejected' ? colors.redBg : colors.greenBg,
            )}
          >
            {statusLabel}
          </span>
        ) : tab === 'in_progress' ? (
          <>
            {!hasServerDraft(step) ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 550,
                  color: colors.muted,
                  background: colors.chipBg,
                  borderRadius: 99,
                  padding: '2px 8px',
                }}
              >
                {statusLabel}
              </span>
            ) : (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.amber,
                  background: colors.amberBg,
                  borderRadius: 99,
                  padding: '2px 8px',
                }}
              >
                Draft ready
              </span>
            )}
            <OpportunityRowButton
              variant="continue"
              onClick={(e) => {
                e?.stopPropagation?.()
                onOpen()
              }}
            />
          </>
        ) : (
          <OpportunityRowButton
            variant="start"
            onClick={(e) => {
              e?.stopPropagation?.()
              onOpen()
            }}
          />
        )}
      </div>
    </HDiv>
  )
}
