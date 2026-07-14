import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useData, useSiteId } from '../data/DataProvider'
import { useStore } from '../store'
import { colors, mono, pill } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'
import { api } from '../lib/api'

const actionBtn = {
  background: '#fff',
  border: `1px solid ${colors.borderBtn}`,
  borderRadius: 7,
  padding: '5px 11px',
  fontSize: 11.5,
  fontWeight: 550,
  color: colors.ink,
}

const inputStyle = {
  border: `1px solid ${colors.borderInput}`,
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 12.5,
  color: colors.text,
  background: '#fff',
  width: '100%',
}

/** Real Phase 5 generator: Claude builds importable Elementor JSON matching the site's style. */
function ElementorGenerator() {
  const siteId = useSiteId()
  const { showToast } = useStore()
  const queryClient = useQueryClient()
  const [request, setRequest] = useState('')
  const [placement, setPlacement] = useState('')

  const generate = useMutation({
    mutationFn: () =>
      api.generateElementor(siteId!, { request: request.trim(), placement: placement.trim() || undefined }),
    onSuccess: (res) => {
      showToast(
        `Generated "${res.name}" (${res.size})` + (res.styledFrom ? ` — styled from /${res.styledFrom}` : ''),
      )
      setRequest('')
      setPlacement('')
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    },
    onError: (err: Error) => showToast(err.message),
  })
  const canRun = request.trim() && !generate.isPending

  return (
    <Card style={{ padding: '16px 18px', marginBottom: 16, maxWidth: 980 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Generate a section with AI</div>
      <div style={{ fontSize: 11.5, color: colors.muted2, marginBottom: 12, lineHeight: 1.5 }}>
        Describe what to build. Claude produces import-ready Elementor JSON styled to match your existing pages.
      </div>
      <textarea
        placeholder="e.g. A pricing table for Botox with 3 tiers (per-unit, per-area, membership), matching our service pages"
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        style={{ ...inputStyle, minHeight: 66, resize: 'vertical', marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          placeholder="Placement (optional, e.g. /botox-nashville after Treatment Areas)"
          value={placement}
          onChange={(e) => setPlacement(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <HButton
          onClick={() => canRun && generate.mutate()}
          hover={{ background: colors.inkStrong }}
          style={{
            background: colors.ink,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12.5,
            fontWeight: 550,
            flex: 'none',
            opacity: canRun ? 1 : 0.5,
          }}
        >
          {generate.isPending ? 'Building…' : 'Generate section'}
        </HButton>
      </div>
    </Card>
  )
}

export function ElementorView() {
  const { state, setState, showToast } = useStore()
  const { elemDefs } = useData()

  return (
    <div>
      <div style={{ margin: '2px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>
          Elementor sections
        </h1>
        <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
          Import-ready JSON generated against your theme’s Elementor 3.21 setup. Sections are drafts — they
          publish only after review.
        </div>
      </div>

      <ElementorGenerator />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 980 }}>
        {elemDefs.map((es) => {
          const jsonOpen = !!state.jsonOpen[es.id]
          const queued = !!state.queuedSections[es.id]
          return (
            <Card key={es.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 18px' }}>
                {/* preview thumbnail */}
                <div
                  style={{
                    width: 150,
                    flex: 'none',
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background:
                      'repeating-linear-gradient(45deg,#f7f7f2,#f7f7f2 6px,#f1f1ea 6px,#f1f1ea 12px)',
                  }}
                >
                  <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ height: 8, width: '70%', background: '#dcdcd4', borderRadius: 3 }} />
                    <div style={{ height: 5, width: '90%', background: '#e6e6de', borderRadius: 3 }} />
                    <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                      <div style={{ flex: 1, height: 30, background: '#e6e6de', borderRadius: 4 }} />
                      <div style={{ flex: 1, height: 30, background: '#dcdcd4', borderRadius: 4 }} />
                      <div style={{ flex: 1, height: 30, background: '#e6e6de', borderRadius: 4 }} />
                    </div>
                    <div
                      style={{
                        fontFamily: mono,
                        fontSize: 8,
                        color: colors.faint,
                        textAlign: 'center',
                        marginTop: 2,
                      }}
                    >
                      section preview
                    </div>
                  </div>
                </div>

                {/* meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{es.name}</div>
                    <span style={es.ok ? pill(colors.green, colors.greenBg) : pill(colors.amber, colors.amberBg)}>
                      {es.status}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr',
                      gap: '4px 12px',
                      marginTop: 10,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: colors.muted2 }}>Use case</span>
                    <span style={{ color: colors.text }}>{es.useCase}</span>
                    <span style={{ color: colors.muted2 }}>Placement</span>
                    <span style={{ color: colors.text }}>{es.placement}</span>
                    <span style={{ color: colors.muted2 }}>Design notes</span>
                    <span style={{ color: colors.text }}>{es.notes}</span>
                    <span style={{ color: colors.muted2 }}>SEO rationale</span>
                    <span style={{ color: colors.text }}>{es.rationale}</span>
                  </div>
                </div>
              </div>

              {/* action bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderTop: `1px solid ${colors.hair}`,
                  background: colors.subtle,
                }}
              >
                <HButton
                  onClick={() => setState({ jsonOpen: { ...state.jsonOpen, [es.id]: !jsonOpen } })}
                  hover={{ color: colors.ink }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'none',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.text,
                    padding: 0,
                  }}
                >
                  <span style={{ fontSize: 10 }}>{jsonOpen ? '▼' : '▶'}</span> Elementor JSON{' '}
                  <span style={{ fontFamily: mono, fontSize: 11, color: colors.muted2 }}>{es.size}</span>
                </HButton>
                <div style={{ flex: 1 }} />
                <HButton
                  onClick={() => {
                    try {
                      navigator.clipboard.writeText(es.json)
                    } catch {
                      /* clipboard unavailable */
                    }
                    showToast('JSON copied to clipboard')
                  }}
                  hover={{ background: '#f6f6f1' }}
                  style={actionBtn}
                >
                  Copy JSON
                </HButton>
                <HButton
                  onClick={() => {
                    const blob = new Blob([es.json], { type: 'application/json' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = es.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json'
                    a.click()
                    showToast('Downloading Elementor JSON')
                  }}
                  hover={{ background: '#f6f6f1' }}
                  style={actionBtn}
                >
                  Download
                </HButton>
                <HButton
                  onClick={() => showToast('Sent to WordPress as unpublished draft')}
                  hover={{ background: '#f6f6f1' }}
                  style={actionBtn}
                >
                  Send to WordPress draft
                </HButton>
                <HButton
                  onClick={() => {
                    setState({ queuedSections: { ...state.queuedSections, [es.id]: true } })
                    showToast('Added to review queue')
                  }}
                  hover={{ background: colors.inkStrong }}
                  style={{
                    background: colors.ink,
                    border: `1px solid ${colors.ink}`,
                    borderRadius: 7,
                    padding: '5px 11px',
                    fontSize: 11.5,
                    fontWeight: 550,
                    color: '#fff',
                  }}
                >
                  {queued ? 'In review queue ✓' : 'Add to review queue'}
                </HButton>
              </div>

              {jsonOpen && (
                <pre
                  style={{
                    margin: 0,
                    padding: '14px 18px',
                    borderTop: `1px solid ${colors.hair}`,
                    background: colors.ink,
                    color: '#d6d6cc',
                    fontFamily: mono,
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    overflow: 'auto',
                    maxHeight: 280,
                    borderRadius: '0 0 10px 10px',
                  }}
                >
                  {es.json}
                </pre>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
