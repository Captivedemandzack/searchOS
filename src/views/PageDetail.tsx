import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useData, useSiteId } from '../data/DataProvider'
import { expectedStat, useOpportunities } from '../selectors'
import { useStore } from '../store'
import { colors, mono, th } from '../theme'
import { Card } from '../components/primitives'
import { HButton, HDiv } from '../lib/Hover'
import { api, type PageIndexRow, type PageInsights } from '../lib/api'
import { openActForOpportunity } from '../lib/workflow'

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(Math.round(n))
}

/** Traffic movement vs the prior 28 days; null when there's no prior baseline. */
function trendPct(clicks: number, prevClicks: number | null): number | null {
  if (prevClicks == null || prevClicks < 10) return null
  return ((clicks - prevClicks) / prevClicks) * 100
}

type Health = 'Losing' | 'Growing' | 'No traffic' | 'Steady'
function health(r: PageIndexRow): Health {
  if (r.impressions === 0 && r.clicks === 0) return 'No traffic'
  const t = trendPct(r.clicks, r.prevClicks)
  if (t != null && t <= -15) return 'Losing'
  if (t != null && t >= 15) return 'Growing'
  return 'Steady'
}

const eyebrow = {
  fontSize: 11,
  fontWeight: 650,
  letterSpacing: '.06em',
  textTransform: 'uppercase' as const,
  color: colors.muted2,
}

export function PageDetailView() {
  const { state } = useStore()
  return state.selectedPage ? <PageInsightsView path={state.selectedPage} /> : <PagesList />
}

// ---------------------------------------------------------------------------
// Level 1 — the whole site: every page with its real search performance.
// ---------------------------------------------------------------------------

const listCols = 'minmax(0,2.2fr) 90px 90px 90px 70px 60px'

function PagesList() {
  const { state, setState } = useStore()
  const { sites } = useData()
  const siteId = useSiteId()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'All' | 'page' | 'post'>('All')
  const [healthFilter, setHealthFilter] = useState<'All' | Health>('All')

  const index = useQuery({
    queryKey: ['pages-index', siteId],
    queryFn: () => api.pagesIndex(siteId!),
    enabled: !!siteId,
    staleTime: 5 * 60_000,
  })

  const all = index.data ?? []
  const q = search.trim().toLowerCase()
  const rows = all.filter(
    (r) =>
      (typeFilter === 'All' || r.type === typeFilter) &&
      (healthFilter === 'All' || health(r) === healthFilter) &&
      (!q || r.path.toLowerCase().includes(q) || (r.title ?? '').toLowerCase().includes(q)),
  )

  const pageCount = all.filter((r) => r.type === 'page').length
  const postCount = all.filter((r) => r.type === 'post').length
  const typeTabs: { key: 'All' | 'page' | 'post'; label: string }[] = [
    { key: 'All', label: `All ${all.length}` },
    { key: 'page', label: `Pages ${pageCount}` },
    { key: 'post', label: `Posts ${postCount}` },
  ]
  const tabs: ('All' | Health)[] = ['All', 'Losing', 'Growing', 'No traffic']

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 6px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Pages</h1>
        <span style={{ fontSize: 12.5, color: colors.muted2 }}>
          {rows.length} of {all.length} · {sites[state.siteIdx]?.domain} · last 28 days
        </span>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: colors.muted }}>
        Every page Google shows for this site, ranked by organic clicks. Click a page for its full
        diagnosis.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="Search pages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: `1px solid ${colors.borderInput}`,
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12.5,
            background: '#fff',
            color: colors.text,
            width: 220,
          }}
        />
        {/* Primary split: WordPress content type */}
        <div style={{ display: 'flex', gap: 3, background: colors.chipBg, borderRadius: 8, padding: 3 }}>
          {typeTabs.map((t) => {
            const active = typeFilter === t.key
            return (
              <HButton
                key={t.key}
                onClick={() => setTypeFilter(t.key)}
                hover={active ? undefined : { color: colors.ink }}
                style={{
                  background: active ? '#fff' : 'none',
                  border: 'none',
                  borderRadius: 6,
                  padding: '3px 10px',
                  fontSize: 11.5,
                  fontWeight: active ? 650 : 500,
                  color: active ? colors.ink : colors.muted,
                  boxShadow: active ? '0 1px 2px rgba(20,20,17,.06)' : 'none',
                }}
              >
                {t.label}
              </HButton>
            )
          })}
        </div>
        <div style={{ width: 1, height: 20, background: colors.border }} />
        {/* Secondary: search health */}
        <div style={{ display: 'flex', gap: 3, background: colors.chipBg, borderRadius: 8, padding: 3 }}>
          {tabs.map((t) => {
            const active = healthFilter === t
            return (
              <HButton
                key={t}
                onClick={() => setHealthFilter(t)}
                hover={active ? undefined : { color: colors.ink }}
                style={{
                  background: active ? '#fff' : 'none',
                  border: 'none',
                  borderRadius: 6,
                  padding: '3px 9px',
                  fontSize: 11.5,
                  fontWeight: active ? 650 : 500,
                  color: active ? colors.ink : colors.muted,
                  boxShadow: active ? '0 1px 2px rgba(20,20,17,.06)' : 'none',
                }}
              >
                {t}
              </HButton>
            )
          })}
        </div>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: listCols,
            gap: 12,
            alignItems: 'center',
            padding: '9px 18px',
            borderBottom: `1px solid ${colors.hair}`,
            background: colors.subtle,
          }}
        >
          <span style={th}>Page</span>
          <span style={{ ...th, textAlign: 'right' }}>Clicks</span>
          <span style={{ ...th, textAlign: 'right' }}>Trend</span>
          <span style={{ ...th, textAlign: 'right' }}>Impr.</span>
          <span style={{ ...th, textAlign: 'right' }}>Pos.</span>
          <span style={{ ...th, textAlign: 'right' }}>Opps</span>
        </div>

        {index.isLoading && (
          <div style={{ padding: 24, fontSize: 12.5, color: colors.muted2 }}>Loading pages…</div>
        )}
        {index.isError && (
          <div style={{ padding: 24, fontSize: 12.5, color: colors.red }}>
            Couldn't load pages — is the API running?
          </div>
        )}

        {rows.map((r) => {
          const h = health(r)
          const t = trendPct(r.clicks, r.prevClicks)
          return (
            <HDiv
              key={r.path}
              onClick={() => setState({ selectedPage: r.path })}
              hover={{ background: colors.subtleAlt }}
              style={{
                display: 'grid',
                gridTemplateColumns: listCols,
                gap: 12,
                alignItems: 'center',
                padding: '10px 18px',
                borderBottom: `1px solid ${colors.hair2}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {r.title ?? r.path}
                  </span>
                  {h === 'Losing' && (
                    <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 650, color: colors.red, background: colors.redBg, borderRadius: 99, padding: '1px 7px' }}>
                      Losing
                    </span>
                  )}
                  {h === 'Growing' && (
                    <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 650, color: colors.green, background: colors.greenBg, borderRadius: 99, padding: '1px 7px' }}>
                      Growing
                    </span>
                  )}
                  {h === 'No traffic' && (
                    <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 650, color: colors.muted, background: colors.chipBg, borderRadius: 99, padding: '1px 7px' }}>
                      No traffic
                    </span>
                  )}
                </div>
                {r.title && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: colors.muted2,
                      fontFamily: mono,
                      marginTop: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {r.path}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 13, fontWeight: 650, textAlign: 'right' }}>
                {r.clicks.toLocaleString()}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 650,
                  textAlign: 'right',
                  color: t == null ? colors.faint : t < 0 ? colors.red : colors.green,
                }}
              >
                {t == null ? '—' : `${t > 0 ? '+' : '−'}${Math.abs(t).toFixed(0)}%`}
              </span>
              <span style={{ fontSize: 12, color: colors.text, textAlign: 'right' }}>
                {fmtCompact(r.impressions)}
              </span>
              <span style={{ fontSize: 12, color: colors.text, textAlign: 'right' }}>
                {r.position != null ? r.position.toFixed(1) : '—'}
              </span>
              <span style={{ textAlign: 'right' }}>
                {r.oppCount > 0 ? (
                  <span style={{ fontSize: 11, fontWeight: 650, color: colors.accent, background: colors.accentSoftBg, borderRadius: 99, padding: '1px 7px' }}>
                    {r.oppCount}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: colors.faint }}>—</span>
                )}
              </span>
            </HDiv>
          )
        })}

        {index.isSuccess && rows.length === 0 && (
          <div style={{ padding: 28, textAlign: 'center', fontSize: 12.5, color: colors.muted2 }}>
            No pages match — clear the search or filter.
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Level 2 — one page: what's happening, why, what to do, what to expect.
// ---------------------------------------------------------------------------

function PageInsightsView({ path }: { path: string }) {
  const { setState, nav } = useStore()
  const siteId = useSiteId()
  const { withStatus, mkOpp } = useOpportunities()

  const ins = useQuery({
    queryKey: ['page-insights', siteId, path],
    queryFn: () => api.pageInsights(siteId!, path),
    enabled: !!siteId,
    staleTime: 5 * 60_000,
  })
  const d: PageInsights | undefined = ins.data

  // Live opportunities for this page (status + generate come from the store).
  const pageOpps = withStatus.filter((o) => o.page.split(' ')[0] === path).map(mkOpp)

  const t = d ? trendPct(d.stats.clicks, d.stats.prevClicks) : null

  return (
    <div>
      <HButton
        onClick={() => setState({ selectedPage: null })}
        hover={{ color: colors.ink }}
        style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 550, color: colors.muted, marginBottom: 10 }}
      >
        ← All pages
      </HButton>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, margin: '0 0 16px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>
              {d?.page?.title ?? path}
            </h1>
            {t != null && t <= -15 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.red, background: colors.redBg, borderRadius: 99, padding: '2px 9px' }}>
                Losing traffic
              </span>
            )}
            {t != null && t >= 15 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.green, background: colors.greenBg, borderRadius: 99, padding: '2px 9px' }}>
                Growing
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
            <span style={{ fontFamily: mono }}>{path}</span>
            {d?.page?.hasElementor && ' · Elementor page'}
            {d && !d.page && ' · not matched to a synced WordPress page'}
          </div>
        </div>
        {d && (
          <a
            href={d.liveUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              marginLeft: 'auto',
              flex: 'none',
              background: '#fff',
              border: `1px solid ${colors.borderBtn}`,
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 12.5,
              fontWeight: 550,
              color: colors.ink,
              textDecoration: 'none',
            }}
          >
            View live page ↗
          </a>
        )}
      </div>

      {ins.isLoading && <div style={{ fontSize: 12.5, color: colors.muted2 }}>Loading page data…</div>}
      {ins.isError && (
        <div style={{ fontSize: 12.5, color: colors.red }}>Couldn't load page data — is the API running?</div>
      )}
      {!d ? null : (
        <>
          {/* Real 28-day performance */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
            <StatCard
              label="Clicks · 28d"
              value={d.stats.clicks.toLocaleString()}
              note={fmtDeltaPct(d.stats.clicks, d.stats.prevClicks)}
            />
            <StatCard
              label="Impressions · 28d"
              value={fmtCompact(d.stats.impressions)}
              note={fmtDeltaPct(d.stats.impressions, d.stats.prevImpressions)}
            />
            <StatCard
              label="Avg. position"
              value={d.stats.position != null ? d.stats.position.toFixed(1) : '—'}
              note={fmtPosDelta(d.stats.position, d.stats.prevPosition)}
            />
            <StatCard
              label="CTR"
              value={`${(d.stats.ctr * 100).toFixed(1)}%`}
              note={
                d.stats.expectedCtr != null
                  ? {
                      text: `position expects ~${(d.stats.expectedCtr * 100).toFixed(1)}%`,
                      color: d.stats.ctr < d.stats.expectedCtr * 0.7 ? colors.red : colors.muted2,
                    }
                  : null
              }
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
            {/* LEFT: what the data says */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <div style={eyebrow}>Diagnosis — what the data says</div>

              <TrendCard daily={d.daily} />

              <Card>
                <div style={{ fontSize: 13, fontWeight: 600, padding: '14px 18px', borderBottom: `1px solid ${colors.hair}` }}>
                  Top queries · Search Console
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1.5fr) 58px 56px 52px 46px 80px',
                    gap: 10,
                    padding: '8px 18px',
                    borderBottom: `1px solid ${colors.hair2}`,
                    background: colors.subtle,
                  }}
                >
                  <span style={th}>Query</span>
                  <span style={{ ...th, textAlign: 'right' }}>Impr.</span>
                  <span style={{ ...th, textAlign: 'right' }}>Clicks</span>
                  <span style={{ ...th, textAlign: 'right' }}>CTR</span>
                  <span style={{ ...th, textAlign: 'right' }}>Pos.</span>
                  <span style={{ ...th, textAlign: 'right' }}>CTR gap</span>
                </div>
                {d.queries.map((q) => {
                  const bad = q.impressions >= 100 && q.gap < 0 && q.ctr < (q.ctr - q.gap) * 0.7
                  return (
                    <div
                      key={q.query}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0,1.5fr) 58px 56px 52px 46px 80px',
                        gap: 10,
                        padding: '8px 18px',
                        borderBottom: `1px solid ${colors.hair3}`,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12.5, color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {q.query}
                      </span>
                      <span style={{ fontSize: 12, color: colors.text, textAlign: 'right' }}>{fmtCompact(q.impressions)}</span>
                      <span style={{ fontSize: 12, color: colors.text, textAlign: 'right' }}>{fmtCompact(q.clicks)}</span>
                      <span style={{ fontSize: 12, color: colors.text, textAlign: 'right' }}>{(q.ctr * 100).toFixed(1)}%</span>
                      <span style={{ fontSize: 12, color: colors.text, textAlign: 'right' }}>{q.position.toFixed(1)}</span>
                      <span style={{ textAlign: 'right' }}>
                        {bad ? (
                          <span style={{ fontSize: 11, fontWeight: 650, color: colors.red, background: colors.redBg, borderRadius: 999, padding: '2px 8px' }}>
                            {(q.gap * 100).toFixed(1)} pts
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: colors.muted2 }}>in range</span>
                        )}
                      </span>
                    </div>
                  )
                })}
                {d.queries.length === 0 && (
                  <div style={{ padding: 18, fontSize: 12, color: colors.muted2 }}>
                    No query-level data for this page in the synced window.
                  </div>
                )}
              </Card>

            </div>

            {/* RIGHT: what to do about it */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <div style={eyebrow}>Action — what to do about it</div>

              <Card>
                <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${colors.hair}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Open opportunities</div>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: colors.muted2 }}>
                    {pageOpps.length} for this page
                  </span>
                </div>
                {pageOpps.map((o) => {
                  const stat = expectedStat(o.expected)
                  return (
                    <div
                      key={o.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: `1px solid ${colors.hair3}` }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.title}
                        </div>
                        <div style={{ fontSize: 11, color: colors.muted2, marginTop: 1 }}>
                          {o.type} · {o.effort} effort
                        </div>
                      </div>
                      {stat && (
                        <div style={{ flex: 'none', textAlign: 'right' }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: stat.positive ? colors.green : colors.ink, lineHeight: 1.1 }}>
                            {stat.value}
                          </div>
                          <div style={{ fontSize: 10, color: colors.muted2 }}>clicks / mo</div>
                        </div>
                      )}
                      <HButton
                        onClick={() => openActForOpportunity(o.id, { category: o.type, page: o.page }, { nav, setState })}
                        hover={{ background: '#f6f6f1' }}
                        style={{ flex: 'none', background: '#fff', border: `1px solid ${colors.borderBtn}`, borderRadius: 7, padding: '4px 9px', fontSize: 11, fontWeight: 550, color: colors.ink }}
                      >
                        {o.inReview ? 'View draft →' : 'Open →'}
                      </HButton>
                    </div>
                  )
                })}
                {pageOpps.length === 0 && (
                  <div style={{ padding: 18, fontSize: 12, color: colors.muted2 }}>
                    Nothing flagged for this page right now — it either ranks well or lacks the search
                    volume to prioritize.
                  </div>
                )}
              </Card>

              {d.page && (
                <Card style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Current metadata</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 650, color: colors.muted2 }}>TITLE TAG</span>
                        {d.page.metaTitle && (
                          <span style={{ fontSize: 11, color: colors.faint }}>{d.page.metaTitle.length} chars</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: colors.ink, marginTop: 2, lineHeight: 1.45 }}>
                        {d.page.metaTitle ?? d.page.title ?? '(none set)'}
                      </div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 650, color: colors.muted2 }}>META DESCRIPTION</span>
                        {d.page.metaDesc && (
                          <span style={{ fontSize: 11, color: colors.faint }}>{d.page.metaDesc.length} chars</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: colors.text, marginTop: 2, lineHeight: 1.5 }}>
                        {d.page.metaDesc ?? '(none set)'}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              <StructureCard structure={d.structure} headings={d.headings} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---- Small pieces -----------------------------------------------------------

function fmtDeltaPct(cur: number, prev: number | null): { text: string; color: string } | null {
  if (prev == null || prev <= 0) return { text: 'no prior period', color: colors.faint }
  const pct = ((cur - prev) / prev) * 100
  return {
    text: `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}% vs prior 28d`,
    color: pct >= 0 ? colors.green : colors.red,
  }
}

function fmtPosDelta(cur: number | null, prev: number | null): { text: string; color: string } | null {
  if (cur == null || prev == null) return { text: 'no prior period', color: colors.faint }
  const diff = cur - prev // lower is better
  if (Math.abs(diff) < 0.05) return { text: 'unchanged', color: colors.muted2 }
  return {
    text: `${diff < 0 ? '↑ from' : '↓ from'} ${prev.toFixed(1)}`,
    color: diff < 0 ? colors.green : colors.red,
  }
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: { text: string; color: string } | null
}) {
  return (
    <Card style={{ padding: '13px 16px' }}>
      <div style={{ fontSize: 11, color: colors.muted2 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 650, letterSpacing: '-.02em', marginTop: 2 }}>{value}</div>
      {note && <div style={{ fontSize: 11.5, fontWeight: 600, color: note.color, marginTop: 2 }}>{note.text}</div>}
    </Card>
  )
}

/** Small "i" badge with an instant custom hover tooltip (native title is
 *  unreliable / delayed inside app webviews). */
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', marginLeft: 'auto', display: 'inline-flex' }}
    >
      <span
        style={{
          width: 15,
          height: 15,
          borderRadius: 99,
          border: `1px solid ${colors.borderBtn}`,
          color: colors.muted2,
          fontSize: 9.5,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'help',
        }}
      >
        i
      </span>
      {show && (
        <span
          style={{
            position: 'absolute',
            top: 22,
            right: 0,
            width: 236,
            zIndex: 30,
            background: colors.ink,
            color: '#fff',
            fontSize: 11.5,
            fontWeight: 400,
            lineHeight: 1.5,
            borderRadius: 8,
            padding: '8px 10px',
            boxShadow: '0 6px 18px rgba(20,20,17,.2)',
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}

/**
 * Structure diagnostic — turns the raw heading outline into judgments:
 * H1 health, then the real searches no heading addresses (the actionable part),
 * with the outline kept as supporting detail.
 */
function StructureCard({
  structure,
  headings,
}: {
  structure: PageInsights['structure']
  headings: PageInsights['headings']
}) {
  const [showOutline, setShowOutline] = useState(false)
  if (headings.length === 0) {
    return (
      <Card style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Page structure</div>
        <div style={{ fontSize: 12, color: colors.muted2, lineHeight: 1.5 }}>
          No headings found in the synced content — the page may render headings as styled text
          (not real H1/H2 tags), which Google can't read as structure.
        </div>
      </Card>
    )
  }

  const h1Ok = structure.h1Count === 1
  const check = (ok: boolean, good: string, bad: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          flex: 'none',
          width: 16,
          height: 16,
          borderRadius: 99,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: ok ? colors.green : colors.red,
          background: ok ? colors.greenBg : colors.redBg,
        }}
      >
        {ok ? '✓' : '!'}
      </span>
      <span style={{ fontSize: 12.5, color: colors.text }}>{ok ? good : bad}</span>
    </div>
  )

  return (
    <Card style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Page structure</div>
        <InfoTip text="Add a section (H2) that directly answers each uncovered search — it’s likely why CTR trails the benchmark despite the ranking." />
      </div>

      {/* Checks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {check(
          h1Ok,
          `One H1 — "${structure.h1Text ?? ''}"`,
          structure.h1Count === 0 ? 'No H1 heading found' : `${structure.h1Count} H1 headings (should be exactly one)`,
        )}
        {check(
          structure.uncovered.length === 0,
          'Headings cover the page’s top searches',
          `${structure.uncovered.length} high-volume ${structure.uncovered.length === 1 ? 'search isn’t' : 'searches aren’t'} addressed by any heading`,
        )}
      </div>

      {/* The actionable gap: demand with no matching heading */}
      {structure.uncovered.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 650, color: colors.muted2, letterSpacing: '.04em', marginBottom: 7 }}>
            SEARCHES NO HEADING ADDRESSES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {structure.uncovered.map((u) => (
              <div key={u.query} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12.5,
                    color: colors.ink,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {u.query}
                  <span style={{ color: colors.muted2 }}> · missing “{u.missing.join(', ')}”</span>
                </span>
                <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 600, color: colors.amber }}>
                  {fmtCompact(u.impressions)} impr
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The outline itself — supporting detail, collapsed by default */}
      <HButton
        onClick={() => setShowOutline((v) => !v)}
        hover={{ color: colors.ink }}
        style={{ background: 'none', border: 'none', padding: 0, marginTop: 14, fontSize: 11.5, fontWeight: 550, color: colors.accent }}
      >
        {showOutline ? 'Hide outline' : `Show heading outline (${structure.headingCount})`}
      </HButton>
      {showOutline && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, fontFamily: mono, fontSize: 12 }}>
          {headings.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: h.tag === 'H1' ? 0 : h.tag === 'H2' ? 14 : 28 }}>
              <span style={{ color: colors.muted2, width: 26, flex: 'none' }}>{h.tag}</span>
              <span style={{ color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {h.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** 90-day clicks + position monitor — where you watch a published change land. */
function TrendCard({ daily }: { daily: PageInsights['daily'] }) {
  const W = 560
  const H = 84
  const hasData = daily.some((d) => d.clicks > 0 || d.position != null)

  const maxClicks = Math.max(1, ...daily.map((d) => d.clicks))
  const clickPts = daily
    .map((d, i) => `${((i / (daily.length - 1)) * W).toFixed(1)},${(H - 8 - (d.clicks / maxClicks) * (H - 16)).toFixed(1)}`)
    .join(' ')

  const posVals = daily.filter((d) => d.position != null).map((d) => d.position!)
  const posMin = Math.min(...posVals)
  const posMax = Math.max(...posVals)
  const posPts = daily
    .map((d, i) => {
      if (d.position == null) return null
      const norm = posMax > posMin ? (d.position - posMin) / (posMax - posMin) : 0.5
      // Inverted: better (lower) position plots higher.
      return `${((i / (daily.length - 1)) * W).toFixed(1)},${(8 + norm * (H - 16)).toFixed(1)}`
    })
    .filter(Boolean)
    .join(' ')

  const first = daily[0]?.date
  const last = daily[daily.length - 1]?.date
  const fmtD = (s?: string) => (s ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(s.slice(5,7))-1]} ${Number(s.slice(8,10))}` : '')

  return (
    <Card style={{ padding: '14px 18px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>90-day monitor</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11, color: colors.muted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 2, background: colors.accent, borderRadius: 2 }} /> Clicks / day
          </span>
          {posVals.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 2, background: colors.amber, borderRadius: 2 }} /> Position ({posMin.toFixed(0)}–{posMax.toFixed(0)})
            </span>
          )}
        </div>
      </div>
      {hasData ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#f0f0ea" strokeWidth="1" />
            {posPts && <polyline points={posPts} fill="none" stroke={colors.amber} strokeWidth="1.3" opacity="0.75" />}
            <polyline points={clickPts} fill="none" stroke={colors.accent} strokeWidth="1.8" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: colors.faint, padding: '5px 2px 2px' }}>
            <span>{fmtD(first)}</span>
            <span>{fmtD(last)}</span>
          </div>
        </>
      ) : (
        <div style={{ padding: '18px 0 14px', fontSize: 12, color: colors.muted2 }}>
          No search data for this page in the last 90 days.
        </div>
      )}
    </Card>
  )
}
