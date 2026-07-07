import { useStore } from '../store'
import { colors, shadow } from '../theme'

export function Toast() {
  const { state } = useStore()
  if (!state.toast) return null
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 22,
        left: '50%',
        transform: 'translateX(-50%)',
        background: colors.ink,
        color: '#fff',
        fontSize: 12.5,
        fontWeight: 550,
        padding: '9px 16px',
        borderRadius: 9,
        boxShadow: shadow.toast,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: colors.greenToast }} />
      {state.toast}
    </div>
  )
}
