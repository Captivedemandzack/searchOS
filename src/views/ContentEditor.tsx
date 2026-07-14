import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { editorTabDefs, type EditorItem, type EditorTabId, type RecommendationTabId } from '../data'
import { useData, useSiteId } from '../data/DataProvider'
import { useStore } from '../store'
import { colors, mono } from '../theme'
import { HButton } from '../lib/Hover'
import { api } from '../lib/api'
import { pageRefsMatch } from '../lib/proposedChanges'
import { buildSitePathIndex } from '../lib/sitePaths'
import {
  BodyTabBody,
  FaqTabBody,
  HeadingsTabBody,
  LinksTabBody,
  SchemaTabBody,
  SeoSectionBody,
  type TabItemView,
} from '../components/EditorTabPanels'

type EditorData = Record<RecommendationTabId, EditorItem[]>

function itemsForTab(
  tab: EditorTabId,
  data: EditorData,
  matchesPage: (it: EditorItem) => boolean,
  isBlogPost = false,
): TabItemView[] {
  if (tab === 'seo') {
    return [
      ...(data.title ?? []).filter(matchesPage).map((it) => ({
        it,
        sectionLabel: isBlogPost ? 'SEO title tag (Google search results)' : 'Title tag',
        charLimit: 60,
      })),
      ...(data.meta ?? []).filter(matchesPage).map((it) => ({
        it,
        sectionLabel: 'Meta description',
        charLimit: 158,
      })),
    ]
  }
  return (data[tab] ?? []).filter(matchesPage).map((it) => ({ it }))
}

function countForTab(
  tab: EditorTabId,
  data: EditorData,
  matchesPage: (it: EditorItem) => boolean,
  isBlogPost = false,
): number {
  return itemsForTab(tab, data, matchesPage, isBlogPost).length
}

// Title/meta are generated from the Opportunities flow (or the Refresh auto-draft);
// these five are generated per-page from the Content updates page itself.
const PAGE_GEN_TABS = new Set<Exclude<RecommendationTabId, 'title' | 'meta'>>([
  'headings',
  'body',
  'faq',
  'schema',
  'links',
])

const selectStyle = {
  border: `1px solid ${colors.borderInput}`,
  borderRadius: 8,
  padding: '5px 9px',
  fontSize: 12.5,
  background: '#fff',
  color: colors.text,
  maxWidth: 460,
}

export type ContentEditorViewProps = {
  /** When set, filter recommendations to this page path only. */
  scopedPath?: string
  lockPage?: boolean
  /** Hide the page-level heading when nested inside Act. */
  embedded?: boolean
}

export function ContentEditorView({ scopedPath, lockPage, embedded }: ContentEditorViewProps = {}) {
  const { state, setState, showToast } = useStore()
  const { editorData, sites } = useData()
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const pagesIndexQuery = useQuery({
    queryKey: ['pages-index', siteId],
    queryFn: () => api.pagesIndex(siteId!),
    enabled: !!siteId,
    staleTime: 60_000,
  })
  const siteBaseUrl = useMemo(() => {
    const domain = sites[state.siteIdx]?.domain
    if (!domain) return null
    const host = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
    return `https://${host}`
  }, [sites, state.siteIdx])
  const sitePaths = useMemo(
    () => buildSitePathIndex(pagesIndexQuery.data ?? [], siteBaseUrl),
    [pagesIndexQuery.data, siteBaseUrl],
  )

  // Generate on-page content (H1/H2s, body, FAQ, schema, links) for the selected
  // page. `types` undefined = all five; a single type = just that tab.
  const genMut = useMutation({
    mutationFn: (vars: { path: string; types?: Exclude<RecommendationTabId, 'title' | 'meta'>[] }) =>
      api.generatePageUpdates(siteId!, vars.path, vars.types),
    onSuccess: (r) => {
      const msg = r.generated.length
        ? `Generated ${r.generated.join(', ')} for ${r.path}`
        : 'Nothing generated'
      showToast(r.errors.length ? `${msg} · ${r.errors.length} failed` : msg)
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    },
    onError: (e: Error) => showToast(e.message),
  })
  const genPendingTypes = (genMut.variables?.types ?? null) as Exclude<RecommendationTabId, 'title' | 'meta'>[] | null
  // Scope the whole editor to one page/post; every change-tab then shows only
  // that URL's recommendations. 'All' = the full cross-page view.
  const [pageFilter, setPageFilter] = useState<string>(scopedPath ?? 'All')

  useEffect(() => {
    if (scopedPath) setPageFilter(scopedPath)
  }, [scopedPath])
  const tab = state.editorTab

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard')
    })
  }

  const onCopied = () => showToast('Copied to clipboard')

  const allItems = Object.values(editorData).flat()
  const approvedCount = allItems.filter((i) => state.approvals[i.id] === 'approved').length
  const rejectedCount = allItems.filter((i) => state.approvals[i.id] === 'rejected').length

  // Distinct pages/posts that have any recommendation, split for the selector.
  const byPath = new Map<string, string>() // path -> type
  for (const it of allItems) if (!byPath.has(it.page)) byPath.set(it.page, it.type ?? 'page')
  const entries = [...byPath.entries()].map(([path, type]) => ({ path, type }))
  const pageList = entries.filter((p) => p.type !== 'post').sort((a, b) => a.path.localeCompare(b.path))
  const postList = entries.filter((p) => p.type === 'post').sort((a, b) => a.path.localeCompare(b.path))

  const matchesPage = (it: EditorItem) =>
    pageFilter === 'All' || pageRefsMatch(it.page, pageFilter)
  const scopedType =
    pageFilter !== 'All' ? entries.find((e) => pageRefsMatch(e.path, pageFilter))?.type : undefined
  const isBlogPost = scopedType === 'post'
  const tabCount = (tabId: EditorTabId) => countForTab(tabId, editorData as EditorData, matchesPage, isBlogPost)

  const currentLabel = editorTabDefs.find(([id]) => id === tab)?.[1] ?? tab
  const tabItems = itemsForTab(tab, editorData as EditorData, matchesPage, isBlogPost)
  const items = tabItems.map(({ it, sectionLabel, charLimit }) => {
    const text = state.edits[it.id] != null ? state.edits[it.id] : it.suggested
    const isEditing = !!state.editing[it.id]
    return { it, text, isEditing, sectionLabel, charLimit }
  })

  const schemaPagePath =
    pageFilter !== 'All' ? pageFilter : items[0]?.it.page ?? null
  const liveSchemaQuery = useQuery({
    queryKey: ['page-live-schema', siteId, schemaPagePath],
    queryFn: () => api.pageLiveSchema(siteId!, schemaPagePath!),
    enabled: !!siteId && tab === 'schema' && !!schemaPagePath,
    staleTime: 60_000,
  })

  return (
    <div>
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0 14px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>
              Content updates
            </h1>
            <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
              Review each suggested change against the current version. Approvals are staged to the review
              queue.
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: colors.muted }}>
              {approvedCount} approved · {rejectedCount} rejected
            </span>
            <HButton
              onClick={() =>
                showToast(
                  approvedCount +
                    ' approved change' +
                    (approvedCount === 1 ? '' : 's') +
                    ' staged to review queue',
                )
              }
              hover={{ background: colors.inkStrong }}
              style={{
                background: colors.ink,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '7px 13px',
                fontSize: 12.5,
                fontWeight: 550,
              }}
            >
              Stage approved changes
            </HButton>
          </div>
        </div>
      )}

      {lockPage && scopedPath && !embedded && (
        <div style={{ fontSize: 12, color: colors.muted2, marginBottom: 14, fontFamily: mono }}>
          Scoped to {scopedPath}
        </div>
      )}
      {entries.length > 0 && !lockPage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, color: colors.muted }}>Page</span>
          <select
            value={pageFilter}
            onChange={(e) => setPageFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="All">All pages &amp; posts ({entries.length})</option>
            {pageList.length > 0 && (
              <optgroup label="Pages">
                {pageList.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path}
                  </option>
                ))}
              </optgroup>
            )}
            {postList.length > 0 && (
              <optgroup label="Posts">
                {postList.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {pageFilter !== 'All' && (
            <HButton
              onClick={() => setPageFilter('All')}
              hover={{ textDecoration: 'underline' }}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: colors.accent, fontWeight: 550 }}
            >
              Clear
            </HButton>
          )}
          {pageFilter !== 'All' && (
            <HButton
              onClick={() => !genMut.isPending && genMut.mutate({ path: pageFilter })}
              hover={genMut.isPending ? undefined : { background: colors.inkStrong }}
              title="Generate H1/H2s, body, FAQ, schema & internal links for this page"
              style={{
                marginLeft: 'auto',
                background: colors.ink,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 550,
                cursor: genMut.isPending ? 'default' : 'pointer',
                opacity: genMut.isPending ? 0.7 : 1,
              }}
            >
              {genMut.isPending && genPendingTypes === null ? 'Generating…' : 'Generate content for this page'}
            </HButton>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${colors.border}`, marginBottom: 16 }}>
        {editorTabDefs.map(([id, label]) => {
          const active = tab === id
          const count = tabCount(id)
          const dim = count === 0 && pageFilter !== 'All'
          return (
            <HButton
              key={id}
              onClick={() => setState({ editorTab: id })}
              hover={active ? undefined : { color: colors.ink }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                padding: '9px 13px',
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                color: active ? colors.ink : dim ? colors.faint : colors.muted2,
                borderBottom: active ? `2px solid ${colors.ink}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {label}
              {count > 0 && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 650,
                    color: active ? colors.ink : colors.muted2,
                    background: colors.chipBg,
                    borderRadius: 99,
                    padding: '0 6px',
                  }}
                >
                  {count}
                </span>
              )}
            </HButton>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 960 }}>
        {items.length === 0 &&
          (PAGE_GEN_TABS.has(tab as Exclude<RecommendationTabId, 'title' | 'meta'>) ? (
            <div style={{ padding: '24px 0', maxWidth: 620 }}>
              {pageFilter === 'All' ? (
                <div style={{ fontSize: 12.5, color: colors.muted2, lineHeight: 1.55 }}>
                  Pick a page from the selector above, then generate its {currentLabel.toLowerCase()}.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12.5, color: colors.muted2, marginBottom: 12, lineHeight: 1.55 }}>
                    {embedded && lockPage
                      ? `No ${currentLabel.toLowerCase()} yet. Use Build game plan above first.`
                      : `No ${currentLabel.toLowerCase()} generated for ${' '}
                    <span style={{ fontFamily: mono, color: colors.text }}>{pageFilter}</span> yet.`}
                  </div>
                  {!embedded && (
                  <HButton
                    onClick={() =>
                      !genMut.isPending &&
                      PAGE_GEN_TABS.has(tab as Exclude<RecommendationTabId, 'title' | 'meta'>) &&
                      genMut.mutate({ path: pageFilter, types: [tab as Exclude<RecommendationTabId, 'title' | 'meta'>] })
                    }
                    hover={genMut.isPending ? undefined : { background: colors.inkStrong }}
                    style={{
                      background: colors.ink,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 12.5,
                      fontWeight: 550,
                      cursor: genMut.isPending ? 'default' : 'pointer',
                      opacity: genMut.isPending ? 0.7 : 1,
                    }}
                  >
                    {genMut.isPending && genPendingTypes?.[0] === tab
                      ? 'Generating…'
                      : `Generate ${currentLabel} for this page`}
                  </HButton>
                  )}
                </>
              )}
            </div>
          ) : (
            <div style={{ padding: '28px 0', fontSize: 12.5, color: colors.muted2, maxWidth: 620, lineHeight: 1.55 }}>
              {embedded && lockPage
                ? `No ${currentLabel.toLowerCase()} yet. Use Build game plan above to generate suggestions for this page.`
                : pageFilter === 'All'
                  ? `No ${currentLabel.toLowerCase()} rewrites generated yet. Open an opportunity and use Build game plan.`
                  : `No ${currentLabel.toLowerCase()} for ${pageFilter} yet. Open its opportunity and use Build game plan.`}
            </div>
          ))}
        {items.map(({ it, text, isEditing, sectionLabel, charLimit }) => (
          <div
            key={it.id}
            style={{
              background: '#fff',
              border: `1px solid ${colors.border}`,
              borderRadius: 10,
              boxShadow: '0 1px 2px rgba(20,20,17,.03)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 18px',
                borderBottom: `1px solid ${colors.hair}`,
              }}
            >
              {!embedded && !lockPage ? (
                <span style={{ fontFamily: mono, fontSize: 12, color: colors.muted }}>{it.page}</span>
              ) : null}
              {sectionLabel ? (
                <span style={{ fontSize: 12, fontWeight: 650, color: colors.ink }}>{sectionLabel}</span>
              ) : null}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <HButton
                  onClick={() => setState({ editing: { ...state.editing, [it.id]: !isEditing } })}
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
                  {isEditing ? 'Done' : 'Edit'}
                </HButton>
                {!embedded ? (
                  <>
                    <HButton
                      onClick={() => copy(text)}
                      hover={{ background: '#f6f6f1' }}
                      style={{
                        background: '#fff',
                        border: `1px solid ${colors.borderBtn}`,
                        color: colors.ink,
                        borderRadius: 7,
                        padding: '5px 11px',
                        fontSize: 11.5,
                        fontWeight: 550,
                      }}
                    >
                      Copy
                    </HButton>
                    <button
                      onClick={() =>
                        setState({
                          approvals: { ...state.approvals, [it.id]: 'approved' },
                          editing: { ...state.editing, [it.id]: false },
                        })
                      }
                      style={{
                        background: '#fff',
                        border: `1px solid ${colors.borderBtn}`,
                        color: colors.green,
                        borderRadius: 7,
                        padding: '5px 11px',
                        fontSize: 11.5,
                        fontWeight: 550,
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() =>
                        setState({
                          approvals: { ...state.approvals, [it.id]: 'rejected' },
                          editing: { ...state.editing, [it.id]: false },
                        })
                      }
                      style={{
                        background: '#fff',
                        border: `1px solid ${colors.borderBtn}`,
                        color: colors.muted,
                        borderRadius: 7,
                        padding: '5px 11px',
                        fontSize: 11.5,
                        fontWeight: 550,
                      }}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {tab === 'seo' && sectionLabel ? (
              <SeoSectionBody
                sectionLabel={sectionLabel}
                current={it.current}
                suggested={it.suggested}
                charLimit={charLimit}
                isEditing={isEditing}
                text={text}
                onTextChange={(v) => setState({ edits: { ...state.edits, [it.id]: v } })}
                onCopied={onCopied}
              />
            ) : tab === 'faq' ? (
              <FaqTabBody
                current={it.current}
                suggested={text}
                elementorJson={it.elementorJson}
                delivery={
                  it.elementorJson?.trim()
                    ? 'elementor'
                    : it.type === 'post'
                      ? 'post_content'
                      : 'post_content'
                }
                onCopied={onCopied}
              />
            ) : tab === 'schema' ? (
              <SchemaTabBody
                current={liveSchemaQuery.data?.formatted ?? it.current}
                suggested={text}
                reason={it.reason}
                liveUrl={liveSchemaQuery.data?.liveUrl}
                liveTypes={liveSchemaQuery.data?.types}
                onRefreshLive={() => void liveSchemaQuery.refetch()}
                refreshing={liveSchemaQuery.isFetching}
                onCopied={onCopied}
              />
            ) : tab === 'links' ? (
              <LinksTabBody
                current={it.current}
                suggested={text}
                reason={it.reason}
                sitePaths={sitePaths}
                onCopied={onCopied}
              />
            ) : tab === 'headings' ? (
              <HeadingsTabBody
                current={it.current}
                suggested={it.suggested}
                isEditing={isEditing}
                text={text}
                onTextChange={(v) => setState({ edits: { ...state.edits, [it.id]: v } })}
                onCopied={onCopied}
                isBlogPost={isBlogPost}
              />
            ) : (
              <BodyTabBody
                current={it.current}
                suggested={it.suggested}
                isEditing={isEditing}
                text={text}
                onTextChange={(v) => setState({ edits: { ...state.edits, [it.id]: v } })}
                onCopied={onCopied}
              />
            )}

            <div
              style={{
                padding: '11px 18px',
                borderTop: `1px solid ${colors.hair2}`,
                background: colors.subtle,
                borderRadius: '0 0 10px 10px',
              }}
            >
              <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
                <strong style={{ color: colors.text }}>Why:</strong> {it.reason}
              </div>
              {it.queries.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 650,
                      letterSpacing: '.05em',
                      textTransform: 'uppercase',
                      color: colors.muted2,
                      marginBottom: 6,
                    }}
                  >
                    Target queries
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {it.queries.map((q) => (
                      <span
                        key={q}
                        style={{
                          fontSize: 11,
                          color: colors.muted,
                          background: colors.chipBg,
                          borderRadius: 99,
                          padding: '2px 8px',
                        }}
                      >
                        {q}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
