import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useData, useCurrentSite, useSiteId } from '../data/DataProvider'
import { useStore } from '../store'
import { Card } from '../components/primitives'
import { OpportunityDetailHeader } from '../components/OpportunityDetailHeader'
import { ReadinessPanel } from '../components/ReadinessPanel'
import { api, type PublishReadiness } from '../lib/api'
import { ReviewFocusPanel } from '../components/ReviewFocusPanel'
import { useReview } from '../selectors'
import { useReviewActions } from '../hooks/useReviewActions'
import {
  buildEditorPushEdits,
  collectProposalsForPage,
  diffHasContent,
  mergeDiffs,
  normalizePageRef,
} from '../lib/proposedChanges'
import { closeOpportunity, editorTabForCategory, hasServerDraft, normalizePageRef as normRef } from '../lib/workflow'

import { ContentEditorView } from './ContentEditor'
import { ContentStudioView } from './ContentStudio'
import { ElementorView } from './Elementor'

export function OpportunityDetail() {
  const { state, setState, nav, showToast } = useStore()
  const site = useCurrentSite()
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const { opps, editorData } = useData()
  const { items: reviewItems } = useReview()
  const { buildActions, seo } = useReviewActions()
  const step = state.oppDetailStep

  const queue = useQuery({
    queryKey: ['audit-queue', siteId],
    queryFn: () => api.auditQueue(siteId!),
    enabled: !!siteId,
  })

  if (!step) return null

  const opportunity =
    step.opportunityId != null ? opps.find((o) => o.id === step.opportunityId) : null

  const finding =
    !opportunity && step.findingId
      ? (queue.data?.findings.find((f) => f.id === step.findingId) ?? null)
      : null

  const oppStatus =
    opportunity != null
      ? (state.oppStatus[opportunity.id] ?? opportunity.status ?? 'Open')
      : null

  const effectiveStep = {
    ...step,
    status:
      opportunity && oppStatus
        ? oppStatus
        : finding?.status
          ? finding.status
          : step.status,
  }
  const prepared = hasServerDraft(effectiveStep)

  const prepareGamePlan = useMutation({
    mutationFn: () => {
      if (!siteId) throw new Error('Site not ready')
      if (opportunity) return api.prepareGamePlan(siteId, opportunity.id)
      if (step.findingId) return api.prepareFindingGamePlan(siteId, step.findingId)
      throw new Error('Nothing to prepare for this item')
    },
    onSuccess: (res) => {
      if (opportunity) {
        setState((prev) => ({
          oppStatus: { ...prev.oppStatus, [opportunity.id]: 'Drafted' },
        }))
      }
      if (res.reviewItemId) {
        setState({ reviewFocusId: res.reviewItemId })
      }
      if (res.prepared) {
        const n = res.generated.length
        showToast(`Game plan ready — ${n} section${n === 1 ? '' : 's'} to review`)
      } else {
        showToast(res.errors[0] ?? 'Could not build a game plan for this item')
      }
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      queryClient.invalidateQueries({ queryKey: ['next-steps'] })
      queryClient.invalidateQueries({ queryKey: ['audit-queue'] })
    },
    onError: (e: Error) => showToast(e.message),
  })

  const [readiness, setReadiness] = useState<PublishReadiness | null>(null)
  const runAutonomous = useMutation({
    mutationFn: () => {
      if (!siteId) throw new Error('Site not ready')
      if (!opportunity) throw new Error('Autonomous run is available for opportunities')
      return api.runAutonomous(siteId, opportunity.id)
    },
    onSuccess: (res) => {
      setReadiness(res.readiness)
      if (opportunity) {
        setState((prev) => ({ oppStatus: { ...prev.oppStatus, [opportunity.id]: 'Drafted' } }))
      }
      if (res.reviewItemId && res.ok) {
        setState((prev) => ({
          reviewStatus: { ...prev.reviewStatus, [res.reviewItemId!]: 'Approved' },
        }))
      }
      if (res.reviewItemId) setState({ reviewFocusId: res.reviewItemId })
      showToast(res.message)
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      queryClient.invalidateQueries({ queryKey: ['next-steps'] })
      queryClient.invalidateQueries({ queryKey: ['audit-queue'] })
    },
    onError: (e: Error) => showToast(e.message),
  })

  const scopePath =
    normRef(opportunity?.page ?? finding?.subject.ref ?? state.actScopePath ?? step.context) || null

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
    else if (kind === 'elementor_section') setState({ editorTab: 'seo' })
  }, [finding?.id, opportunity?.id, setState])

  const headerTitle = opportunity?.title ?? finding?.title ?? step.title
  const headerCategory = opportunity?.type ?? finding?.category ?? step.category
  const pageRef = opportunity?.page ?? finding?.subject.ref ?? step.context

  const reviewItem =
    state.reviewFocusId != null ? reviewItems.find((r) => r.id === state.reviewFocusId) : null

  const normalizedPage = normalizePageRef(step.context)
  const proposalDiff = collectProposalsForPage(editorData, normalizedPage || step.context)
  const mergedDiff = mergeDiffs(reviewItem?.diff, proposalDiff)

  const focusItem = {
    id: reviewItem?.id ?? `step:${step.id}`,
    title: headerTitle,
    detail: `${normalizedPage || step.context} · ${headerCategory} · ${site.domain}`,
    type: headerCategory,
    risk: reviewItem?.risk ?? 'Low',
    reviewer: reviewItem?.reviewer ?? 'Unassigned',
    dest: reviewItem?.dest ?? seo.destination,
    diff: diffHasContent(mergedDiff) ? mergedDiff : reviewItem?.diff,
    pending:
      reviewItem?.pending ??
      ((step as { completedLabel?: string }).completedLabel !== 'Completed' &&
        (step as { completedLabel?: string }).completedLabel !== 'Rejected'),
    published: reviewItem?.published ?? false,
    canPublish: reviewItem?.canPublish ?? false,
    resolvedLabel:
      (step as { completedLabel?: string }).completedLabel ?? reviewItem?.resolvedLabel ?? 'Pending',
  }

  const stageOpts = {
    path: normalizedPage || normalizePageRef(step.context),
    stepTitle: step.title,
    findingId: step.findingId ?? null,
  }

  const actionHandlers = {
    onApprove: reviewItem?.onApprove ?? (() => {}),
    onReject: reviewItem?.onReject ?? (() => {}),
    onPublish: reviewItem?.onPublish ?? (() => {}),
  }

  const readyToPush =
    !!reviewItem?.id &&
    !reviewItem.id.startsWith('step:') &&
    !reviewItem.published &&
    (focusItem.pending || focusItem.canPublish || !!readiness?.ok)

  const needsActions = readyToPush
  const actions = needsActions
    ? buildActions(focusItem.diff, reviewItem?.id ?? state.reviewFocusId, stageOpts, actionHandlers)
    : undefined

  const pushEdits = useMemo(
    () =>
      scopePath
        ? buildEditorPushEdits(editorData, scopePath, state.edits)
        : undefined,
    [editorData, scopePath, state.edits],
  )

  const whyText = opportunity?.why ?? finding?.evidence?.[0]?.detail ?? null
  const isManualOnly = opportunity?.type === 'Technical'
  const isDone = oppStatus === 'Done'
  const showRegenerate = !isManualOnly && (prepared || isDone)
  const showInitialBuild = !isManualOnly && !prepared && !isDone
  const buildLabel =
    workspace === 'studio'
      ? showRegenerate
        ? 'Regenerate draft post'
        : 'Write draft post'
      : workspace === 'elementor'
        ? showRegenerate
          ? 'Regenerate Elementor section'
          : 'Build Elementor section'
        : showRegenerate
          ? 'Regenerate game plan'
          : 'Build game plan'

  return (
    <div>
      <Card style={{ padding: '16px 18px', marginBottom: 16 }}>
        <OpportunityDetailHeader
          title={headerTitle}
          category={headerCategory}
          impact={step.impact}
          effort={step.effort}
          pageRef={pageRef}
          siteDomain={site.domain}
          estMonthlyClicks={step.estMonthlyClicks}
          whyText={whyText}
          evidence={finding?.evidence}
          prepared={prepared}
          preparing={prepareGamePlan.isPending}
          buildLabel={buildLabel}
          buildHint={
            isManualOnly
              ? 'This change is done directly in WordPress. Use the diagnosis above, then mark done when complete.'
              : showRegenerate
                ? 'Rebuilds suggestions with the latest SEO rules, then opens a fresh review item you can approve and push again.'
                : prepared
                  ? 'Review the suggestions below, approve what you want, then push to WordPress.'
                  : 'Creates title, meta, headings, body, FAQ, schema, and internal link suggestions for this page.'
          }
          showBuildGamePlan={showInitialBuild || showRegenerate}
          onBuildGamePlan={() => {
            if (!prepareGamePlan.isPending) prepareGamePlan.mutate()
          }}
          showRunAutonomous={
            !isManualOnly && workspace !== 'studio' && !!opportunity && (showInitialBuild || showRegenerate)
          }
          runningAutonomous={runAutonomous.isPending}
          onRunAutonomous={() => {
            if (!runAutonomous.isPending) runAutonomous.mutate()
          }}
          onBack={() => closeOpportunity({ nav, setState })}
        />
      </Card>

      {readiness ? (
        <div style={{ marginBottom: 16 }}>
          <ReadinessPanel
            readiness={readiness}
            onPublish={
              readiness.ok && actions
                ? () => void actions.onPushToWordPress(pushEdits ?? {})
                : undefined
            }
            publishing={actions?.busy}
            publishBlocked={actions?.pushBlockedReason}
          />
        </div>
      ) : null}

      {workspace === 'studio' && <ContentStudioView />}
      {workspace === 'elementor' && <ElementorView />}
      {workspace === 'editor' && scopePath && (
        <ContentEditorView scopedPath={scopePath} lockPage embedded />
      )}

      <div style={{ marginTop: 16 }}>
        <ReviewFocusPanel
          item={focusItem}
          showToast={showToast}
          actions={actions}
          onBack={() => closeOpportunity({ nav, setState })}
          onViewAll={() => closeOpportunity({ nav, setState })}
          embedded
          hideDiffBody
          pushEdits={pushEdits}
          regenerateAvailable={showRegenerate}
        />
      </div>
    </div>
  )
}
