/**
 * Google OAuth + read clients for Search Console and GA4.
 *
 * Uses `google-auth-library` for the OAuth2 dance and token refresh only —
 * every API call is a direct fetch against the stable v3/v1beta REST
 * endpoints rather than the full `googleapis` meta-package, which bundles
 * hundreds of unrelated API clients we don't need.
 */
import { OAuth2Client } from 'google-auth-library'

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
]

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be set in server/.env.local — create an OAuth client in Google Cloud Console and fill them in.',
    )
  }
  return { clientId, clientSecret, redirectUri }
}

function newOAuthClient(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig()
  return new OAuth2Client({ clientId, clientSecret, redirectUri })
}

/** Build the URL to send the browser to for the Google consent screen. `state` round-trips the siteId. */
export function getGoogleAuthUrl(state: string): string {
  const client = newOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token even on a repeat connect from the same account
    scope: SCOPES,
    state,
  })
}

/** Exchanges the OAuth `code` from the callback for a refresh token + the connected account's email. */
export async function exchangeGoogleCode(code: string): Promise<{ refreshToken: string; email: string }> {
  const client = newOAuthClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. If you\'ve connected this account before, revoke Groundwork\'s access at https://myaccount.google.com/permissions and try connecting again.',
    )
  }
  client.setCredentials(tokens)
  const res = await client.request<{ email: string }>({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' })
  return { refreshToken: tokens.refresh_token, email: res.data.email }
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const client = newOAuthClient()
  client.setCredentials({ refresh_token: refreshToken })
  const { token } = await client.getAccessToken()
  if (!token) throw new Error('Failed to refresh Google access token — the connection may need to be re-authorized')
  return token
}

// ---------------------------------------------------------------------------
// Search Console
// ---------------------------------------------------------------------------

/** Verified sites/domain properties this account can read — for the property picker. */
export async function listGscSites(refreshToken: string): Promise<string[]> {
  const token = await getAccessToken(refreshToken)
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Search Console sites.list failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const json = (await res.json()) as { siteEntry?: { siteUrl: string }[] }
  return (json.siteEntry ?? []).map((s) => s.siteUrl)
}

export type GscRowResult = {
  date: string
  page: string
  query: string | null
  clicks: number
  impressions: number
  ctr: number
  position: number
}

async function queryGscAnalytics(
  refreshToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
): Promise<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[]> {
  const token = await getAccessToken(refreshToken)
  const rowLimit = 25_000 // GSC's hard per-request cap
  const rows: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] = []
  let startRow = 0

  while (true) {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, dimensions, rowLimit, startRow }),
      },
    )
    if (!res.ok) {
      throw new Error(`Search Console searchAnalytics.query failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
    }
    const json = (await res.json()) as { rows?: typeof rows }
    const batch = json.rows ?? []
    for (const r of batch) rows.push(r) // avoid spread — batches reach 25k rows
    if (batch.length < rowLimit) break
    startRow += rowLimit
    if (startRow > 200_000) break // safety cap — v1 sites won't get near this
  }

  return rows
}

/**
 * Pulls two datasets and returns them combined: page-level daily (query=null,
 * powers overview trends/metrics/score) and page+query-level daily (powers
 * per-page query breakdowns and opportunity reasoning). Kept to two
 * dimension-sets rather than one 3-dimension pull per the PRD's anonymization
 * guidance — GSC returns fewer/more-suppressed rows as dimension count grows.
 *
 * The two sets use different windows: the page-level set spans the full history
 * (up to GSC's 16-month cap) so the Overview date range can show 28/90/365-day
 * views; the page+query set — much larger, and only ever needed for the recent
 * "act now" horizon — is capped to a shorter window to keep syncs fast.
 */
export async function fetchGscData(
  refreshToken: string,
  siteUrl: string,
  pageRange: { startDate: string; endDate: string },
  queryRange: { startDate: string; endDate: string },
): Promise<GscRowResult[]> {
  const [pageRows, queryRows] = await Promise.all([
    queryGscAnalytics(refreshToken, siteUrl, pageRange.startDate, pageRange.endDate, ['date', 'page']),
    queryGscAnalytics(refreshToken, siteUrl, queryRange.startDate, queryRange.endDate, ['date', 'page', 'query']),
  ])

  const toResult = (r: (typeof pageRows)[number], hasQuery: boolean): GscRowResult => ({
    date: r.keys[0],
    page: r.keys[1],
    query: hasQuery ? r.keys[2] : null,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  })

  return [...pageRows.map((r) => toResult(r, false)), ...queryRows.map((r) => toResult(r, true))]
}

// ---------------------------------------------------------------------------
// GA4
// ---------------------------------------------------------------------------

/** GA4 properties this account can read — for the property picker. */
export async function listGa4Properties(refreshToken: string): Promise<{ propertyId: string; displayName: string }[]> {
  const token = await getAccessToken(refreshToken)
  const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`GA4 accountSummaries.list failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const json = (await res.json()) as {
    accountSummaries?: { propertySummaries?: { property: string; displayName: string }[] }[]
  }
  const out: { propertyId: string; displayName: string }[] = []
  for (const account of json.accountSummaries ?? []) {
    for (const p of account.propertySummaries ?? []) {
      out.push({ propertyId: p.property.replace('properties/', ''), displayName: p.displayName })
    }
  }
  return out
}

export type Ga4RowResult = {
  date: string // normalized to YYYY-MM-DD
  landingPage: string
  sessions: number
  engagementRate: number
  conversions: number
}

function parseGa4Date(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

export async function fetchGa4Data(
  refreshToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4RowResult[]> {
  const token = await getAccessToken(refreshToken)
  const rows: Ga4RowResult[] = []
  const limit = 100_000
  let offset = 0

  while (true) {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }, { name: 'landingPage' }],
        metrics: [{ name: 'sessions' }, { name: 'engagementRate' }, { name: 'conversions' }],
        limit,
        offset,
        returnPropertyQuota: true,
      }),
    })
    if (!res.ok) throw new Error(`GA4 runReport failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as {
      rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]
      rowCount?: number
    }
    for (const r of json.rows ?? []) {
      rows.push({
        date: parseGa4Date(r.dimensionValues[0].value),
        landingPage: r.dimensionValues[1].value,
        sessions: Number(r.metricValues[0].value),
        engagementRate: Number(r.metricValues[1].value),
        conversions: Number(r.metricValues[2].value),
      })
    }
    const total = json.rowCount ?? rows.length
    offset += limit
    if (offset >= total || !json.rows?.length) break
  }

  return rows
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// GSC data lags 2-3 days, so every window ends 3 days back.
function endMinus3(): Date {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 3)
  return end
}

function rangeBack(days: number, end: Date): { startDate: string; endDate: string } {
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return { startDate: fmt(start), endDate: fmt(end) }
}

// Page-level history: 485 days (~16 months, GSC's cap) so the Overview date
// range can render real 28 / 90 / 365-day windows — with a prior period for the
// 28- and 90-day views (365-day gets no prior since 2 years exceeds the cap).
export function defaultGscPageRange(): { startDate: string; endDate: string } {
  return rangeBack(485, endMinus3())
}

// Page+query history: 120 days — enough for the 28-day opportunity window plus a
// 90-day query-opportunities view. Keeps the (much larger) query-level pull fast.
export function defaultGscQueryRange(): { startDate: string; endDate: string } {
  return rangeBack(120, endMinus3())
}

/** Full page-level date span covered by a sync — used to clear the sync window. */
export function defaultGscRange(): { startDate: string; endDate: string } {
  return defaultGscPageRange()
}

/** GA4 has no comparable lag; trailing 485 days to match the GSC page history. */
export function defaultGa4Range(): { startDate: string; endDate: string } {
  const end = new Date()
  return rangeBack(485, end)
}
