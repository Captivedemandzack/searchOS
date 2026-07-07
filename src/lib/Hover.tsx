import { useState, type CSSProperties, type ReactNode, type MouseEvent } from 'react'

type HoverProps = {
  style?: CSSProperties
  hover?: CSSProperties
  onClick?: (e: MouseEvent) => void
  children?: ReactNode
  title?: string
}

/**
 * Button that merges an extra `hover` style block while the pointer is over it.
 * Mirrors the prototype's `style` + `style-hover` attribute pair so we can keep
 * the source's inline styling verbatim without a stylesheet of hover rules.
 */
export function HButton({ style, hover, onClick, children, title }: HoverProps) {
  const [h, setH] = useState(false)
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ ...style, ...(h && hover ? hover : null) }}
    >
      {children}
    </button>
  )
}

/** Same as HButton but renders a div (for clickable rows / links styled as text). */
export function HDiv({ style, hover, onClick, children, title }: HoverProps) {
  const [h, setH] = useState(false)
  return (
    <div
      title={title}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{ ...style, ...(h && hover ? hover : null) }}
    >
      {children}
    </div>
  )
}
