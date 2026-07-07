import { pageComps, pageQueries, planChecklist, planDefs, planLinks } from '../data'
import { useStore } from '../store'
import { colors, mono, pill, th } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'

const eyebrow = {
  fontSize: 11,
  fontWeight: 650,
  letterSpacing: '.06em',
  textTransform: 'uppercase' as const,
  color: colors.muted2,
}

const gapStyleBad = {
  fontSize: 11,
  fontWeight: 650,
  color: colors.red,
  background: colors.redBg,
  borderRadius: 999,
  padding: '2px 8px',
  justifySelf: 'start' as const,
}
const gapStyleOk = { fontSize: 11, color: colors.muted2 }

export function PageDetailView() {
  const { state, setState, nav, showToast } = useStore()
  const included = state.planIncluded
  const approvedCount = planDefs.filter((p) => included[p.id]).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0 16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>
              Laser Hair Removal | SLK Clinic
            </h1>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: colors.red,
                background: colors.redBg,
                borderRadius: 99,
                padding: '2px 9px',
              }}
            >
              Losing traffic
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
            <span style={{ fontFamily: mono }}>slkclinic.com/laser-hair-removal</span> · Service page ·
            Elementor template “Service v3” · Last edited 14 months ago
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <HButton
            onClick={() => nav('editor')}
            hover={{ background: '#f6f6f1' }}
            style={{
              background: '#fff',
              border: `1px solid ${colors.borderBtn}`,
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 12.5,
              fontWeight: 550,
              color: colors.ink,
            }}
          >
            Open in content editor
          </HButton>
          <HButton
            onClick={() => {
              setState({ planQueued: true })
              showToast('Action plan added to review queue')
            }}
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
            {state.planQueued ? 'In review queue ✓' : 'Add plan to review queue'}
          </HButton>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* LEFT: Diagnosis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={eyebrow}>Diagnosis — what the data says</div>

          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              Organic performance · last 28 days
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              <Stat label="Clicks" value="1,284" note="−18%" noteColor={colors.red} />
              <Stat label="Impressions" value="52.1k" note="+6%" noteColor={colors.green} />
              <Stat label="Avg. position" value="8.2" note="↓ from 5.9" noteColor={colors.red} />
              <Stat label="CTR" value="2.5%" note="expected 4.1%" noteColor={colors.muted2} noteWeight={400} />
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 13, fontWeight: 600, padding: '14px 18px', borderBottom: `1px solid ${colors.hair}` }}>
              Top queries · Google Search Console
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1.5fr) 62px 62px 56px 90px',
                gap: 10,
                padding: '8px 18px',
                borderBottom: `1px solid ${colors.hair2}`,
                background: colors.subtle,
              }}
            >
              <span style={th}>Query</span>
              <span style={th}>Impr.</span>
              <span style={th}>CTR</span>
              <span style={th}>Pos.</span>
              <span style={th}>CTR gap</span>
            </div>
            {pageQueries.map((q) => (
              <div
                key={q.q}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1.5fr) 62px 62px 56px 90px',
                  gap: 10,
                  padding: '9px 18px',
                  borderBottom: `1px solid ${colors.hair3}`,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    color: colors.ink,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {q.q}
                </span>
                <span style={{ fontSize: 12, color: colors.text }}>{q.impr}</span>
                <span style={{ fontSize: 12, color: colors.text }}>{q.ctr}</span>
                <span style={{ fontSize: 12, color: colors.text }}>{q.pos}</span>
                <span style={q.bad ? gapStyleBad : gapStyleOk}>{q.gap}</span>
              </div>
            ))}
          </Card>

          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
              Ranking movement · “laser hair removal nashville”
            </div>
            <svg viewBox="0 0 560 90" style={{ width: '100%', display: 'block' }}>
              <line x1="0" y1="22" x2="560" y2="22" stroke="#f0f0ea" />
              <line x1="0" y1="45" x2="560" y2="45" stroke="#f0f0ea" />
              <line x1="0" y1="68" x2="560" y2="68" stroke="#f0f0ea" />
              <polyline
                points="0,28 62,26 124,30 186,32 248,38 310,44 372,50 434,58 496,62 560,66"
                fill="none"
                stroke={colors.red}
                strokeWidth="2"
              />
              <circle cx="560" cy="66" r="3" fill={colors.red} />
              <text x="4" y="16" fontSize="10" fill={colors.faint}>#4</text>
              <text x="4" y="86" fontSize="10" fill={colors.faint}>#9</text>
            </svg>
            <div style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
              Dropped from #4 to #8 over 90 days. Two competitors refreshed their pages in that window;
              yours hasn’t changed since May 2025.
            </div>
          </Card>

          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Competitor comparison</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pageComps.map((c) => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 170, fontSize: 12.5, color: colors.ink, flex: 'none' }}>{c.name}</span>
                  <span style={{ fontSize: 11.5, color: colors.muted, flex: 'none' }}>#{c.pos}</span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 11.5,
                      color: colors.muted2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.note}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Current page structure</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: mono, fontSize: 12 }}>
              <StructRow tag="H1" text="Laser Hair Removal" />
              <StructRow tag="H2" text="How It Works" indent />
              <StructRow tag="H2" text="Treatment Areas" indent />
              <StructRow tag="—" text="Missing: pricing section (top query intent)" indent missing />
              <StructRow tag="—" text="Missing: FAQ (11 question queries)" indent missing />
              <StructRow tag="H2" text="Book a Consultation" indent />
            </div>
          </Card>
        </div>

        {/* RIGHT: Proposed changes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={eyebrow}>Action plan — proposed changes</div>

          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 18px',
                borderBottom: `1px solid ${colors.hair}`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>Recommended changes</div>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: colors.muted2 }}>
                {approvedCount} of 6 included
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {planDefs.map((p) => {
                const on = !!included[p.id]
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '11px 18px',
                      borderBottom: `1px solid ${colors.hair4}`,
                    }}
                  >
                    <button
                      onClick={() => setState({ planIncluded: { ...included, [p.id]: !on } })}
                      style={{
                        width: 18,
                        height: 18,
                        flex: 'none',
                        marginTop: 1,
                        borderRadius: 5,
                        border: on ? `1px solid ${colors.ink}` : '1px solid #c9c9c0',
                        background: on ? colors.ink : '#fff',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      {on ? '✓' : ''}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink }}>{p.title}</div>
                      <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 1 }}>{p.why}</div>
                    </div>
                    <span style={pill(colors.muted, colors.chipBg2)}>{p.kind}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Metadata</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 650, color: colors.muted2 }}>TITLE — CURRENT</span>
                  <span style={{ fontSize: 11, color: colors.faint }}>31 chars</span>
                </div>
                <div
                  style={{ fontSize: 12.5, color: colors.muted, textDecoration: 'line-through', marginTop: 2 }}
                >
                  Laser Hair Removal | SLK Clinic
                </div>
              </div>
              <div style={{ borderLeft: `2px solid ${colors.accent}`, paddingLeft: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 650, color: colors.accent }}>SUGGESTED</span>
                  <span style={{ fontSize: 11, color: colors.faint }}>57 chars</span>
                </div>
                <div style={{ fontSize: 12.5, color: colors.ink, fontWeight: 550, marginTop: 2 }}>
                  Laser Hair Removal Nashville — Prices &amp; Packages | SLK
                </div>
                <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 3 }}>
                  Targets “laser hair removal cost nashville” (1.6k impr., CTR 0.6%). Pricing terms in titles
                  lift CTR on this site’s service pages.
                </div>
              </div>
            </div>
          </Card>

          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Content rewrite preview · intro section
            </div>
            <div
              style={{
                background: colors.subtle,
                border: `1px solid ${colors.hair}`,
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 12.5,
                lineHeight: 1.6,
                color: colors.text,
              }}
            >
              Looking for laser hair removal in Nashville? SLK Clinic uses the Candela GentleMax Pro — safe
              for all skin tones — with packages from <strong>$89 per session</strong>. Most clients see
              lasting results in 6–8 treatments…
            </div>
            <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 8 }}>
              Adds city + price intent to the first 60 words. Full rewrite available in the content editor.
            </div>
          </Card>

          <Card style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Elementor section · Pricing table</div>
              <HButton
                onClick={() => nav('elementor')}
                hover={{ textDecoration: 'underline' }}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  fontSize: 11.5,
                  color: colors.accent,
                  fontWeight: 550,
                  padding: 0,
                }}
              >
                View JSON →
              </HButton>
            </div>
            <div style={{ fontSize: 12, color: colors.muted, lineHeight: 1.55 }}>
              3-column pricing table matching template “Service v3”. Suggested placement: after “Treatment
              Areas”. Import-ready — validated against your Elementor 3.21 setup.
            </div>
          </Card>

          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Internal links · 3 suggested</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {planLinks.map((l) => (
                <div key={l.from} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ fontFamily: mono, color: colors.muted, flex: 'none' }}>{l.from}</span>
                  <span style={{ color: colors.faint }}>→</span>
                  <span
                    style={{
                      color: colors.ink,
                      fontWeight: 550,
                      flex: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    “{l.anchor}”
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Publish checklist</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {planChecklist.map((ck) => (
                <div key={ck.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      flex: 'none',
                      borderRadius: 99,
                      background: ck.done ? colors.greenBg : colors.chipBg,
                      color: colors.green,
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: ck.done ? `1px solid ${colors.greenBorder}` : '1px solid #e0e0d8',
                    }}
                  >
                    {ck.done ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: 12, color: colors.text }}>{ck.label}</span>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 12,
                background: colors.subtle,
                border: `1px solid ${colors.hair}`,
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 11.5,
                color: colors.muted,
              }}
            >
              Changes are staged to a WordPress draft revision. Nothing goes live until a reviewer approves in
              the review queue.
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  note,
  noteColor,
  noteWeight = 600,
}: {
  label: string
  value: string
  note: string
  noteColor: string
  noteWeight?: number
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: colors.muted2 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 650 }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: noteWeight, color: noteColor }}>{note}</div>
    </div>
  )
}

function StructRow({
  tag,
  text,
  indent,
  missing,
}: {
  tag: string
  text: string
  indent?: boolean
  missing?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        paddingLeft: indent ? 14 : 0,
        alignItems: missing ? 'center' : undefined,
      }}
    >
      <span style={{ color: colors.muted2, width: 26 }}>{tag}</span>
      <span style={{ color: missing ? colors.red : colors.ink }}>{text}</span>
    </div>
  )
}
