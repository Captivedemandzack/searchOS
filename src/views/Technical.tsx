import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useData, useDataStatus, useSiteId } from '../data/DataProvider'
import { useStore } from '../store'
import { colors, riskPill, th } from '../theme'
import { Card } from '../components/primitives'
import { HButton } from '../lib/Hover'
import { api } from '../lib/api'

const cols = 'minmax(0,1.6fr) 90px 90px 130px 140px'

function formatSyncedAt(iso: string | null | undefined): string {
  if (!iso) return 'Not synced yet'
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60_000)
  if (mins < 2) return 'Synced just now'
  if (mins < 60) return `Synced ${mins} min ago`
  return `Synced ${d.toLocaleDateString()}`
}

export function TechnicalView() {
  const { showToast } = useStore()
  const siteId = useSiteId()
  const queryClient = useQueryClient()
  const { findings, sites } = useData()
  const { state } = useStore()
  const status = useDataStatus()
  const site = sites[state.siteIdx]

  const technicalFindings = findings.filter(
    (f) => f.auditId === 'technical' || f.category === 'Technical',
  )

  const draftFix = useMutation({
    mutationFn: (findingId: string) => api.draftFindingFix(siteId!, findingId),
    onSuccess: () => {
      showToast('Fix drafted — see Review Queue')
      queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      queryClient.invalidateQueries({ queryKey: ['audit-queue', siteId] })
    },
    onError: (err: Error) => showToast(err.message),
  })

  const rows = technicalFindings.map((f) => ({
    id: f.id,
    issue: f.title,
    detail: f.evidence.map((e) => e.detail ?? `${e.metric}: ${e.value}`).join(' · ') || f.source,
    affected: f.subject.label || f.subject.ref,
    severity: f.impact,
    status: f.status === 'open' ? 'Open' : f.status === 'drafted' ? 'Draft ready' : f.status,
    fixReady: f.actions.length > 0 && f.status !== 'done',
  }))

  return (
    <div>
      <div style={{ margin: '2px 0 16px' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: '-.01em' }}>Technical SEO</h1>
        <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
          {status === 'live'
            ? `From WordPress sync · ${formatSyncedAt(site?.lastSyncedAt ?? null)} · ${rows.length} issue${rows.length === 1 ? '' : 's'}`
            : 'Connect WordPress and sync to load technical findings'}
        </div>
      </div>

      <Card style={{ overflow: 'hidden', maxWidth: 980 }}>
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
          <span style={th}>Issue</span>
          <span style={th}>Affected</span>
          <span style={th}>Severity</span>
          <span style={th}>Status</span>
          <span />
        </div>
        {rows.length === 0 && (
          <div style={{ padding: 24, fontSize: 12.5, color: colors.muted2, textAlign: 'center' }}>
            {status === 'live'
              ? 'No technical issues detected. Sync WordPress to refresh plugin, sitemap, and redirect checks.'
              : 'Loading technical findings…'}
          </div>
        )}
        {rows.map((ti) => (
          <div
            key={ti.id}
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              gap: 12,
              padding: '12px 18px',
              borderBottom: `1px solid ${colors.hair3}`,
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink }}>{ti.issue}</div>
              <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 1 }}>{ti.detail}</div>
            </div>
            <span style={{ fontSize: 12, color: colors.text }}>{ti.affected}</span>
            <span style={riskPill(ti.severity)}>{ti.severity}</span>
            <span style={{ fontSize: 12, color: colors.muted }}>{ti.status}</span>
            {ti.fixReady ? (
              <HButton
                onClick={() => siteId && draftFix.mutate(ti.id)}
                hover={{ background: '#f6f6f1' }}
                style={{
                  background: '#fff',
                  border: `1px solid ${colors.borderBtn}`,
                  borderRadius: 7,
                  padding: '5px 10px',
                  fontSize: 11.5,
                  fontWeight: 550,
                  color: colors.ink,
                  justifySelf: 'end',
                  opacity: draftFix.isPending ? 0.6 : 1,
                }}
              >
                Queue fix
              </HButton>
            ) : (
              <span />
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}
