import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useData, useDataStatus, useSiteId } from '../data/DataProvider'
import { useStore } from '../store'
import { openOpportunity } from '../lib/workflow'
import { colors, mono, pill, th } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'
import { api, type CompetitorScan } from '../lib/api'

const gapCols = 'minmax(0,1.4fr) 64px 66px 56px 64px 80px 150px'

const inputStyle = {
  border: `1px solid ${colors.borderInput}`,
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 12.5,
  color: colors.text,
  background: '#fff',
  width: '100%',
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Real Phase 5 module: paste competitor URLs, let Claude study the gap. */
function CompetitorAnalyzer() {
  const siteId = useSiteId()
  const { showToast } = useStore()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [urls, setUrls] = useState('')
  const [ourPath, setOurPath] = useState('')

  const scansQuery = useQuery({
    queryKey: ['competitor-scans', siteId],
    queryFn: () => api.competitorScans(siteId!),
    enabled: !!siteId,
  })

  const analyze = useMutation({
    mutationFn: () =>
      api.analyzeCompetitors(siteId!, {
        targetKeyword: keyword.trim(),
        urls: urls.split('\n').map((u) => u.trim()).filter(Boolean),
        ourPath: ourPath.trim() || undefined,
      }),
    onSuccess: (scan) => {
      showToast(
        `Analyzed ${scan.fetched ?? scan.urls.length} competitor page(s)` +
          (scan.failures?.length ? ` · ${scan.failures.length} failed to fetch` : ''),
      )
      queryClient.invalidateQueries({ queryKey: ['competitor-scans', siteId] })
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      queryClient.invalidateQueries({ queryKey: ['audit-queue', siteId] })
    },
    onError: (err: Error) => showToast(err.message),
  })

  const latest: CompetitorScan | undefined = scansQuery.data?.[0]
  const canRun = keyword.trim() && urls.trim() && !analyze.isPending

  return (
    <Card style={{ padding: '16px 18px', marginBottom: 16, maxWidth: 980 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Analyze competitors with AI</div>
      <div style={{ fontSize: 11.5, color: colors.muted2, marginBottom: 12, lineHeight: 1.5 }}>
        Paste the URLs ranking for a keyword you want. Claude fetches them and reports the concrete gaps
        your page must close.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <input
          placeholder="Target keyword (e.g. botox nashville)"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Your page path (optional, e.g. /botox-nashville)"
          value={ourPath}
          onChange={(e) => setOurPath(e.target.value)}
          style={inputStyle}
        />
      </div>
      <textarea
        placeholder={'Competitor URLs — one per line (up to 5)\nhttps://competitor.com/botox'}
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        style={{ ...inputStyle, minHeight: 74, resize: 'vertical', fontFamily: mono, fontSize: 12 }}
      />
      <div style={{ marginTop: 10 }}>
        <HButton
          onClick={() => canRun && analyze.mutate()}
          hover={{ background: colors.inkStrong }}
          style={{
            background: colors.ink,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 15px',
            fontSize: 12.5,
            fontWeight: 550,
            opacity: canRun ? 1 : 0.5,
          }}
        >
          {analyze.isPending ? 'Analyzing…' : 'Analyze gap'}
        </HButton>
      </div>

      {latest && (
        <div style={{ marginTop: 18, borderTop: `1px solid ${colors.hair}`, paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>"{latest.targetKeyword}"</div>
            <span style={{ fontSize: 11, color: colors.muted2 }}>{latest.urls.length} competitors analyzed</span>
          </div>
          <div style={{ fontSize: 12.5, color: colors.text, lineHeight: 1.6, marginBottom: 14 }}>
            {latest.findings.summary}
          </div>

          <div style={{ fontSize: 11.5, fontWeight: 650, color: colors.muted2, marginBottom: 8 }}>GAPS TO CLOSE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {latest.findings.gaps.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span
                  style={
                    g.priority === 'High'
                      ? pill(colors.green, colors.greenBg)
                      : g.priority === 'Medium'
                        ? pill(colors.amber, colors.amberBg)
                        : pill(colors.muted, colors.chipBg)
                  }
                >
                  {g.priority}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink }}>{g.title}</div>
                  <div style={{ fontSize: 12, color: colors.muted2, lineHeight: 1.5 }}>{g.detail}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11.5, fontWeight: 650, color: colors.muted2, marginBottom: 8 }}>
            RECOMMENDED SECTIONS
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {latest.findings.recommendedSections.map((s, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11.5,
                  color: colors.text,
                  background: colors.chipBg,
                  borderRadius: 6,
                  padding: '4px 9px',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

export function CompetitorsView() {
  const { nav, setState } = useStore()
  const siteId = useSiteId()
  const { findings } = useData()
  const status = useDataStatus()

  const scansQuery = useQuery({
    queryKey: ['competitor-scans', siteId],
    queryFn: () => api.competitorScans(siteId!),
    enabled: !!siteId,
  })

  const gapFindings = findings.filter((f) => f.auditId === 'competitor-gap')

  const competitorCards = useMemo(() => {
    const domains = new Map<string, { urls: Set<string>; keywords: Set<string>; gaps: number }>()
    for (const scan of scansQuery.data ?? []) {
      for (const url of scan.urls) {
        const domain = domainFromUrl(url)
        const entry = domains.get(domain) ?? { urls: new Set(), keywords: new Set(), gaps: 0 }
        entry.urls.add(url)
        entry.keywords.add(scan.targetKeyword)
        entry.gaps += scan.findings.gaps?.length ?? 0
        domains.set(domain, entry)
      }
    }
    return [...domains.entries()].slice(0, 4).map(([domain, d]) => ({
      domain,
      name: domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      overlap: d.keywords.size,
      gaps: d.gaps,
    }))
  }, [scansQuery.data])

  const kwGaps = gapFindings
    .filter((f) => f.subject.type === 'query')
    .slice(0, 12)
    .map((f) => ({
      kw: f.subject.label,
      vol: '—',
      comp: '—',
      us: f.actions[0]?.kind === 'blog_post' ? '—' : 'Page',
      diff: f.effort === 'Low' ? 'Low' : f.effort === 'High' ? 'High' : 'Med',
      value: f.estMonthlyClicks > 0 ? `+${f.estMonthlyClicks}/mo` : '—',
      action: 'Act',
      findingId: f.id,
      bad: f.actions[0]?.kind === 'blog_post',
    }))

  const contentGapCards = gapFindings
    .filter((f) => f.title.startsWith('Add section:'))
    .slice(0, 4)
    .map((f) => ({
      title: f.title.replace(/^Add section:\s*/, ''),
      why: f.evidence[0]?.detail ?? `Gap from competitor analysis for "${f.subject.label}"`,
      diff: f.effort === 'Low' ? 18 : 28,
      value: f.estMonthlyClicks > 0 ? `+${f.estMonthlyClicks}/mo` : '—',
      priority: f.impact,
      findingId: f.id,
    }))

  const serpFeatures = gapFindings.length
    ? [
        { label: 'Competitor content gaps', count: `${gapFindings.length} findings` },
        { label: 'High-priority gaps', count: `${gapFindings.filter((f) => f.impact === 'High').length} items` },
        { label: 'Scans on file', count: `${scansQuery.data?.length ?? 0} keywords` },
      ]
    : []

  return (
    <div>
      <div style={{ margin: '2px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>
          Competitor intelligence
        </h1>
        <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
          {status === 'live'
            ? 'Run AI competitor scans — gaps flow into Audit and the tables below.'
            : 'Connect data sources to enable competitor gap tracking.'}
        </div>
      </div>

      <CompetitorAnalyzer />

      {competitorCards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
          {competitorCards.map((c) => (
            <Card key={c.domain} style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: colors.muted2, fontFamily: mono, marginTop: 1 }}>
                {c.domain}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: colors.muted2 }}>Keywords tracked</div>
                  <div style={{ fontSize: 14, fontWeight: 650 }}>{c.overlap}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: colors.muted2 }}>Gaps found</div>
                  <div style={{ fontSize: 14, fontWeight: 650, color: colors.amber }}>{c.gaps}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, alignItems: 'start' }}>
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, padding: '14px 18px', borderBottom: `1px solid ${colors.hair}` }}>
            Keyword gap
          </div>
          {kwGaps.length === 0 ? (
            <div style={{ padding: 24, fontSize: 12.5, color: colors.muted2, textAlign: 'center' }}>
              Run a competitor analysis above — gaps will appear here and in Audit.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: gapCols,
                  gap: 10,
                  padding: '8px 18px',
                  borderBottom: `1px solid ${colors.hair2}`,
                  background: colors.subtle,
                }}
              >
                <span style={th}>Keyword</span>
                <span style={th}>Volume</span>
                <span style={th}>Best comp.</span>
                <span style={th}>Us</span>
                <span style={th}>Difficulty</span>
                <span style={th}>Est. value</span>
                <span style={th}>Action</span>
              </div>
              {kwGaps.map((k) => (
                <div
                  key={k.findingId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: gapCols,
                    gap: 10,
                    padding: '10px 18px',
                    borderBottom: `1px solid ${colors.hair3}`,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 12.5, color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {k.kw}
                  </span>
                  <span style={{ fontSize: 12, color: colors.text }}>{k.vol}</span>
                  <span style={{ fontSize: 12, color: colors.text }}>{k.comp}</span>
                  <span style={k.bad ? { fontSize: 12, fontWeight: 650, color: colors.red } : { fontSize: 12, color: colors.text }}>
                    {k.us}
                  </span>
                  <span style={{ fontSize: 12, color: colors.text }}>{k.diff}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: colors.green }}>{k.value}</span>
                  <HButton
                    onClick={() => {
                      openOpportunity(
                        {
                          id: `finding:${k.findingId}`,
                          kind: 'finding',
                          findingId: k.findingId,
                          title: k.kw,
                          context: k.kw,
                          category: 'New content',
                          source: 'Competitor',
                          effort: 'Medium',
                          impact: 'High',
                          estMonthlyClicks: 0,
                          priorityValue: 0,
                          status: 'open',
                          action: 'act',
                          actionLabel: k.action,
                        },
                        { nav, setState },
                      )
                    }}
                    hover={{ background: '#f6f6f1' }}
                    style={{
                      background: '#fff',
                      border: `1px solid ${colors.borderBtn}`,
                      borderRadius: 7,
                      padding: '4px 9px',
                      fontSize: 11,
                      fontWeight: 550,
                      color: colors.ink,
                      justifySelf: 'start',
                    }}
                  >
                    {k.action}
                  </HButton>
                </div>
              ))}
            </>
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Pages to create</div>
            {contentGapCards.length === 0 ? (
              <div style={{ fontSize: 12, color: colors.muted2 }}>No section gaps yet. Run a competitor scan.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {contentGapCards.map((cg) => (
                  <div
                    key={cg.findingId}
                    style={{
                      border: `1px solid ${colors.hair}`,
                      borderRadius: 8,
                      padding: '11px 13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
                        {cg.title}
                      </span>
                      <span style={cg.priority === 'High' ? pill(colors.green, colors.greenBg) : pill(colors.amber, colors.amberBg)}>
                        {cg.priority}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: colors.muted2, lineHeight: 1.5 }}>{cg.why}</div>
                    <HButton
                      onClick={() => {
                        openOpportunity(
                          {
                            id: `finding:${cg.findingId}`,
                            kind: 'finding',
                            findingId: cg.findingId,
                            title: cg.title,
                            context: cg.title,
                            category: 'New content',
                            source: 'Competitor',
                            effort: 'Medium',
                            impact: cg.priority,
                            estMonthlyClicks: 0,
                            priorityValue: 0,
                            status: 'open',
                            action: 'act',
                            actionLabel: 'Act on this',
                          },
                          { nav, setState },
                        )
                      }}
                      style={{ alignSelf: 'start', background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: colors.accent, fontWeight: 550 }}
                    >
                      Act on this →
                    </HButton>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>
              SERP feature opportunities
            </div>
            {serpFeatures.length === 0 ? (
              <div style={{ fontSize: 12, color: colors.muted2 }}>Run scans to surface opportunities.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {serpFeatures.map((sf) => (
                  <div key={sf.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: colors.text }}>{sf.label}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: colors.accent }}>{sf.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
