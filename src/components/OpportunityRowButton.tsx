import type { CSSProperties } from 'react'
import { opportunityStartLabel } from '../lib/workflow'
import { colors } from '../theme'
import { HButton } from '../lib/Hover'

type Props = {
  variant: 'start' | 'continue'
  onClick: (e?: { stopPropagation?: () => void }) => void
  size?: 'default' | 'compact'
}

export function OpportunityRowButton({ variant, onClick, size = 'default' }: Props) {
  const continuing = variant === 'continue'
  const padding = size === 'compact' ? '5px 10px' : '5px 11px'
  const fontSize = size === 'compact' ? 11 : 11.5

  const style: CSSProperties = continuing
    ? {
        background: '#fff',
        color: colors.ink,
        border: `1px solid ${colors.borderBtn}`,
        borderRadius: 7,
        padding,
        fontSize,
        fontWeight: 550,
      }
    : {
        background: colors.ink,
        color: '#fff',
        border: 'none',
        borderRadius: 7,
        padding,
        fontSize,
        fontWeight: 550,
      }

  const hover = continuing ? { background: '#f6f6f1' } : { background: colors.inkStrong }

  return (
    <HButton onClick={onClick} hover={hover} style={style}>
      {opportunityStartLabel(variant)}
    </HButton>
  )
}
