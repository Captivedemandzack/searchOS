import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { colors } from '../theme'

const TOOLTIP = 'Estimated clicks per month from this change.'

type Props = {
  estMonthlyClicks: number
  compact?: boolean
}

function InfoTip() {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  function show() {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left + r.width / 2 })
    setOpen(true)
  }

  function hide() {
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={TOOLTIP}
        aria-describedby={open ? 'estimate-upside-tip' : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          padding: 0,
          borderRadius: 99,
          border: `1px solid ${colors.borderBtn}`,
          background: '#fff',
          fontSize: 10,
          fontWeight: 700,
          fontStyle: 'italic',
          fontFamily: 'Georgia, serif',
          color: colors.muted2,
          cursor: 'help',
          flex: 'none',
          lineHeight: 1,
        }}
      >
        i
      </button>
      {open &&
        createPortal(
          <div
            id="estimate-upside-tip"
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: 'translateX(-50%)',
              zIndex: 10000,
              maxWidth: 220,
              padding: '7px 10px',
              borderRadius: 8,
              background: colors.ink,
              color: '#fff',
              fontSize: 11.5,
              fontWeight: 500,
              lineHeight: 1.45,
              textAlign: 'center',
              pointerEvents: 'none',
              boxShadow: '0 6px 20px rgba(20, 20, 17, 0.18)',
            }}
          >
            {TOOLTIP}
          </div>,
          document.body,
        )}
    </>
  )
}

/** Green upside number with an info icon tooltip on the same line. */
export function EstimateUpside({ estMonthlyClicks, compact }: Props) {
  if (estMonthlyClicks <= 0) return null

  return (
    <div
      style={{
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 5,
        minWidth: compact ? 56 : 64,
      }}
    >
      <span
        style={{
          fontSize: compact ? 13 : 14,
          fontWeight: 700,
          color: colors.green,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        +{estMonthlyClicks.toLocaleString()}
      </span>
      <InfoTip />
    </div>
  )
}
