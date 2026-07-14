import { useCallback } from 'react'
import { useReview } from '../selectors'
import { useData } from '../data/DataProvider'
import { useStore } from '../store'
import { colors, th } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'
import { ReviewDiffPanel } from '../components/ReviewDiffPanel'
import { ReviewFocusPanel } from '../components/ReviewFocusPanel'
import { isSeoMetaDiff, useReviewSeoPublish } from '../hooks/useReviewSeoPublish'
import {
  collectProposalsForPage,
  diffHasContent,
  mergeDiffs,
  normalizePageRef,
} from '../lib/proposedChanges'
import type { ReviewDiff } from '../data'
import { useSiteId } from '../data/DataProvider'
import { api } from '../lib/api'
import { useQueryClient } from '@tanstack/react-query'

const cols = 'minmax(0,1.7fr) 110px 84px 120px 170px 170px'

function stageOptsFromStep(
  step: { title: string; context: string; findingId?: string },
  pageRef: string,
) {
  return {
    path: pageRef || normalizePageRef(step.context),
    stepTitle: step.title,
    findingId: step.findingId ?? null,
  }
}

function ReviewQueueTable({
  rows,
  emptyMessage,
  onReview,
}: {
  rows: ReturnType<typeof useReview>['items']
  emptyMessage: string
  onReview: (id: string) => void
}) {
  if (!rows.length) {
    return (
      <div style={{ padding: '20px 18px', fontSize: 12.5, color: colors.muted2 }}>{emptyMessage}</div>
    )
  }

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          gap: 12,
          padding: '9px 18px',
          borderBottom: `1px solid ${colors.hair}`,
          background: colors.subtle,
        }}
      >
        <span style={th}>Change</span>
        <span style={th}>Type</span>
        <span style={th}>Risk</span>
        <span style={th}>Reviewer</span>
        <span style={th}>Destination</span>
        <span />
      </div>
      {rows.map((rv) => (
        <div key={rv.id} style={{ borderBottom: `1px solid ${colors.hair3}` }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              gap: 12,
              padding: '12px 18px',
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{rv.title}</div>
              <div
                style={{
                  fontSize: 11.5,
                  color: colors.muted2,
                  marginTop: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {rv.detail}
              </div>
            </div>
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
              {rv.type}
            </span>
            <span style={rv.riskPill}>{rv.risk}</span>
            <span style={{ fontSize: 12, color: colors.text }}>{rv.reviewer}</span>
            <span style={{ fontSize: 11.5, color: colors.muted }}>{rv.dest}</span>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
              {!rv.pending ? <span style={rv.resolvedPill}>{rv.resolvedLabel}</span> : null}
              <HButton
                onClick={() => onReview(rv.id)}
                hover={{ background: '#f6f6f1' }}
                style={{
                  background: '#fff',
                  border: `1px solid ${colors.borderBtn}`,
                  borderRadius: 7,
                  padding: '5px 11px',
                  fontSize: 11.5,
                  fontWeight: 550,
                  color: colors.ink,
                }}
              >
                {rv.pending ? 'Review changes' : 'View'}
              </HButton>
            </div>
          </div>
          {rv.pending && rv.diff ? <ReviewDiffPanel diff={rv.diff} compact /> : null}
        </div>
      ))}
    </>
  )
}

export function ReviewQueueView() {
  const { state, setState, nav, showToast } = useStore()
  const { items, pendingCount, completedCount } = useReview()
  const { editorData } = useData()
  const seo = useReviewSeoPublish()
  const siteId = useSiteId()
  const queryClient = useQueryClient()

  const completeReview = useCallback(() => {
    setState({ reviewFocusId: null, oppDetailStep: null })
  }, [setState])

  const buildActions = useCallback(
    (
      diff: ReviewDiff | null | undefined,
      reviewItemId: string | null | undefined,
      stageOpts: { path: string; stepTitle: string; findingId?: string | null },
      handlers: {
        onApprove: () => void
        onReject: () => void
        onPublish: () => void
      },
    ) => {
      const seoOnly = isSeoMetaDiff(diff)
      const pushBlockedReason = seoOnly && !seo.seoPublishAvailable ? seo.seoPublishBlockedReason : null

      return {
        busy: seo.busy,
        pushBlockedReason,
        onPushToWordPress: async (edits: Record<string, string>) => {
          if (seoOnly) {
            if (!seo.seoPublishAvailable) {
              showToast(seo.seoPublishBlockedReason ?? 'WordPress push is not available')
              return
            }
            try {
              await seo.publishSeo(edits, diff, stageOpts, reviewItemId, false)
              showToast('Pushed to WordPress')
              completeReview()
            } catch {
              /* toast shown in hook */
            }
            return
          }
          if (!siteId || !reviewItemId || reviewItemId.startsWith('step:')) {
            showToast('Save this change to the review queue before pushing to WordPress')
            return
          }
          try {
            await api.setReviewStatus(siteId, reviewItemId, 'Approved')
            await api.publishReviewItem(siteId, reviewItemId, {
              title: edits.title,
              description: edits.meta,
            })
            await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
            await queryClient.invalidateQueries({ queryKey: ['impact-changes', siteId] })
            showToast('Pushed to WordPress')
            completeReview()
          } catch (e) {
            showToast((e as Error).message)
          }
        },
        onApprove: async (edits: Record<string, string>) => {
          if (seoOnly) {
            try {
              await seo.approveSeo(edits, diff, stageOpts, reviewItemId)
              showToast('Completed')
              completeReview()
            } catch {
              /* toast shown in hook */
            }
            return
          }
          if (siteId && reviewItemId && !reviewItemId.startsWith('step:')) {
            await api.setReviewStatus(siteId, reviewItemId, 'Approved')
            await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
          } else {
            handlers.onApprove()
          }
          showToast('Completed')
          completeReview()
        },
        onReject: () => {
          handlers.onReject()
          completeReview()
        },
      }
    },
    [completeReview, queryClient, seo, showToast, siteId],
  )

  const step = state.oppDetailStep
  const reviewItem =
    state.reviewFocusId != null ? items.find((r) => r.id === state.reviewFocusId) : null

  if (step) {
    const pageRef = normalizePageRef(step.context)
    const proposalDiff = collectProposalsForPage(editorData, pageRef || step.context)
    const mergedDiff = mergeDiffs(reviewItem?.diff, proposalDiff)

    const focusItem = {
      id: reviewItem?.id ?? `step:${step.id}`,
      title: step.title,
      detail: `${pageRef || step.context} · ${step.category} · ${step.source}`,
      type: step.category,
      risk: reviewItem?.risk ?? 'Low',
      reviewer: reviewItem?.reviewer ?? 'Unassigned',
      dest: reviewItem?.dest ?? seo.destination,
      diff: diffHasContent(mergedDiff) ? mergedDiff : reviewItem?.diff,
      pending: reviewItem?.pending ?? true,
      published: reviewItem?.published ?? false,
      canPublish: reviewItem?.canPublish ?? false,
      resolvedLabel: reviewItem?.resolvedLabel ?? 'Pending',
    }

    const stageOpts = stageOptsFromStep(step, pageRef || step.context)

    return (
      <div>
        <ReviewFocusPanel
          item={focusItem}
          showToast={showToast}
          actions={
            focusItem.pending || focusItem.canPublish
              ? buildActions(
                  focusItem.diff,
                  reviewItem?.id ?? state.reviewFocusId,
                  stageOpts,
                  {
                    onApprove: reviewItem?.onApprove ?? (() => showToast('Approved')),
                    onReject: reviewItem?.onReject ?? (() => showToast('Rejected')),
                    onPublish: reviewItem?.onPublish ?? (() => showToast('Nothing staged to publish yet')),
                  },
                )
              : undefined
          }
          onBack={() => {
            setState({ oppDetailStep: null, reviewFocusId: null })
            nav('opportunities')
          }}
          onViewAll={() => setState({ oppDetailStep: null, reviewFocusId: null })}
        />
        {!diffHasContent(focusItem.diff) && focusItem.pending && (
          <Card style={{ padding: '16px 18px', marginTop: 14, background: colors.amberBg, border: `1px solid ${colors.amber}44` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>No proposed text loaded yet</div>
            <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 6, lineHeight: 1.5 }}>
              Run generate from Prepare change, or refresh your site data, then click Continue again.
            </div>
            <HButton
              onClick={() => {
                setState({ oppDetailStep: null })
                nav('opportunities')
              }}
              style={{
                marginTop: 12,
                background: colors.ink,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 550,
              }}
            >
              Generate suggestions
            </HButton>
          </Card>
        )}
      </div>
    )
  }

  const focused = state.reviewFocusId != null ? items.find((r) => r.id === state.reviewFocusId) : null

  if (focused) {
    const pageRef = normalizePageRef(focused.detail)
    return (
      <div>
        <ReviewFocusPanel
          item={focused}
          showToast={showToast}
          actions={
            focused.pending || focused.canPublish
              ? buildActions(
                  focused.diff,
                  focused.id,
                  {
                    path: pageRef || focused.detail,
                    stepTitle: focused.title,
                    findingId: focused.findingId ?? null,
                  },
                  {
                    onApprove: focused.onApprove,
                    onReject: focused.onReject,
                    onPublish: focused.onPublish,
                  },
                )
              : undefined
          }
          onBack={() => {
            setState({ reviewFocusId: null })
            nav('opportunities')
          }}
          onViewAll={() => setState({ reviewFocusId: null })}
        />
      </div>
    )
  }

  const needsReview = items.filter((r) => r.pending)
  const completed = items.filter((r) => !r.pending)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', margin: '2px 0 16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Review queue</h1>
          <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
            Review each change, then approve and push to WordPress or mark complete if you will apply it
            manually.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 12, color: colors.muted }}>
            {pendingCount} needs review · {completedCount} completed
          </span>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 650, color: colors.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
        Needs review
      </div>
      <Card style={{ overflow: 'hidden', marginBottom: 24 }}>
        <ReviewQueueTable
          rows={needsReview}
          emptyMessage="Nothing waiting for review."
          onReview={(id) => setState({ reviewFocusId: id })}
        />
      </Card>

      <div style={{ fontSize: 12, fontWeight: 650, color: colors.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
        Completed
      </div>
      <Card style={{ overflow: 'hidden' }}>
        <ReviewQueueTable
          rows={completed}
          emptyMessage="Completed changes will appear here after you push, mark complete, or reject."
          onReview={(id) => setState({ reviewFocusId: id })}
        />
      </Card>
    </div>
  )
}
