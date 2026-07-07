import { useReview } from '../selectors'
import { colors, th } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'

const cols = 'minmax(0,1.7fr) 110px 84px 120px 170px 170px'

export function ReviewQueueView() {
  const { items, pendingCount, approvedCount } = useReview()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', margin: '2px 0 16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Review queue</h1>
          <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
            Every change requires approval before it reaches WordPress. Approved items publish on the next
            sync.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 12, color: colors.muted }}>
            {pendingCount} pending · {approvedCount} approved this week
          </span>
        </div>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: cols,
            gap: 12,
            padding: '9px 18px',
            borderBottom: `1px solid ${colors.hair}`,
            background: colors.subtle,
          }}
        >
          <span style={th}>Change</span>
          <span style={th}>Type</span>
          <span style={th}>Risk</span>
          <span style={th}>Reviewer</span>
          <span style={th}>Destination</span>
          <span />
        </div>
        {items.map((rv) => (
          <div
            key={rv.id}
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              gap: 12,
              padding: '12px 18px',
              borderBottom: `1px solid ${colors.hair3}`,
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{rv.title}</div>
              <div
                style={{
                  fontSize: 11.5,
                  color: colors.muted2,
                  marginTop: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {rv.detail}
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 550,
                color: colors.muted,
                background: colors.chipBg2,
                borderRadius: 6,
                padding: '2px 7px',
                justifySelf: 'start',
              }}
            >
              {rv.type}
            </span>
            <span style={rv.riskPill}>{rv.risk}</span>
            <span style={{ fontSize: 12, color: colors.text }}>{rv.reviewer}</span>
            <span style={{ fontSize: 11.5, color: colors.muted }}>{rv.dest}</span>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              {rv.pending ? (
                <>
                  <HButton
                    onClick={rv.onApprove}
                    hover={{ background: '#1a8450' }}
                    style={{
                      background: colors.green,
                      border: `1px solid ${colors.green}`,
                      borderRadius: 7,
                      padding: '5px 11px',
                      fontSize: 11.5,
                      fontWeight: 550,
                      color: '#fff',
                    }}
                  >
                    Approve
                  </HButton>
                  <HButton
                    onClick={rv.onReject}
                    hover={{ background: '#f6f6f1', color: colors.red }}
                    style={{
                      background: '#fff',
                      border: `1px solid ${colors.borderBtn}`,
                      borderRadius: 7,
                      padding: '5px 11px',
                      fontSize: 11.5,
                      fontWeight: 550,
                      color: colors.muted,
                    }}
                  >
                    Reject
                  </HButton>
                </>
              ) : (
                <span style={rv.resolvedPill}>{rv.resolvedLabel}</span>
              )}
            </div>
          </div>
        ))}
      </Card>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 12,
          fontSize: 11.5,
          color: colors.muted2,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: colors.green }} />
        Approved changes publish as WordPress revisions with automatic rollback points. Next sync in 22 min.
      </div>
    </div>
  )
}
