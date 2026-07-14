import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useData, useSiteId } from '../data/DataProvider'
import { editorTabForCategory, normalizePageRef, resolveReviewId } from '../lib/workflow'
import type { Opportunity } from '../data'
import type { Finding, NextStep } from '../lib/api'
import { useStore } from '../store'
import { colors } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'
import { api } from '../lib/api'

import { ContentEditorView } from './ContentEditor'
import { ContentStudioView } from './ContentStudio'
import { ElementorView } from './Elementor'

function stepFromAct(
  context: string,
  title: string,
  finding: Finding | null,
  opportunity: Opportunity | null,
): NextStep {
  return {
    id: finding ? `finding:${finding.id}` : `opportunity:${opportunity!.id}`,
    kind: finding ? 'finding' : 'opportunity',
    findingId: finding?.id,
    opportunityId: opportunity?.id,
    title,
    context,
    category: finding?.category ?? opportunity?.type ?? 'Content',
    source: (finding?.source ?? opportunity?.source ?? 'GSC') as NextStep['source'],
    effort: finding?.effort ?? opportunity?.effort ?? 'Medium',
    impact: (finding?.impact ?? opportunity?.impact ?? 'Medium') as NextStep['impact'],
    estMonthlyClicks: 0,
    priorityValue: 0,
    status: 'drafted',
    action: 'continue',
    actionLabel: 'Continue',
  }
}

export function ActView() {
  const { state, setState, nav, showToast } = useStore()
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const { findings, opps, reviewData } = useData()

  const queue = useQuery({
    queryKey: ['audit-queue', siteId],
    queryFn: () => api.auditQueue(siteId!),
    enabled: !!siteId,
  })

  const opportunity =
    state.actOpportunityId != null
      ? opps.find((o) => o.id === state.actOpportunityId)
      : null

  const finding =
    !opportunity && state.actFindingId
      ? (queue.data?.findings.find((f) => f.id === state.actFindingId) ??
        findings.find((f) => f.id === state.actFindingId) ??
        null)
      : null

  const oppStatus =
    opportunity != null
      ? (state.oppStatus[opportunity.id] ?? opportunity.status ?? 'Open')
      : null

  const generateOpp = useMutation({
    mutationFn: () => api.generateOpportunity(siteId!, opportunity!.id),
    onSuccess: (res) => {
      setState((prev) => ({
        generating: { ...prev.generating, [opportunity!.id]: false },
        oppStatus: { ...prev.oppStatus, [opportunity!.id]: 'Drafted' },
      }))
      showToast(
        res.prepared
          ? `Game plan ready — ${res.generated.length} sections to review`
          : res.errors[0] ?? 'Could not build game plan',
      )
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    },
    onError: (e: Error) => {
      setState((prev) => ({ generating: { ...prev.generating, [opportunity!.id]: false } }))
      showToast(e.message)
    },
  })

  const scopePath = normalizePageRef(
    opportunity?.page ??
      finding?.subject.ref ??
      state.actScopePath ??
      '',
  ) || null

  const workspace = opportunity
    ? opportunity.type === 'New page'
      ? 'studio'
      : 'editor'
    : finding
      ? (() => {
          const kind = finding.actions[0]?.kind ?? 'content_update'
          if (kind === 'blog_post') return 'studio'
          if (kind === 'elementor_page' || kind === 'elementor_section') return 'elementor'
          return 'editor'
        })()
      : scopePath
        ? 'editor'
        : null

  useEffect(() => {
    if (opportunity) {
      setState({ editorTab: editorTabForCategory(opportunity.type) })
      return
    }
    if (!finding) return
    const kind = finding.actions[0]?.kind ?? 'content_update'
    if (kind === 'meta_rewrite') setState({ editorTab: 'seo' })
    else if (kind === 'content_update') setState({ editorTab: 'body' })
    else if (kind === 'elementor_section') setState({ editorTab: 'headings' })
  }, [finding?.id, opportunity?.id, setState])

  if (!opportunity && !finding && !scopePath) {
    return (
      <div>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650 }}>Prepare change</h1>
        <p style={{ fontSize: 12.5, color: colors.muted, margin: '8px 0 16px' }}>
          Pick a next step from Command Center or the Next steps list. Your work happens here: generate
          changes, review drafts, and stage them for publish.
        </p>
        <HButton
          onClick={() => nav('opportunities')}
          style={{ background: colors.ink, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}
        >
          Open next steps
        </HButton>
      </div>
    )
  }

  const headerTitle = opportunity?.title ?? finding?.title ?? scopePath ?? 'Page update'
  const headerCategory = opportunity?.type ?? finding?.category ?? 'Content'
  const headerContext =
    opportunity != null
      ? `${opportunity.page} · ${opportunity.source}`
      : finding != null
        ? `${finding.subject.ref} · ${finding.evidence.slice(0, 2).map((e) => `${e.metric}: ${e.value}`).join(' · ')}`
        : scopePath

  return (
    <div>
      <Card style={{ padding: '12px 16px', marginBottom: 16, maxWidth: 960 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <HButton
              onClick={() => nav('opportunities')}
              hover={{ textDecoration: 'underline' }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 11.5,
                fontWeight: 550,
                color: colors.accent,
                marginBottom: 6,
              }}
            >
              ← Back to next steps
            </HButton>
            <div
              style={{
                fontSize: 11,
                fontWeight: 650,
                color: colors.muted2,
                textTransform: 'uppercase',
                letterSpacing: '.05em',
              }}
            >
              Step 1 · Prepare change
            </div>
            <div style={{ fontSize: 15, fontWeight: 650, marginTop: 2 }}>{headerTitle}</div>
            <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 4 }}>
              {headerCategory} · {headerContext}
            </div>
            {opportunity && oppStatus === 'Open' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <HButton
                  onClick={() => {
                    if (!siteId || generateOpp.isPending) return
                    setState((prev) => ({ generating: { ...prev.generating, [opportunity.id]: true } }))
                    generateOpp.mutate()
                  }}
                  hover={{ background: colors.inkStrong }}
                  style={{
                    background: colors.ink,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '7px 12px',
                    fontSize: 12,
                    fontWeight: 550,
                  }}
                >
                  {generateOpp.isPending || state.generating[opportunity.id]
                    ? 'Generating…'
                    : opportunity.type === 'Metadata'
                      ? 'Generate title & meta'
                      : 'Generate update'}
                </HButton>
                <span style={{ fontSize: 11.5, color: colors.muted2 }}>
                  Grounded in Search Console queries for this page
                </span>
              </div>
            )}
            {opportunity && oppStatus === 'Drafted' && (
              <div style={{ fontSize: 11.5, color: colors.green, marginTop: 8, fontWeight: 550 }}>
                Draft ready — review the suggestions below, then approve and publish
              </div>
            )}
          </div>
          {finding && !opportunity && (
            <select
              value={finding.id}
              onChange={(e) =>
                setState({ actFindingId: e.target.value, actOpportunityId: null, actScopePath: null })
              }
              style={{
                border: `1px solid ${colors.borderInput}`,
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 12,
                maxWidth: 280,
              }}
            >
              {(queue.data?.findings ?? findings).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title.slice(0, 60)}
                </option>
              ))}
            </select>
          )}
          {(oppStatus === 'Drafted' || finding?.status === 'drafted' || finding?.status === 'in_review') && (
            <HButton
              onClick={() => {
                const context =
                  opportunity?.page ?? finding?.subject.ref ?? state.actScopePath ?? ''
                const reviewId = resolveReviewId(
                  {
                    kind: finding ? 'finding' : 'opportunity',
                    findingId: finding?.id,
                    opportunityId: opportunity?.id,
                    context,
                    title: headerTitle,
                  },
                  reviewData,
                )
                setState({
                  oppDetailStep: stepFromAct(context, headerTitle, finding, opportunity ?? null),
                  reviewFocusId: reviewId,
                })
                nav('opportunities')
              }}
              hover={{ background: colors.inkStrong }}
              style={{
                flex: 'none',
                background: colors.ink,
                border: 'none',
                borderRadius: 8,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 550,
                color: '#fff',
              }}
            >
              Review & publish →
            </HButton>
          )}
        </div>
        {opportunity && (
          <div style={{ fontSize: 12.5, color: colors.text, lineHeight: 1.55, marginTop: 10, maxWidth: 720 }}>
            {opportunity.why}
          </div>
        )}
      </Card>

      {workspace === 'studio' && <ContentStudioView />}
      {workspace === 'elementor' && <ElementorView />}
      {workspace === 'editor' && scopePath && (
        <ContentEditorView scopedPath={scopePath} lockPage embedded />
      )}
    </div>
  )
}
