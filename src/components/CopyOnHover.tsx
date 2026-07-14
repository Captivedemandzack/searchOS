import { useState, type ReactNode } from 'react'
import { colors } from '../theme'
import { HButton } from '../lib/Hover'

function copyText(text: string, onDone: () => void) {
  navigator.clipboard.writeText(text).then(onDone)
}

function ClipboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M6 16V6a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CopyOnHover({
  text,
  onCopied,
  children,
}: {
  text: string
  onCopied: () => void
  children: ReactNode
}) {
  const [hover, setHover] = useState(false)

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      {hover && text.trim() ? (
        <HButton
          aria-label="Copy to clipboard"
          title="Copy to clipboard"
          onClick={() => copyText(text, onCopied)}
          hover={{ background: '#fff', borderColor: colors.border }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            borderRadius: 6,
            background: 'rgba(255,255,255,0.92)',
            border: `1px solid ${colors.hair}`,
            color: colors.muted,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <ClipboardIcon />
        </HButton>
      ) : null}
    </div>
  )
}
