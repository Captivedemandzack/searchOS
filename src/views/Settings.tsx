import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateSiteData, useData, useSiteId } from '../data/DataProvider'
import { useStore } from '../store'
import { colors, pill } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'
import { api } from '../lib/api'

const inputStyle = {
  border: `1px solid ${colors.borderInput}`,
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 12.5,
  color: colors.text,
  background: '#fff',
  width: '100%',
}

const primaryBtn = {
  background: colors.ink,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '7px 13px',
  fontSize: 12.5,
  fontWeight: 550,
}

function AddClientWizard() {
  const { showToast, setState } = useStore()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')

  const createMutation = useMutation({
    mutationFn: () => api.createSite({ name: name.trim(), domain: domain.trim() }),
    onSuccess: async (site) => {
      showToast(`Added ${site.name}`)
      await queryClient.invalidateQueries({ queryKey: ['sites'] })
      const sites = await api.sites()
      const idx = sites.findIndex((s) => s.id === site.id)
      if (idx >= 0) setState({ siteIdx: idx })
      setStep(1)
    },
    onError: (err: Error) => showToast(err.message),
  })

  return (
    <Card style={{ padding: '16px 18px', maxWidth: 720, marginBottom: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Add client site</div>
      <div style={{ fontSize: 11.5, color: colors.muted2, marginBottom: 14, lineHeight: 1.5 }}>
        Step {step + 1} of 3: {step === 0 ? 'Site details' : step === 1 ? 'Connect WordPress' : 'Connect Google'}
      </div>
      {step === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 12, color: colors.muted }}>
            Client name
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} placeholder="e.g. SLK Clinic" />
          </label>
          <label style={{ fontSize: 12, color: colors.muted }}>
            Domain
            <input value={domain} onChange={(e) => setDomain(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} placeholder="e.g. slkclinic.com" />
          </label>
          <HButton
            onClick={() => {
              if (!name.trim() || !domain.trim() || createMutation.isPending) return
              createMutation.mutate()
            }}
            style={{
              ...primaryBtn,
              alignSelf: 'flex-start',
              opacity: !name.trim() || !domain.trim() || createMutation.isPending ? 0.6 : 1,
              cursor: !name.trim() || !domain.trim() || createMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            Create site
          </HButton>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: colors.text, lineHeight: 1.6 }}>
          Site created. Connect WordPress and Google below, then use Refresh on the Overview to run the first sync.
          {step === 1 ? (
            <div style={{ marginTop: 10 }}>
              <HButton onClick={() => setStep(2)} style={{ ...primaryBtn }}>WordPress connected — next</HButton>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  )
}

/**
 * Real Phase 1 connector — everything else on this page is still the
 * read-only demo dataset. Requires the Groundwork Connector mu-plugin
 * (wordpress-connector/) installed on the target site to read Elementor
 * structure; without it, sync still pulls rendered content and meta.
 */
function WordPressConnector() {
  const siteId = useSiteId()
  const { showToast } = useStore()
  const queryClient = useQueryClient()
  const [baseUrl, setBaseUrl] = useState('')
  const [username, setUsername] = useState('')
  const [appPassword, setAppPassword] = useState('')

  const statusQuery = useQuery({
    queryKey: ['wp-connection', siteId],
    queryFn: () => api.wpConnectionStatus(siteId!),
    enabled: !!siteId,
  })

  const connectMutation = useMutation({
    mutationFn: () => api.connectWordPress(siteId!, { baseUrl, username, appPassword }),
    onSuccess: () => {
      showToast('WordPress connected')
      setAppPassword('')
      queryClient.invalidateQueries({ queryKey: ['wp-connection', siteId] })
      queryClient.invalidateQueries({ queryKey: ['connections-summary', siteId] })
    },
    onError: (err: Error) => showToast(err.message),
  })

  const syncMutation = useMutation({
    mutationFn: () => api.syncWordPress(siteId!),
    onSuccess: (result) => {
      showToast(`Synced ${result.pagesSynced} pages · ${result.elementorFound} with Elementor data`)
      queryClient.invalidateQueries({ queryKey: ['pages', siteId] })
    },
    onError: (err: Error) => showToast(err.message),
  })

  if (!siteId) return null
  const status = statusQuery.data

  return (
    <Card style={{ padding: '16px 18px', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>WordPress connector</div>
        {status?.connected && <span style={pill(colors.green, colors.greenBg)}>Connected</span>}
      </div>
      <div style={{ fontSize: 11.5, color: colors.muted2, marginBottom: 14, lineHeight: 1.5 }}>
        Read-only, via an Application Password. Install the Groundwork Connector mu-plugin on the
        site first so Elementor's builder JSON is readable — see wordpress-connector/README.md.
      </div>

      {status?.connected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, fontSize: 12, color: colors.text }}>
            <strong>{status.username}</strong> @ {status.baseUrl}
          </div>
          <HButton
            onClick={() => {
              if (syncMutation.isPending) return
              syncMutation.mutate()
            }}
            hover={{ background: colors.inkStrong }}
            style={{ ...primaryBtn, opacity: syncMutation.isPending ? 0.6 : 1 }}
          >
            {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
          </HButton>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            placeholder="https://yoursite.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="WordPress username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Application password"
            type="password"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            style={inputStyle}
          />
          <div>
            <HButton
              onClick={() => {
                if (connectMutation.isPending) return
                connectMutation.mutate()
              }}
              hover={{ background: colors.inkStrong }}
              style={{ ...primaryBtn, opacity: connectMutation.isPending ? 0.6 : 1 }}
            >
              {connectMutation.isPending ? 'Testing…' : 'Test & connect'}
            </HButton>
          </div>
        </div>
      )}
    </Card>
  )
}

/**
 * Real Phase 2 connector. One OAuth connection covers both Search Console and
 * GA4 (same Google account, two scopes); each data source still needs its own
 * property selected and synced independently since an account can have many
 * properties.
 */
function GoogleConnector() {
  const siteId = useSiteId()
  const { showToast } = useStore()
  const queryClient = useQueryClient()
  const [gscSelection, setGscSelection] = useState<string | null>(null)
  const [ga4Selection, setGa4Selection] = useState<string | null>(null)

  const statusQuery = useQuery({
    queryKey: ['google-connection', siteId],
    queryFn: () => api.googleConnectionStatus(siteId!),
    enabled: !!siteId,
  })
  const status = statusQuery.data

  const gscSitesQuery = useQuery({
    queryKey: ['gsc-sites', siteId],
    queryFn: () => api.gscSites(siteId!),
    enabled: !!siteId && !!status?.connected,
  })
  const ga4PropsQuery = useQuery({
    queryKey: ['ga4-properties', siteId],
    queryFn: () => api.ga4Properties(siteId!),
    enabled: !!siteId && !!status?.connected,
  })

  const currentGsc = gscSelection ?? status?.gscProperty ?? ''
  const currentGa4 = ga4Selection ?? status?.ga4Property ?? ''

  const gscMutation = useMutation({
    mutationFn: async () => {
      if (currentGsc && currentGsc !== status?.gscProperty) await api.connectGsc(siteId!, currentGsc)
      return api.syncGsc(siteId!)
    },
    onSuccess: (result) => {
      const opps = result.opportunitiesGenerated
      showToast(
        `Search Console synced — ${result.rowsSynced.toLocaleString()} rows` +
          (opps != null ? ` · ${opps} opportunities` : ''),
      )
      queryClient.invalidateQueries({ queryKey: ['google-connection', siteId] })
      // Opportunities + Overview metrics changed — refresh the whole app dataset.
      invalidateSiteData(queryClient, siteId)
    },
    onError: (err: Error) => showToast(err.message),
  })

  const ga4Mutation = useMutation({
    mutationFn: async () => {
      if (currentGa4 && currentGa4 !== status?.ga4Property) await api.connectGa4(siteId!, currentGa4)
      return api.syncGa4(siteId!)
    },
    onSuccess: (result) => {
      showToast(`GA4 synced — ${result.rowsSynced.toLocaleString()} rows`)
      queryClient.invalidateQueries({ queryKey: ['google-connection', siteId] })
      invalidateSiteData(queryClient, siteId)
    },
    onError: (err: Error) => showToast(err.message),
  })

  if (!siteId) return null

  return (
    <Card style={{ padding: '16px 18px', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Google connector</div>
        {status?.connected && <span style={pill(colors.green, colors.greenBg)}>Connected</span>}
      </div>
      <div style={{ fontSize: 11.5, color: colors.muted2, marginBottom: 14, lineHeight: 1.5 }}>
        Read-only, via OAuth. One connection covers both Search Console and GA4 — each still needs
        its property selected below since an account can have several.
      </div>

      {status?.connected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: colors.text }}>{status.email}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: colors.muted2 }}>Search Console</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <select
                value={currentGsc}
                onChange={(e) => setGscSelection(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="">
                  {gscSitesQuery.isLoading ? 'Loading properties…' : 'Select a property…'}
                </option>
                {(gscSitesQuery.data ?? []).map((url) => (
                  <option key={url} value={url}>
                    {url}
                  </option>
                ))}
              </select>
              <HButton
                onClick={() => {
                  if (gscMutation.isPending || !currentGsc) return
                  gscMutation.mutate()
                }}
                hover={{ background: colors.inkStrong }}
                style={{ ...primaryBtn, opacity: gscMutation.isPending || !currentGsc ? 0.6 : 1 }}
              >
                {gscMutation.isPending ? 'Syncing…' : 'Save & sync'}
              </HButton>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: colors.muted2 }}>Google Analytics 4</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <select
                value={currentGa4}
                onChange={(e) => setGa4Selection(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="">
                  {ga4PropsQuery.isLoading ? 'Loading properties…' : 'Select a property…'}
                </option>
                {(ga4PropsQuery.data ?? []).map((p) => (
                  <option key={p.propertyId} value={p.propertyId}>
                    {p.displayName} ({p.propertyId})
                  </option>
                ))}
              </select>
              <HButton
                onClick={() => {
                  if (ga4Mutation.isPending || !currentGa4) return
                  ga4Mutation.mutate()
                }}
                hover={{ background: colors.inkStrong }}
                style={{ ...primaryBtn, opacity: ga4Mutation.isPending || !currentGa4 ? 0.6 : 1 }}
              >
                {ga4Mutation.isPending ? 'Syncing…' : 'Save & sync'}
              </HButton>
            </div>
          </div>
        </div>
      ) : (
        <HButton
          onClick={() => {
            window.location.href = api.googleAuthStartUrl(siteId)
          }}
          hover={{ background: colors.inkStrong }}
          style={primaryBtn}
        >
          Connect Google Account
        </HButton>
      )}
    </Card>
  )
}

export function SettingsView() {
  const { state } = useStore()
  const { sites } = useData()
  const siteId = useSiteId()
  const site = sites[state.siteIdx]

  const summaryQuery = useQuery({
    queryKey: ['connections-summary', siteId],
    queryFn: () => api.connectionsSummary(siteId!),
    enabled: !!siteId,
  })
  const summary = summaryQuery.data

  const formatSync = (iso: string | null | undefined) => {
    if (!iso) return 'Not synced yet'
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
    if (mins < 2) return 'Synced just now'
    if (mins < 60) return `Synced ${mins} min ago`
    return `Synced ${new Date(iso).toLocaleDateString()}`
  }

  const connectionCards = summary
    ? [
        {
          abbr: 'GSC',
          name: 'Google Search Console',
          detail: summary.gsc.property ? `${summary.gsc.property} · ${formatSync(summary.gsc.lastSyncedAt)}` : 'Connect Google and select a property',
          status: summary.gsc.connected ? 'Connected' : 'Not connected',
          ok: summary.gsc.connected,
        },
        {
          abbr: 'GA4',
          name: 'Google Analytics 4',
          detail: summary.ga4.property ? `Property ${summary.ga4.property} · ${formatSync(summary.ga4.lastSyncedAt)}` : 'Connect Google and select a property',
          status: summary.ga4.connected ? 'Connected' : 'Not connected',
          ok: summary.ga4.connected,
        },
        {
          abbr: 'WP',
          name: 'WordPress',
          detail: summary.wordpress.baseUrl
            ? `${summary.wordpress.baseUrl} · ${summary.wordpress.pageCount} pages · ${formatSync(summary.wordpress.lastSyncedAt)}`
            : 'Connect with an Application Password',
          status: summary.wordpress.connected ? 'Connected' : 'Not connected',
          ok: summary.wordpress.connected,
        },
        {
          abbr: 'EL',
          name: 'Elementor',
          detail: summary.elementor.detail,
          status: summary.elementor.detected ? 'Detected' : 'Unknown',
          ok: summary.elementor.detected,
        },
        {
          abbr: 'SEO',
          name: 'SEO plugin',
          detail: summary.seoPlugin.detail,
          status: summary.seoPlugin.detected
            ? summary.seoPlugin.primary ?? 'Detected'
            : 'Not detected',
          ok: summary.seoPlugin.detected,
        },
        {
          abbr: 'SM',
          name: 'XML Sitemap',
          detail: summary.sitemap.detail,
          status: summary.sitemap.detected ? 'Found' : 'Not found',
          ok: summary.sitemap.detected,
        },
      ]
    : []

  return (
    <div>
      <div style={{ margin: '2px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Connections</h1>
        <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
          Data sources and publish targets for {site.domain}.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <AddClientWizard />
        <WordPressConnector />
        <GoogleConnector />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
        {connectionCards.map((cn) => (
          <Card
            key={cn.abbr}
            style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: colors.chipBg2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: colors.muted,
                flex: 'none',
              }}
            >
              {cn.abbr}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{cn.name}</div>
              <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 1 }}>{cn.detail}</div>
            </div>
            <span style={cn.ok ? pill(colors.green, colors.greenBg) : pill(colors.muted, colors.chipBg)}>
              {cn.status}
            </span>
          </Card>
        ))}
        {summaryQuery.isLoading && (
          <div style={{ fontSize: 12, color: colors.muted2, padding: '8px 4px' }}>Loading connection status…</div>
        )}
      </div>
    </div>
  )
}
