import type { ActionKind } from './types.ts'

export type DraftActionInput = {
  siteId: string
  findingId: string
  actionKind: ActionKind
}

/** Maps action kinds to review item metadata. */
export function actionReviewMeta(kind: ActionKind, title: string, subjectRef: string): { type: string; risk: string; dest: string } {
  switch (kind) {
    case 'prune':
    case 'consolidate':
      return { type: 'Destructive', risk: 'High', dest: 'WordPress' }
    case 'blog_post':
    case 'elementor_page':
      return { type: 'New content', risk: 'Medium', dest: 'WordPress draft' }
    case 'gbp_post':
      return { type: 'Local', risk: 'Low', dest: 'Google Business Profile' }
    case 'redirect':
      return { type: 'Technical', risk: 'Medium', dest: 'WordPress redirect' }
    default:
      return { type: 'Content', risk: 'Low', dest: subjectRef }
  }
}
