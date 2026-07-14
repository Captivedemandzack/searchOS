import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReviewDiff } from '../data'
import { useSiteId } from '../data/DataProvider'
import { api } from '../lib/api'
import { useStore } from '../store'

export function seoValuesFromEdits(
  diff: ReviewDiff | null | undefined,
  edits: Record<string, string>,
): { title?: string; description?: string } {
  return {
    title: edits.title ?? diff?.title?.after,
    description: edits.meta ?? diff?.meta?.after,
  }
}

export function isSeoMetaDiff(diff: ReviewDiff | null | undefined): boolean {
  if (!diff || diff.manual) return false
  const hasSeo = !!(diff.title || diff.meta)
  const hasBody = !!(diff.content && diff.content.length > 0)
  return hasSeo && !hasBody
}

type StageOpts = {
  path: string
  stepTitle: string
  reviewItemId?: string | null
  findingId?: string | null
}

export function useReviewSeoPublish() {
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const { setState, showToast } = useStore()
  const [busy, setBusy] = useState(false)

  const connections = useQuery({
    queryKey: ['connections', siteId],
    queryFn: () => api.connectionsSummary(siteId!),
    enabled: !!siteId,
    staleTime: 120_000,
  })

  const wpConnected = connections.data?.wordpress.connected ?? false
  const connectorInstalled = connections.data?.wordpress.connectorInstalled ?? false
  const metaWrite = connections.data?.seoPlugin.capabilities.metaWrite ?? false
  const destination =
    connections.data?.seoPlugin.primary != null
      ? `WordPress · ${connections.data.seoPlugin.primary}`
      : 'WordPress · SEO plugin'

  const stage = useCallback(
    async (edits: Record<string, string>, diff: ReviewDiff | null | undefined, opts: StageOpts) => {
      if (!siteId) throw new Error('Still connecting — try again in a moment')
      const { title, description } = seoValuesFromEdits(diff, edits)
      const res = await api.stageSeoMeta(siteId, {
        path: opts.path,
        title,
        description,
        reviewItemId: opts.reviewItemId ?? undefined,
        stepTitle: opts.stepTitle,
        findingId: opts.findingId ?? undefined,
      })
      setState({ reviewFocusId: res.reviewItemId })
      await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      return res.reviewItemId
    },
    [queryClient, setState, siteId],
  )

  const approveSeo = useCallback(
    async (
      edits: Record<string, string>,
      diff: ReviewDiff | null | undefined,
      opts: StageOpts,
      reviewItemId?: string | null,
    ) => {
      setBusy(true)
      try {
        let id = reviewItemId
        if (!id || id.startsWith('step:')) {
          id = await stage(edits, diff, opts)
        } else {
          await stage(edits, diff, { ...opts, reviewItemId: id })
        }
        await api.setReviewStatus(siteId!, id, 'Approved')
        await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
        return id
      } catch (e) {
        showToast((e as Error).message)
        throw e
      } finally {
        setBusy(false)
      }
    },
    [queryClient, showToast, siteId, stage],
  )

  const publishSeo = useCallback(
    async (
      edits: Record<string, string>,
      diff: ReviewDiff | null | undefined,
      opts: StageOpts,
      reviewItemId?: string | null,
      alreadyApproved?: boolean,
    ) => {
      if (!siteId) {
        showToast('Still connecting — try again in a moment')
        return
      }
      if (!wpConnected) {
        showToast('Connect WordPress in Settings before publishing')
        return
      }
      if (!metaWrite) {
        showToast('No supported SEO plugin detected — sync WordPress or copy/paste manually')
        return
      }
      if (!connectorInstalled) {
        showToast(
          'Install the Groundwork Connector on WordPress first — Yoast blocks SEO writes without it',
        )
        return
      }

      setBusy(true)
      try {
        let id = reviewItemId
        if (!alreadyApproved || !id || id.startsWith('step:')) {
          id = await approveSeo(edits, diff, opts, reviewItemId)
        }
        const { title, description } = seoValuesFromEdits(diff, edits)
        const res = await api.publishReviewItem(siteId, id, { title, description })
        await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
        await queryClient.invalidateQueries({ queryKey: ['impact-changes', siteId] })
        if (res.editUrl) {
          window.open(res.editUrl, '_blank', 'noopener,noreferrer')
        }
        return res
      } catch (e) {
        showToast((e as Error).message)
        throw e
      } finally {
        setBusy(false)
      }
    },
    [approveSeo, connectorInstalled, metaWrite, queryClient, showToast, siteId, wpConnected],
  )

  const seoPublishAvailable = wpConnected && metaWrite && connectorInstalled

  const seoPublishBlockedReason = !wpConnected
    ? 'Connect WordPress in Settings to push SEO fields'
    : !connectorInstalled
      ? 'Install the Groundwork Connector plugin on WordPress (Settings → WordPress) to write Yoast/Rank Math fields'
      : !metaWrite
        ? 'Sync WordPress to detect Yoast, Rank Math, SEOPress, or AIOSEO'
        : undefined

  return {
    busy,
    destination,
    seoPublishAvailable,
    seoPublishBlockedReason,
    wpConnected,
    connectorInstalled,
    approveSeo,
    publishSeo,
  }
}
