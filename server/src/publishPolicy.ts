import type { ActionKind } from './audits/types.ts'

export type PublishTier = 'safe' | 'careful' | 'destructive'

/** Risk tier for each action kind — drives snapshot + publish behavior. */
export function actionTier(kind: ActionKind | string | null | undefined): PublishTier {
  switch (kind) {
    case 'blog_post':
    case 'elementor_page':
    case 'gbp_post':
      return 'safe'
    case 'prune':
    case 'consolidate':
      return 'destructive'
    default:
      return 'careful'
  }
}

/** Whether this tier may be pushed to WordPress via the API (always as draft unless live flag). */
export function canPublishToWordPress(tier: PublishTier): boolean {
  return tier === 'safe' || tier === 'careful'
}

/** Snapshot required before any write to existing live content. */
export function requiresSnapshot(tier: PublishTier): boolean {
  return tier === 'careful' || tier === 'destructive'
}

/** Clinical/YMYL content needs a named reviewer before publish. */
export function requiresYmyLReview(kind: ActionKind | string | null | undefined, subjectLabel: string): boolean {
  if (kind === 'blog_post') return true
  const clinical = /botox|filler|laser|inject|treatment|med spa|cosmetic|surgery|peel|microneedling/i
  return clinical.test(subjectLabel)
}

/** Default: all WP writes create drafts, never overwrite published content silently. */
export const DRAFT_ONLY_DEFAULT = true
