import { editorData, editorTabDefs } from '../data'
import { useStore } from '../store'
import { colors, mono, pill, th } from '../theme'
import { HButton } from '../lib/Hover'

export function ContentEditorView() {
  const { state, setState, showToast } = useStore()
  const tab = state.editorTab

  const allItems = Object.values(editorData).flat()
  const approvedCount = allItems.filter((i) => state.approvals[i.id] === 'approved').length
  const rejectedCount = allItems.filter((i) => state.approvals[i.id] === 'rejected').length

  const items = (editorData[tab] || []).map((it) => {
    const status = state.approvals[it.id]
    const text = state.edits[it.id] != null ? state.edits[it.id] : it.suggested
    const isEditing = !!state.editing[it.id]
    const overLimit = tab === 'title' ? text.length > 60 : text.length > 158
    return { it, status, text, isEditing, overLimit }
  })

  return (
    <div>
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${colors.border}`, marginBottom: 16 }}>
        {editorTabDefs.map(([id, label]) => {
          const active = tab === id
          return (
            <HButton
              key={id}
              onClick={() => setState({ editorTab: id })}
              hover={active ? undefined : { color: colors.ink }}
              style={{
                background: 'none',
                border: 'none',
                padding: '9px 13px',
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                color: active ? colors.ink : colors.muted2,
                borderBottom: active ? `2px solid ${colors.ink}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {label}
            </HButton>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 960 }}>
        {items.map(({ it, status, text, isEditing, overLimit }) => (
          <div
            key={it.id}
            style={{
              background: '#fff',
              border: `1px solid ${colors.border}`,
              borderRadius: 10,
              boxShadow: '0 1px 2px rgba(20,20,17,.03)',
            }}
          >
            {/* header row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 18px',
                borderBottom: `1px solid ${colors.hair}`,
              }}
            >
              <span style={{ fontFamily: mono, fontSize: 12, color: colors.muted }}>{it.page}</span>
              <span
                style={
                  status === 'approved'
                    ? pill(colors.green, colors.greenBg)
                    : status === 'rejected'
                      ? pill(colors.muted, colors.chipBg)
                      : pill(colors.amber, colors.amberBg)
                }
              >
                {status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Needs review'}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  onClick={() =>
                    setState({
                      approvals: { ...state.approvals, [it.id]: 'approved' },
                      editing: { ...state.editing, [it.id]: false },
                    })
                  }
                  style={
                    status === 'approved'
                      ? { background: colors.green, border: `1px solid ${colors.green}`, color: '#fff', borderRadius: 7, padding: '5px 11px', fontSize: 11.5, fontWeight: 550 }
                      : { background: '#fff', border: `1px solid ${colors.borderBtn}`, color: colors.green, borderRadius: 7, padding: '5px 11px', fontSize: 11.5, fontWeight: 550 }
                  }
                >
                  Approve
                </button>
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
                <button
                  onClick={() =>
                    setState({
                      approvals: { ...state.approvals, [it.id]: 'rejected' },
                      editing: { ...state.editing, [it.id]: false },
                    })
                  }
                  style={
                    status === 'rejected'
                      ? { background: colors.muted, border: `1px solid ${colors.muted}`, color: '#fff', borderRadius: 7, padding: '5px 11px', fontSize: 11.5, fontWeight: 550 }
                      : { background: '#fff', border: `1px solid ${colors.borderBtn}`, color: colors.muted, borderRadius: 7, padding: '5px 11px', fontSize: 11.5, fontWeight: 550 }
                  }
                >
                  Reject
                </button>
              </div>
            </div>

            {/* current vs suggested */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <div style={{ padding: '14px 18px', borderRight: `1px solid ${colors.hair2}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={th}>Current</span>
                  {it.chars && (
                    <span style={{ fontSize: 11, color: colors.faint }}>{it.current.length} chars</span>
                  )}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: colors.muted, whiteSpace: 'pre-wrap' }}>
                  {it.current}
                </div>
              </div>
              <div style={{ padding: '14px 18px', background: colors.suggestBg }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{ ...th, color: colors.accent }}>Suggested</span>
                  {it.chars && (
                    <span
                      style={{
                        fontSize: 11,
                        color: overLimit ? colors.red : colors.faint,
                        fontWeight: overLimit ? 650 : 400,
                      }}
                    >
                      {text.length} chars
                    </span>
                  )}
                </div>
                {isEditing ? (
                  <textarea
                    value={text}
                    onChange={(e) => setState({ edits: { ...state.edits, [it.id]: e.target.value } })}
                    style={{
                      width: '100%',
                      minHeight: 88,
                      border: '1px solid #c7d2f2',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: colors.ink,
                      resize: 'vertical',
                      background: '#fff',
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: colors.ink, whiteSpace: 'pre-wrap' }}>
                    {text}
                  </div>
                )}
              </div>
            </div>

            {/* footer: reason + queries */}
            <div
              style={{
                display: 'flex',
                gap: 20,
                padding: '11px 18px',
                borderTop: `1px solid ${colors.hair2}`,
                background: colors.subtle,
                borderRadius: '0 0 10px 10px',
              }}
            >
              <div style={{ flex: 1, fontSize: 11.5, color: colors.muted, lineHeight: 1.5 }}>
                <strong style={{ color: colors.text }}>Why:</strong> {it.reason}
              </div>
              <div
                style={{
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                  maxWidth: 340,
                  justifyContent: 'flex-end',
                }}
              >
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
          </div>
        ))}
      </div>
    </div>
  )
}
