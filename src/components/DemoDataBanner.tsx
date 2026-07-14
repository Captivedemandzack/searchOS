import { useDataStatus } from '../data/DataProvider'

/** Visible when the API is unreachable — seed data must never look like live client data. */
export function DemoDataBanner() {
  const status = useDataStatus()
  if (status !== 'fallback') return null

  return (
    <div
      role="status"
      style={{
        marginBottom: 16,
        padding: '10px 14px',
        borderRadius: 8,
        background: '#fff8e6',
        border: '1px solid #f0d78c',
        fontSize: 12.5,
        color: '#6b5a1e',
        lineHeight: 1.5,
      }}
    >
      <strong style={{ fontWeight: 600 }}>Offline demo data.</strong> The API server is not reachable, so
      numbers, findings, and connections below are sample data only. Start the server (
      <code style={{ fontSize: 11.5 }}>cd server && bun run dev</code>
      ), connect WordPress and Google in Settings, then Refresh to work with live data.
    </div>
  )
}
