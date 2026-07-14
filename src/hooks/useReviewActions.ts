import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReviewDiff } from '../data'
import { useSiteId } from '../data/DataProvider'
import { api } from '../lib/api'
import { isSeoMetaDiff, useReviewSeoPublish } from '../hooks/useReviewSeoPublish'
import { useStore } from '../store'
import { removeInProgressStep } from '../lib/workflow'

type StageOpts = { path: string; stepTitle: string; findingId?: string | null }

type Handlers = {
  onApprove: () => void
  onReject: () => void
  onPublish: () => void
}

export function useReviewActions(onComplete?: () => void) {
  const { setState, showToast } = useStore()
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const seo = useReviewSeoPublish()

  const complete = useCallback(() => {
    onComplete?.()
    setState((prev) => {
      const stepId = prev.oppDetailStep?.id
      const sitePatch =
        siteId && stepId ? removeInProgressStep(prev, siteId, stepId) : {}
      return {
        ...sitePatch,
        oppDetailStep: null,
        reviewFocusId: null,
        oppTab: 'completed' as const,
      }
    })
    queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    queryClient.invalidateQueries({ queryKey: ['next-steps'] })
    if (siteId) queryClient.invalidateQueries({ queryKey: ['impact-changes', siteId] })
  }, [onComplete, queryClient, setState, siteId])

  const buildActions = useCallback(
    (
      diff: ReviewDiff | null | undefined,
      reviewItemId: string | null | undefined,
      stageOpts: StageOpts,
      handlers: Handlers,
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
              complete()
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
            showToast('Pushed to WordPress')
            complete()
          } catch (e) {
            showToast((e as Error).message)
          }
        },
        onApprove: async (edits: Record<string, string>) => {
          if (seoOnly) {
            try {
              await seo.approveSeo(edits, diff, stageOpts, reviewItemId)
              showToast('Completed')
              complete()
            } catch {
              /* toast shown in hook */
            }
            return
          }
          if (siteId && reviewItemId && !reviewItemId.startsWith('step:')) {
            await api.setReviewStatus(siteId, reviewItemId, 'Approved')
          } else {
            handlers.onApprove()
          }
          showToast('Completed')
          complete()
        },
        onReject: () => {
          handlers.onReject()
          showToast('Rejected')
          complete()
        },
      }
    },
    [complete, seo, showToast, siteId],
  )

  return { buildActions, seo, complete }
}
