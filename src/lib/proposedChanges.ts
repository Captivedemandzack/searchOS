import {
  type EditorItem,
  type RecommendationTabId,
  type ReviewDiff,
} from '../data'

const STORAGE_TAB_LABELS: Record<RecommendationTabId, string> = {
  title: 'SEO title',
  meta: 'Meta description',
  headings: 'H1 / H2s',
  body: 'Body copy',
  faq: 'FAQ',
  schema: 'Schema',
  links: 'Links on this page',
}

/** Normalize a page field that may be a path, slug, or full URL. */
export function normalizePageRef(context: string): string {
  const raw = context.split(' ')[0]?.trim() ?? ''
  if (!raw) return ''
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw).pathname.replace(/\/$/, '') || '/'
    }
  } catch {
    /* use raw */
  }
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return path.replace(/\/$/, '') || '/'
}

export function pageRefsMatch(a: string, b: string): boolean {
  const na = normalizePageRef(a)
  const nb = normalizePageRef(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.endsWith(nb) || nb.endsWith(na)) return true
  const sa = na.split('/').filter(Boolean).pop()
  const sb = nb.split('/').filter(Boolean).pop()
  return !!sa && sa === sb
}

/** Gather all AI recommendations for one page into a single diff-shaped preview. */
export function collectProposalsForPage(
  editorData: Record<RecommendationTabId, EditorItem[]>,
  pageRef: string,
): ReviewDiff {
  const subjectRef = normalizePageRef(pageRef)
  const diff: ReviewDiff = { subjectRef, content: [] }

  for (const [tab, items] of Object.entries(editorData) as [RecommendationTabId, EditorItem[]][]) {
    const matched = items.filter((i) => pageRefsMatch(i.page, pageRef))
    if (!matched.length) continue

    if (tab === 'title') {
      if (matched[0].current.trim() !== matched[0].suggested.trim()) {
        diff.title = { before: matched[0].current, after: matched[0].suggested }
      }
      continue
    }
    if (tab === 'meta') {
      if (matched[0].current.trim() !== matched[0].suggested.trim()) {
        diff.meta = { before: matched[0].current, after: matched[0].suggested }
      }
      continue
    }

    for (const item of matched) {
      if (item.current.trim() === item.suggested.trim()) continue
      diff.content!.push({
        tab: STORAGE_TAB_LABELS[tab] ?? tab,
        before: item.current,
        after: item.suggested,
        elementorReady: tab === 'faq' && !!item.elementorJson?.trim(),
        postContentReady: tab === 'faq' && !item.elementorJson?.trim() && !!item.suggested.trim(),
      })
    }
  }

  return diff
}

function fieldIsMeaningful(field?: { before: string; after: string } | null): boolean {
  return !!field && field.before.trim() !== field.after.trim()
}

/** Prefer the side that actually shows a before → after change. */
function pickDiffField(
  primary?: { before: string; after: string } | null,
  secondary?: { before: string; after: string } | null,
): { before: string; after: string } | undefined {
  if (fieldIsMeaningful(primary)) return primary!
  if (fieldIsMeaningful(secondary)) return secondary!
  if (primary) return primary
  if (secondary) return secondary
  return undefined
}

export function mergeDiffs(primary: ReviewDiff | null | undefined, secondary: ReviewDiff): ReviewDiff {
  if (!primary) return secondary
  const title = pickDiffField(primary.title ?? undefined, secondary.title ?? undefined)
  const meta = pickDiffField(primary.meta ?? undefined, secondary.meta ?? undefined)
  const contentTabs = new Set([
    ...(primary.content ?? []).map((c) => c.tab),
    ...(secondary.content ?? []).map((c) => c.tab),
  ])
  const content = [...contentTabs]
    .map((tab) => {
      const fromPrimary = (primary.content ?? []).find((p) => p.tab === tab)
      const fromSecondary = (secondary.content ?? []).find((p) => p.tab === tab)
      const picked = pickDiffField(fromPrimary, fromSecondary)
      return picked ? { tab, ...picked } : null
    })
    .filter((c): c is { tab: string; before: string; after: string } => c != null)
  return {
    subjectRef: primary.subjectRef ?? secondary.subjectRef,
    title: title ?? null,
    meta: meta ?? null,
    content,
    manual: primary.manual ?? secondary.manual,
    instructions: primary.instructions ?? secondary.instructions,
  }
}

export function diffHasContent(diff: ReviewDiff | null | undefined): boolean {
  if (!diff) return false
  return !!(
    fieldIsMeaningful(diff.title) ||
    fieldIsMeaningful(diff.meta) ||
    (diff.content && diff.content.some((c) => fieldIsMeaningful(c))) ||
    (diff.manual && diff.instructions)
  )
}

/** Map editor tab text into the field keys used when pushing to WordPress. */
export function buildEditorPushEdits(
  editorData: Partial<Record<RecommendationTabId, EditorItem[]>>,
  pageRef: string,
  userEdits: Record<string, string>,
): Record<string, string> {
  const edits: Record<string, string> = {}
  const match = (it: EditorItem) => pageRefsMatch(it.page, pageRef)

  const title = editorData.title?.find(match)
  if (title) edits.title = userEdits[title.id] ?? title.suggested

  const meta = editorData.meta?.find(match)
  if (meta) edits.meta = userEdits[meta.id] ?? meta.suggested

  for (const tab of ['headings', 'body', 'faq', 'schema', 'links'] as const) {
    const item = editorData[tab]?.find(match)
    if (item) edits[STORAGE_TAB_LABELS[tab]] = userEdits[item.id] ?? item.suggested
  }

  return edits
}
