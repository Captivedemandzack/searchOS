import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSiteId, useData } from '../data/DataProvider'
import { useStore } from '../store'
import { colors, mono } from '../theme'
import { Card } from '../components/primitives'
import { HButton, HDiv } from '../lib/Hover'
import { api, type BlogPost, type RefreshQueueItem, type RefreshQueueResponse } from '../lib/api'

const inputStyle = {
  border: `1px solid ${colors.borderInput}`,
  borderRadius: 8,
  padding: '8px 11px',
  fontSize: 13,
  color: colors.text,
  background: '#fff',
  width: '100%',
}

export function ContentStudioView() {
  const { state, showToast } = useStore()
  const { sites } = useData()
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [angle, setAngle] = useState('')

  const ideas = useQuery({
    queryKey: ['blog-ideas', siteId],
    queryFn: () => api.blogTopicIdeas(siteId!),
    enabled: !!siteId,
    staleTime: 5 * 60_000,
  })
  const drafts = useQuery({
    queryKey: ['blog-list', siteId],
    queryFn: () => api.blogList(siteId!),
    enabled: !!siteId,
  })
  const refreshQueue = useQuery({
    queryKey: ['refresh-queue', siteId],
    queryFn: () => api.refreshQueue(siteId!),
    enabled: !!siteId,
    staleTime: 5 * 60_000,
  })
  const governor = ideas.data?.governor

  const gen = useMutation({
    mutationFn: (vars: { keyword: string; angle?: string; estClicks?: number }) =>
      api.blogGenerate(siteId!, vars),
    onSuccess: (post) => {
      showToast(`Draft written: “${post.title}”`)
      queryClient.invalidateQueries({ queryKey: ['blog-list', siteId] })
      setSelectedId(post.id)
      setKeyword('')
      setAngle('')
    },
    onError: (e: Error) => showToast(e.message),
  })

  const generate = (kw: string, est?: number) => {
    if (!kw.trim()) return
    if (!siteId) return showToast('Still connecting — try again in a moment')
    if (gen.isPending) return
    gen.mutate({ keyword: kw.trim(), angle: angle.trim() || undefined, estClicks: est })
  }

  if (selectedId) {
    return <PostDetail postId={selectedId} onBack={() => setSelectedId(null)} />
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 6px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Content Studio</h1>
        <span style={{ fontSize: 12.5, color: colors.muted2 }}>{sites[state.siteIdx]?.domain}</span>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: colors.muted, maxWidth: 720 }}>
        Refresh first: existing URLs carry index history and links, so updating them beats launching
        new ones. New posts are recommended only where a real content gap exists.
      </p>

      {/* PRIMARY OUTPUT: the refresh queue */}
      <RefreshQueueSection data={refreshQueue.data} loading={refreshQueue.isLoading} />

      {/* Flagship: the latest auto-written draft, front and center */}
      {drafts.data && drafts.data.length > 0 && (
        <HDiv
          onClick={() => setSelectedId(drafts.data![0].id)}
          hover={{ boxShadow: '0 2px 10px rgba(20,20,17,.08)' }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            background: colors.ink,
            color: '#fff',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 16,
            maxWidth: 760,
            cursor: 'pointer',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: '.06em', textTransform: 'uppercase', color: '#b9c4f0' }}>
              {drafts.data[0].status === 'Published' ? 'Latest post' : 'Your next blog — written & ready'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 650, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {drafts.data[0].title}
            </div>
            <div style={{ fontSize: 12, color: '#c9c9c0', marginTop: 3 }}>
              targets “{drafts.data[0].targetKeyword}”
              {drafts.data[0].estClicks ? ` · ~${drafts.data[0].estClicks} clicks/mo` : ''} · grounded in your latest search + competitor data
            </div>
          </div>
          <span style={{ flex: 'none', background: '#fff', color: colors.ink, borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600 }}>
            Review & publish →
          </span>
        </HDiv>
      )}

      {/* Free-form generator */}
      <Card style={{ padding: '16px 18px', marginBottom: 16, maxWidth: 760 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Write a post</div>
        <div style={{ fontSize: 11.5, color: colors.muted2, marginBottom: 12 }}>
          Enter a topic or keyword, and (optionally) an angle. Claude writes the full article grounded in your data.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            placeholder="Target keyword or topic (e.g. lip flip nashville)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate(keyword)}
            style={inputStyle}
          />
          <input
            placeholder="Optional angle (e.g. compare to Botox, focus on downtime)"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate(keyword)}
            style={inputStyle}
          />
          <div>
            <HButton
              onClick={() => generate(keyword)}
              hover={gen.isPending || (governor && !governor.allowNewPosts) ? undefined : { background: colors.inkStrong }}
              style={{
                background: colors.ink,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 15px',
                fontSize: 13,
                fontWeight: 550,
                cursor: gen.isPending || (governor && !governor.allowNewPosts) ? 'default' : 'pointer',
                opacity: gen.isPending || (governor && !governor.allowNewPosts) ? 0.5 : 1,
              }}
              title={governor && !governor.allowNewPosts ? governor.reason ?? 'Publishing paused' : undefined}
            >
              {gen.isPending ? 'Writing the post…' : 'Generate draft'}
            </HButton>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start', maxWidth: 1100 }}>
        {/* Topic ideas from data */}
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, padding: '14px 18px', borderBottom: `1px solid ${colors.hair}` }}>
            Topic ideas from your data
          </div>
          <div style={{ fontSize: 11, color: colors.muted2, padding: '8px 18px 4px' }}>
            Searches you get impressions for but rank off page 1 with no dedicated page.
          </div>
          {ideas.isLoading && <div style={{ padding: 18, fontSize: 12.5, color: colors.muted2 }}>Loading…</div>}
          {/* Topic supply governor: at saturation or above the velocity ceiling,
              the correct recommendation is zero new posts — no filler topics. */}
          {governor && !governor.allowNewPosts && (
            <div style={{ margin: '10px 18px 16px', background: colors.amberBg, border: `1px solid ${colors.amber}33`, borderRadius: 8, padding: '11px 13px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 650, color: colors.amber }}>
                {governor.saturated ? `Topic coverage ${governor.coveragePct}% — publishing paused` : 'Publishing velocity ceiling reached'}
              </div>
              <div style={{ fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 1.5 }}>{governor.reason}</div>
            </div>
          )}
          {governor?.allowNewPosts && ideas.data?.ideas.length === 0 && (
            <div style={{ padding: 18, fontSize: 12.5, color: colors.muted2 }}>No clear content gaps right now.</div>
          )}
          {ideas.data?.ideas.map((idea) => (
            <div
              key={idea.keyword}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 18px',
                borderBottom: `1px solid ${colors.hair3}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {idea.keyword}
                </div>
                <div style={{ fontSize: 11, color: colors.muted2, marginTop: 1 }}>
                  {idea.monthlyImpressions.toLocaleString()} impr/mo · currently pos {idea.position}
                </div>
              </div>
              <div style={{ flex: 'none', textAlign: 'right' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.green, lineHeight: 1.1 }}>
                  +{idea.estClicks}
                </div>
                <div style={{ fontSize: 10, color: colors.muted2 }}>clicks / mo</div>
              </div>
              <HButton
                onClick={() => generate(idea.keyword, idea.estClicks)}
                hover={{ background: '#f6f6f1' }}
                style={{ flex: 'none', background: '#fff', border: `1px solid ${colors.borderBtn}`, borderRadius: 7, padding: '5px 10px', fontSize: 11.5, fontWeight: 550, color: colors.ink }}
              >
                {gen.isPending && gen.variables?.keyword === idea.keyword ? 'Writing…' : 'Write post'}
              </HButton>
            </div>
          ))}
        </Card>

        {/* Existing drafts */}
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, padding: '14px 18px', borderBottom: `1px solid ${colors.hair}` }}>
            Your drafts
          </div>
          {drafts.data?.length === 0 && (
            <div style={{ padding: 18, fontSize: 12.5, color: colors.muted2 }}>
              No posts yet — generate one from a topic idea or the box above.
            </div>
          )}
          {drafts.data?.map((p) => (
            <HDiv
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              hover={{ background: colors.subtleAlt }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 18px',
                borderBottom: `1px solid ${colors.hair3}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.title}
                </div>
                <div style={{ fontSize: 11, color: colors.muted2, marginTop: 1, fontFamily: mono }}>
                  /{p.slug}
                </div>
              </div>
              <span
                style={{
                  flex: 'none',
                  fontSize: 11,
                  fontWeight: 600,
                  color: p.status === 'Published' ? colors.green : colors.amber,
                  background: p.status === 'Published' ? colors.greenBg : colors.amberBg,
                  borderRadius: 99,
                  padding: '2px 9px',
                }}
              >
                {p.status}
              </span>
            </HDiv>
          ))}
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The refresh queue — the Content Engine's primary output. Ranked by commercial
// value (intent × page value × upside ÷ effort), not raw traffic.
// ---------------------------------------------------------------------------

const ACTION_META: Record<RefreshQueueItem['action'], { label: string; color: string; bg: string }> = {
  refresh: { label: 'Refresh', color: colors.accent, bg: colors.accentSoftBg },
  rewrite: { label: 'Rewrite', color: colors.amber, bg: colors.amberBg },
  consolidate: { label: 'Consolidate', color: colors.muted, bg: colors.chipBg },
  prune: { label: 'Prune', color: colors.red, bg: colors.redBg },
  leave_alone: { label: 'Leave alone', color: colors.green, bg: colors.greenBg },
  insufficient_data: { label: 'Needs data', color: colors.muted2, bg: colors.chipBg },
}

/** Always-visible data reality check: what the recommendations below are based on. */
function DataConfidencePanel({ data }: { data: RefreshQueueResponse }) {
  const s = data.sufficiency
  const r = data.reconciliation
  const historyOk = s.gscHistoryMonths >= s.pruneBarMonths
  const skipped = s.pagesTotal - s.pagesWithGscData
  const stat = { fontSize: 10.5, fontWeight: 650, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: colors.muted2 }
  return (
  <>
      {!data.trusted && (
        <div style={{ margin: '0 18px', marginTop: 12, background: colors.amberBg, border: `1px solid ${colors.amber}33`, borderRadius: 8, padding: '11px 13px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 650, color: colors.amber }}>Queue untrusted — reconciliation failed</div>
          <div style={{ fontSize: 12, color: colors.text, marginTop: 4, lineHeight: 1.5 }}>
            {r.failures.length > 0 ? r.failures.join(' · ') : 'Recommendation counts do not balance against resolved pages.'}
          </div>
        </div>
      )}
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 14,
        padding: '12px 18px',
        borderBottom: `1px solid ${colors.hair}`,
        background: colors.subtle,
      }}
    >
      <div>
        <div style={stat}>GSC history</div>
        <div style={{ fontSize: 13, fontWeight: 650, marginTop: 3, color: historyOk ? colors.ink : colors.amber }}>
          {s.gscHistoryMonths} months {historyOk ? '✓' : `— below the ${s.pruneBarMonths}-month prune bar`}
        </div>
        <div style={{ fontSize: 11, color: colors.muted2, marginTop: 1 }}>
          {s.gscCoverageGaps.length ? `${s.gscCoverageGaps.length} gap month(s): ${s.gscCoverageGaps.join(', ')}` : 'no coverage gaps'}
        </div>
      </div>
      <div>
        <div style={stat}>Pages analyzed</div>
        <div style={{ fontSize: 13, fontWeight: 650, marginTop: 3 }}>
          {s.pagesWithGscData} of {s.pagesTotal}
        </div>
        <div style={{ fontSize: 11, color: colors.muted2, marginTop: 1 }}>
          {skipped > 0 ? `${skipped} skipped — no GSC data (unknown, not dead)` : 'full search coverage'}
        </div>
      </div>
      <div>
        <div style={stat}>GA4 conversions</div>
        <div style={{ fontSize: 13, fontWeight: 650, marginTop: 3, color: s.ga4Status === 'active' ? colors.green : s.ga4Status === 'partial' ? colors.amber : colors.red }}>
          {s.ga4Status === 'active' ? `Active · ${s.ga4Conversions.toLocaleString()} in window` : s.ga4Status === 'partial' ? `Partial · only ${s.ga4Conversions}` : 'Not detected'}
        </div>
        <div style={{ fontSize: 11, color: data.priorityMode === 'traffic-intent-only' ? colors.red : colors.muted2, marginTop: 1, fontWeight: data.priorityMode === 'traffic-intent-only' ? 650 : 400 }}>
          {data.priorityMode === 'traffic-intent-only'
            ? '⚠ Revenue weighting unavailable — ranking by traffic + intent only'
            : 'priority is conversion-weighted'}
        </div>
      </div>
      <div>
        <div style={stat}>Keyword universe</div>
        <div style={{ fontSize: 13, fontWeight: 650, marginTop: 3 }}>
          {s.keywordUniverseSize.toLocaleString()} keywords
        </div>
        <div style={{ fontSize: 11, color: colors.muted2, marginTop: 1 }}>{s.universeSource}</div>
      </div>
      <div>
        <div style={stat}>Reconciliation</div>
        <div style={{ fontSize: 13, fontWeight: 650, marginTop: 3, color: r.balanced ? colors.green : colors.amber }}>
          {r.balanced ? 'Balanced ✓' : 'Does not balance'}
        </div>
        <div style={{ fontSize: 11, color: colors.muted2, marginTop: 1 }}>
          {r.totalRecs} recs · {r.resolvedPages} resolved pages
        </div>
      </div>
    </div>
  </>
  )
}

/** Per-item confirmation for destructive actions: full GSC history + inbound
 *  internal links + the proposed 301 target, then an explicit confirm. There is
 *  deliberately no bulk path — one page at a time. */
function DestructiveConfirm({ item, onDone }: { item: RefreshQueueItem; onDone: () => void }) {
  const siteId = useSiteId()
  const { showToast } = useStore()
  const [confirmed, setConfirmed] = useState(false)
  const history = useQuery({
    queryKey: ['page-history', siteId, item.path],
    queryFn: () => api.pageHistory(siteId!, item.path),
    enabled: !!siteId,
  })
  const stage = useMutation({
    mutationFn: () =>
      api.stageDestructive(siteId!, { path: item.path, action: item.action as 'prune' | 'consolidate', confirmed: true }),
    onSuccess: () => {
      showToast(`${ACTION_META[item.action].label} staged to the review queue — nothing touches the site until a human executes it`)
      onDone()
    },
    onError: (e: Error) => showToast(e.message),
  })
  const h = history.data
  const label = { fontSize: 10.5, fontWeight: 650, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: colors.muted2 }

  return (
    <div style={{ padding: '14px 18px 16px 118px', background: colors.subtle, borderTop: `1px solid ${colors.hair2}` }}>
      {item.action === 'consolidate' && (
        <div style={{ fontSize: 12.5, marginBottom: 10, color: colors.text }}>
          {item.consolidateInto ? (
            <>
              <strong style={{ color: colors.red }}>Loses:</strong>{' '}
              <span style={{ fontFamily: mono }}>{item.path}</span>{' '}
              <strong style={{ color: colors.green, marginLeft: 10 }}>Wins:</strong>{' '}
              <span style={{ fontFamily: mono }}>{item.consolidateInto}</span>
              <span style={{ color: colors.muted2 }}> · proposed 301: {item.path} → {item.consolidateInto}</span>
            </>
          ) : (
            <>
              <strong style={{ color: colors.green }}>This URL wins</strong> — competitors consolidate into{' '}
              <span style={{ fontFamily: mono }}>{item.path}</span>. Stage the losing URLs instead.
            </>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 18 }}>
        <div>
          <div style={label}>Full GSC history · monthly</div>
          {history.isLoading && <div style={{ fontSize: 12, color: colors.muted2, marginTop: 6 }}>Loading…</div>}
          {h && h.monthly.length === 0 && (
            <div style={{ fontSize: 12, color: colors.muted2, marginTop: 6 }}>No GSC rows exist for this exact URL.</div>
          )}
          {h && h.monthly.length > 0 && (
            <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
              {h.monthly.map((m) => (
                <div key={m.month} style={{ display: 'flex', gap: 12, fontSize: 11.5, padding: '2px 0', color: colors.text }}>
                  <span style={{ fontFamily: mono, width: 62, color: colors.muted }}>{m.month}</span>
                  <span style={{ width: 90 }}>{m.clicks.toLocaleString()} clicks</span>
                  <span style={{ color: colors.muted2 }}>{m.impressions.toLocaleString()} impressions</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={label}>Inbound internal links</div>
          {h && h.inboundLinks.length === 0 && (
            <div style={{ fontSize: 12, color: colors.muted2, marginTop: 6 }}>None found in synced content.</div>
          )}
          {h?.inboundLinks.map((l) => (
            <div key={l.path} style={{ fontSize: 11.5, fontFamily: mono, color: colors.text, padding: '2px 0' }}>
              {l.path}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: colors.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I’ve reviewed the history and inbound links — this can lose rankings permanently.
        </label>
        <HButton
          onClick={() => confirmed && !stage.isPending && stage.mutate()}
          hover={confirmed ? { background: '#b3261e' } : undefined}
          style={{
            marginLeft: 'auto',
            background: confirmed ? colors.red : colors.chipBg,
            color: confirmed ? '#fff' : colors.muted2,
            border: 'none',
            borderRadius: 7,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: confirmed ? 'pointer' : 'not-allowed',
          }}
        >
          {stage.isPending ? 'Staging…' : `Stage ${ACTION_META[item.action].label.toLowerCase()} for review`}
        </HButton>
      </div>
    </div>
  )
}

function RefreshQueueSection({ data, loading }: { data?: RefreshQueueResponse; loading: boolean }) {
  const [showAll, setShowAll] = useState(false)
  const [actionFilter, setActionFilter] = useState<'All' | RefreshQueueItem['action']>('All')
  // One destructive confirmation open at a time — there is no bulk path.
  const [confirmPath, setConfirmPath] = useState<string | null>(null)

  const queue = (data?.queue ?? []).filter((r) => actionFilter === 'All' || r.action === actionFilter)
  const visible = showAll ? queue : queue.slice(0, 10)
  const counts = data?.counts ?? {}
  const tabs: ('All' | RefreshQueueItem['action'])[] = ['All', 'refresh', 'rewrite', 'consolidate', 'prune', 'leave_alone', 'insufficient_data']

  return (
    <Card style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${colors.hair}`, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Refresh queue</div>
        <span style={{ fontSize: 11.5, color: colors.muted2 }}>
          last {data?.policy.windowDays ?? 91} days vs the same period a year ago
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, background: colors.chipBg, borderRadius: 8, padding: 3 }}>
          {tabs.map((t) => {
            const active = actionFilter === t
            const n = t === 'All' ? data?.queue.length ?? 0 : counts[t] ?? 0
            return (
              <HButton
                key={t}
                onClick={() => setActionFilter(t)}
                hover={active ? undefined : { color: colors.ink }}
                style={{
                  background: active ? '#fff' : 'none',
                  border: 'none',
                  borderRadius: 6,
                  padding: '3px 9px',
                  fontSize: 11,
                  fontWeight: active ? 650 : 500,
                  color: active ? colors.ink : colors.muted,
                  boxShadow: active ? '0 1px 2px rgba(20,20,17,.06)' : 'none',
                }}
              >
                {t === 'All' ? 'All' : ACTION_META[t].label} {n}
              </HButton>
            )
          })}
        </div>
      </div>

      {data && <DataConfidencePanel data={data} />}

      {loading && <div style={{ padding: 18, fontSize: 12.5, color: colors.muted2 }}>Building the queue…</div>}
      {visible.map((r) => {
        const meta = ACTION_META[r.action]
        const destructive = r.action === 'prune' || r.action === 'consolidate'
        return (
          <div key={r.path + r.action} style={{ borderBottom: `1px solid ${colors.hair3}`, opacity: r.action === 'insufficient_data' ? 0.75 : 1 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px' }}
          >
            <span style={{ flex: 'none', width: 88, fontSize: 11, fontWeight: 650, color: meta.color, background: meta.bg, borderRadius: 99, padding: '2px 0', textAlign: 'center' }}>
              {meta.label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, fontFamily: mono, color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.path}
                </span>
                {r.lowConfidence && (
                  <span style={{ flex: 'none', fontSize: 10, fontWeight: 650, color: colors.amber, background: colors.amberBg, borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                    Low confidence
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.triggers.map((t) => t.reason).join(' · ')}>
                {r.reason}
                {r.reviewAfter ? ` Review after ${r.reviewAfter}.` : ''}
              </div>
            </div>
            {r.action !== 'leave_alone' && r.action !== 'prune' && (
              <div style={{ flex: 'none', textAlign: 'right', minWidth: 60 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: r.estMonthlyUpside > 0 ? colors.green : colors.muted2, lineHeight: 1.1 }}>
                  {r.estMonthlyUpside > 0 ? `+${r.estMonthlyUpside}` : '—'}
                </div>
                <div style={{ fontSize: 10, color: colors.muted2 }}>clicks / mo</div>
              </div>
            )}
            <span
              style={{
                flex: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '1px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 550,
                color: colors.muted,
                border: `1px solid ${colors.borderBtn}`,
                background: '#fff',
              }}
            >
              {r.effort}
            </span>
            {destructive && (
              <HButton
                onClick={() => setConfirmPath(confirmPath === r.path ? null : r.path)}
                hover={{ background: '#f6f6f1' }}
                title="Destructive action — requires per-item review of history and internal links"
                style={{ flex: 'none', background: '#fff', border: `1px solid ${colors.borderBtn}`, borderRadius: 7, padding: '4px 10px', fontSize: 11.5, fontWeight: 550, color: colors.red }}
              >
                {confirmPath === r.path ? 'Close' : 'Review & confirm'}
              </HButton>
            )}
          </div>
          {destructive && confirmPath === r.path && (
            <DestructiveConfirm item={r} onDone={() => setConfirmPath(null)} />
          )}
          </div>
        )
      })}
      {!loading && queue.length === 0 && (
        <div style={{ padding: 18, fontSize: 12.5, color: colors.muted2 }}>Nothing in the queue for this filter.</div>
      )}
      {queue.length > 10 && (
        <HButton
          onClick={() => setShowAll((v) => !v)}
          hover={{ background: colors.subtleAlt }}
          style={{ display: 'block', width: '100%', background: colors.subtle, border: 'none', borderTop: `1px solid ${colors.hair}`, padding: '9px 0', fontSize: 12, fontWeight: 550, color: colors.accent, textAlign: 'center' }}
        >
          {showAll ? 'Show top 10' : `Show all ${queue.length}`}
        </HButton>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// One post: full formatted preview + image + publish to WordPress.
// ---------------------------------------------------------------------------

function PostDetail({ postId, onBack }: { postId: string; onBack: () => void }) {
  const { showToast } = useStore()
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const [reviewerName, setReviewerName] = useState('')
  const [reviewerCredentials, setReviewerCredentials] = useState('')
  const [substantive, setSubstantive] = useState(false)

  const q = useQuery({
    queryKey: ['blog-post', siteId, postId],
    queryFn: () => api.blogGet(siteId!, postId),
    enabled: !!siteId,
  })
  const p: BlogPost | undefined = q.data
  const approved = !!p?.reviewApprovedAt

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['blog-post', siteId, postId] })
    queryClient.invalidateQueries({ queryKey: ['blog-list', siteId] })
  }
  const pickImage = useMutation({
    mutationFn: () => api.blogPickImage(siteId!, postId),
    onSuccess: () => { showToast('Featured image selected'); refresh() },
    onError: (e: Error) => showToast(e.message),
  })
  const uploadImage = useMutation({
    mutationFn: (dataUrl: string) => api.blogUploadImage(siteId!, postId, dataUrl),
    onSuccess: () => { showToast('Featured image uploaded'); refresh() },
    onError: (e: Error) => showToast(e.message),
  })
  const onFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) return showToast('Image must be under 8 MB')
    const reader = new FileReader()
    reader.onload = () => uploadImage.mutate(String(reader.result))
    reader.readAsDataURL(file)
  }
  const publish = useMutation({
    mutationFn: () => api.blogPublish(siteId!, postId, { isSubstantive: substantive }),
    onSuccess: (post) => {
      showToast(post.wpPostId ? `Published to WordPress as draft (post #${post.wpPostId})` : 'Published')
      refresh()
    },
    onError: (e: Error) => showToast(e.message),
  })
  const approve = useMutation({
    mutationFn: () =>
      api.blogApprove(siteId!, postId, {
        reviewerName: reviewerName.trim(),
        reviewerCredentials: reviewerCredentials.trim(),
      }),
    onSuccess: () => {
      showToast('Reviewer approval recorded')
      refresh()
    },
    onError: (e: Error) => showToast(e.message),
  })

  const label = { fontSize: 10.5, fontWeight: 650, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: colors.muted2 }

  return (
    <div>
      <HButton
        onClick={onBack}
        hover={{ color: colors.ink }}
        style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 550, color: colors.muted, marginBottom: 10 }}
      >
        ← All posts
      </HButton>

      {!p ? (
        <div style={{ fontSize: 12.5, color: colors.muted2 }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650, letterSpacing: '-.01em' }}>{p.title}</h1>
              <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 4 }}>
                <span style={{ fontFamily: mono }}>/{p.slug}</span> · targets “{p.targetKeyword}”
                {p.estClicks ? ` · ~${p.estClicks} clicks/mo` : ''}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', flex: 'none', display: 'flex', gap: 8 }}>
              <HButton
                onClick={() => !pickImage.isPending && pickImage.mutate()}
                hover={{ background: '#f6f6f1' }}
                style={{ background: '#fff', border: `1px solid ${colors.borderBtn}`, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 550, color: colors.ink }}
              >
                {pickImage.isPending ? 'Finding…' : p.imageUrl ? 'Swap (Pexels)' : 'Pick from Pexels'}
              </HButton>
              <label
                style={{ background: '#fff', border: `1px solid ${colors.borderBtn}`, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 550, color: colors.ink, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
              >
                {uploadImage.isPending ? 'Uploading…' : 'Upload image'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => onFile(e.target.files?.[0])}
                  style={{ display: 'none' }}
                />
              </label>
              <HButton
                onClick={() => approved && !publish.isPending && publish.mutate()}
                hover={publish.isPending || !approved ? undefined : { background: colors.inkStrong }}
                title={approved ? undefined : 'YMYL content — a named, credentialed reviewer must approve before publishing'}
                style={{
                  background: approved ? colors.ink : colors.chipBg,
                  color: approved ? '#fff' : colors.muted2,
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 13px',
                  fontSize: 12.5,
                  fontWeight: 550,
                  opacity: publish.isPending ? 0.7 : 1,
                  cursor: approved ? 'pointer' : 'not-allowed',
                }}
              >
                {publish.isPending
                  ? 'Publishing…'
                  : !approved
                    ? 'Needs reviewer approval'
                    : p.status === 'Published'
                      ? 'Re-publish draft'
                      : 'Publish to WordPress'}
              </HButton>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
            {/* The article */}
            <Card style={{ padding: '20px 24px', minWidth: 0 }}>
              {p.imageUrl && (
                <img
                  src={p.imageUrl}
                  alt={p.imageAlt ?? ''}
                  style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 8, marginBottom: 16 }}
                />
              )}
              <div className="blog-body" style={{ fontSize: 14, lineHeight: 1.7, color: colors.text }} dangerouslySetInnerHTML={{ __html: p.bodyHtml }} />

              {p.faqs.length > 0 && (
                <div style={{ marginTop: 24, borderTop: `1px solid ${colors.hair}`, paddingTop: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 10 }}>FAQ</div>
                  {p.faqs.map((f) => (
                    <div key={f.q} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.ink }}>{f.q}</div>
                      <div style={{ fontSize: 13.5, color: colors.text, marginTop: 3, lineHeight: 1.6 }}>{f.a}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* SEO meta sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* YMYL review gate — med spa content needs a named, credentialed
                  reviewer before it can publish (enforced at the data layer too). */}
              <Card style={{ padding: '16px 18px', border: approved ? undefined : `1px solid ${colors.amber}66` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Medical review (YMYL)</div>
                {approved ? (
                  <>
                    <div style={{ fontSize: 12.5, color: colors.text, marginTop: 4 }}>
                      ✓ Approved by <strong>{p.reviewerName}</strong>, {p.reviewerCredentials}
                    </div>
                    <div style={{ fontSize: 11, color: colors.muted2, marginTop: 3 }}>
                      {p.reviewApprovedAt ? new Date(p.reviewApprovedAt).toLocaleString() : ''}
                    </div>
                    {p.wpPostId != null && (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={substantive}
                          onChange={(e) => setSubstantive(e.target.checked)}
                          style={{ marginTop: 2 }}
                        />
                        <span style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>
                          This re-publish is a substantive content change (advances the last-updated
                          date). Leave unchecked for cosmetic edits — inflated freshness signals get
                          devalued.
                        </span>
                      </label>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 11.5, color: colors.muted2, marginBottom: 10, lineHeight: 1.5 }}>
                      Health content requires a named, credentialed reviewer. “Staff writer” doesn’t
                      meet the E-E-A-T bar.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        placeholder="Reviewer name (e.g. Sarah Lopez)"
                        value={reviewerName}
                        onChange={(e) => setReviewerName(e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        placeholder="Credentials (e.g. RN, NP-C)"
                        value={reviewerCredentials}
                        onChange={(e) => setReviewerCredentials(e.target.value)}
                        style={inputStyle}
                      />
                      <div>
                        <HButton
                          onClick={() =>
                            reviewerName.trim() && reviewerCredentials.trim() && !approve.isPending && approve.mutate()
                          }
                          hover={{ background: colors.inkStrong }}
                          style={{ background: colors.ink, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 550 }}
                        >
                          {approve.isPending ? 'Recording…' : 'Approve as reviewer'}
                        </HButton>
                      </div>
                    </div>
                  </>
                )}
              </Card>

              {/* Keyword cluster */}
              <Card style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Keyword cluster</div>
                <div style={{ fontSize: 11, color: colors.muted2, marginBottom: 10 }}>
                  The topical group this post is built to rank for.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: colors.accent, background: colors.accentSoftBg, borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Primary
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>
                    {p.keywordCluster.primary ?? p.targetKeyword}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(p.keywordCluster.supporting ?? []).map((s) => (
                    <div key={s.keyword} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ flex: 1, fontSize: 12.5, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.keyword}
                      </span>
                      {s.monthlyImpressions != null && (
                        <span style={{ flex: 'none', fontSize: 11, color: colors.muted2 }}>
                          {s.monthlyImpressions.toLocaleString()} impr/mo
                        </span>
                      )}
                    </div>
                  ))}
                  {(p.keywordCluster.supporting ?? []).length === 0 && (
                    <div style={{ fontSize: 12, color: colors.muted2 }}>Single-keyword focus.</div>
                  )}
                </div>
              </Card>

              <Card style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>SEO metadata</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ ...label, display: 'flex', gap: 8 }}>
                      TITLE TAG <span style={{ color: colors.faint, letterSpacing: 0 }}>{p.metaTitle.length} chars</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: colors.ink, marginTop: 3, lineHeight: 1.45 }}>{p.metaTitle}</div>
                  </div>
                  <div>
                    <div style={{ ...label, display: 'flex', gap: 8 }}>
                      META DESCRIPTION <span style={{ color: colors.faint, letterSpacing: 0 }}>{p.metaDescription.length} chars</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: colors.text, marginTop: 3, lineHeight: 1.5 }}>{p.metaDescription}</div>
                  </div>
                  <div>
                    <div style={label}>CATEGORIES</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                      {p.categories.map((c) => (
                        <span key={c} style={{ fontSize: 11.5, color: colors.muted, background: colors.chipBg, borderRadius: 99, padding: '2px 9px' }}>{c}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              <Card style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Internal link strategy</div>
                <div style={{ fontSize: 11, color: colors.muted2, marginBottom: 12 }}>
                  Hub-and-spoke links to build topical authority.
                </div>

                <div style={{ fontSize: 11, fontWeight: 650, color: colors.muted2, letterSpacing: '.04em', marginBottom: 7 }}>
                  FROM THIS POST →
                </div>
                {p.internalLinks.map((l) => (
                  <div key={l.path} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12.5, marginBottom: 6 }}>
                    <span style={{ color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>“{l.anchor}”</span>
                    <span style={{ color: colors.faint }}>→</span>
                    <span style={{ fontFamily: mono, color: colors.muted, flex: 'none' }}>{l.path}</span>
                  </div>
                ))}
                {p.internalLinks.length === 0 && (
                  <div style={{ fontSize: 12, color: colors.muted2, marginBottom: 6 }}>None suggested.</div>
                )}

                <div style={{ fontSize: 11, fontWeight: 650, color: colors.muted2, letterSpacing: '.04em', margin: '12px 0 7px' }}>
                  ADD LINKS POINTING HERE ←
                </div>
                {p.inboundLinks.map((l) => (
                  <div key={l.path} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12.5, marginBottom: 6 }}>
                    <span style={{ fontFamily: mono, color: colors.muted, flex: 'none' }}>{l.path}</span>
                    <span style={{ color: colors.faint }}>→</span>
                    <span style={{ color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>“{l.anchor}”</span>
                  </div>
                ))}
                {p.inboundLinks.length === 0 && (
                  <div style={{ fontSize: 12, color: colors.muted2 }}>None suggested.</div>
                )}
              </Card>

              <Card style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Featured image</div>
                {p.imageUrl ? (
                  <div style={{ fontSize: 12, color: colors.muted2, lineHeight: 1.5 }}>
                    Selected · alt “{p.imageAlt}”{p.imageCredit ? ` · ${p.imageCredit}` : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: colors.muted2, lineHeight: 1.5 }}>
                    Not set. Suggested search: <span style={{ fontFamily: mono, color: colors.text }}>{p.imageQuery}</span>. Hit “Pick image”.
                  </div>
                )}
              </Card>

              {p.wpEditUrl && (
                <a href={p.wpEditUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: colors.accent, fontWeight: 550, textDecoration: 'none' }}>
                  Open the draft in WordPress ↗
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
