import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useData, useSiteId, useCurrentSite } from '../data/DataProvider'
import { useWorkItems } from '../selectors'
import { useStore, syncMeta, useMinuteTick } from '../store'
import { colors, shadow } from '../theme'
import { HButton } from '../lib/Hover'
import { api } from '../lib/api'

export function Topbar() {
  const { state, setState, nav, showToast } = useStore()
  const { openCount } = useWorkItems()
  const { sites } = useData()
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const now = useMinuteTick()
  const site = useCurrentSite()

  // The one-click refresh: re-pull every connected source, merge the checklist,
  // and auto-draft metadata. Then invalidate everything so the whole app updates.
  const refresh = useMutation({
    mutationFn: () => api.refresh(siteId!),
    onSuccess: (r) => {
      if (r.blogWritten) {
        // The flagship outcome leads the toast.
        showToast(`✍️ New blog written: “${r.blogWritten.title}” — see Content Studio`)
      } else {
        const parts: string[] = []
        parts.push(r.synced.length ? `Synced ${r.synced.join(', ')}` : 'Re-audited')
        if (r.audit.added) parts.push(`${r.audit.added} new`)
        if (r.drafted) parts.push(`${r.drafted} drafted`)
        showToast(parts.join(' · '))
      }
      queryClient.invalidateQueries()
    },
    onError: (e: Error) => showToast(e.message),
  })
  const initials = site.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
  const sync = syncMeta(site?.lastSyncedAt, now)

  return (
    <header
      style={{
        height: 54,
        flex: 'none',
        background: colors.topbar,
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 22px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Site switcher */}
      <div style={{ position: 'relative' }}>
        <HButton
          onClick={() => setState({ siteMenuOpen: !state.siteMenuOpen })}
          hover={{ background: '#f6f6f1' }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: `1px solid ${colors.borderInput}`,
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 13,
            fontWeight: 600,
            color: colors.ink,
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              background: colors.accentSoftBg,
              color: colors.accent,
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initials}
          </span>
          {site.name}
          <span style={{ fontSize: 10, color: colors.muted2 }}>▾</span>
        </HButton>
        {state.siteMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 38,
              left: 0,
              width: 250,
              background: '#fff',
              border: `1px solid ${colors.borderInput}`,
              borderRadius: 10,
              boxShadow: shadow.menu,
              padding: 6,
              zIndex: 60,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '.05em',
                textTransform: 'uppercase',
                color: colors.muted2,
                padding: '6px 8px 4px',
              }}
            >
              Client sites
            </div>
            {sites.map((s, i) => {
              const ini = s.name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
              return (
                <HButton
                  key={s.domain}
                  onClick={() => {
                    setState({ siteIdx: i, siteMenuOpen: false })
                    showToast('Switched to ' + s.name)
                  }}
                  hover={{ background: '#f4f4ee' }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    border: 'none',
                    background: 'none',
                    padding: '7px 8px',
                    borderRadius: 7,
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      background: colors.accentSoftBg,
                      color: colors.accent,
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    {ini}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span
                      style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: colors.ink }}
                    >
                      {s.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: colors.muted2 }}>
                      {s.domain}
                    </span>
                  </span>
                  {i === state.siteIdx && (
                    <span style={{ color: colors.accent, fontSize: 12 }}>✓</span>
                  )}
                </HButton>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: colors.border }} />

      <select
        value={state.dateRange}
        onChange={(e) => setState({ dateRange: e.target.value })}
        style={{
          border: `1px solid ${colors.borderInput}`,
          borderRadius: 8,
          padding: '5px 8px',
          fontSize: 12.5,
          color: colors.text,
          background: '#fff',
        }}
      >
        <option>Last 28 days</option>
        <option>Last 3 months</option>
        <option>Last 12 months</option>
      </select>

      <button
        onClick={() => nav('settings')}
        title="Last data sync — manage connections in Settings"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12,
          color: colors.muted,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <span
          style={{ width: 7, height: 7, borderRadius: 99, background: sync.dot, animation: sync.anim }}
        />
        {sync.label}
      </button>

      <div style={{ flex: 1 }} />

      <HButton
        onClick={() => {
          if (refresh.isPending) return
          if (!siteId) {
            showToast('Still connecting — try again in a moment')
            return
          }
          refresh.mutate()
        }}
        hover={refresh.isPending ? undefined : { background: '#f6f6f1' }}
        title="Re-pull Search Console, GA4 & WordPress, refresh the opportunity checklist, and auto-draft new metadata"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: '#fff',
          border: `1px solid ${colors.borderInput}`,
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12.5,
          fontWeight: 550,
          color: refresh.isPending ? colors.muted : colors.ink,
          cursor: refresh.isPending ? 'default' : 'pointer',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            fontSize: 13,
            lineHeight: 1,
            animation: refresh.isPending ? 'gw-spin 1s linear infinite' : 'none',
          }}
        >
          ⟳
        </span>
        {refresh.isPending ? 'Refreshing…' : 'Refresh'}
      </HButton>

      <HButton
        onClick={() => nav('opportunities')}
        hover={{ background: colors.inkStrong }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: colors.ink,
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '7px 13px',
          fontSize: 12.5,
          fontWeight: 550,
        }}
      >
        Opportunities
        {openCount > 0 ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 650,
              color: colors.ink,
              background: '#fff',
              borderRadius: 99,
              padding: '1px 7px',
            }}
          >
            {openCount}
          </span>
        ) : null}
      </HButton>
    </header>
  )
}
