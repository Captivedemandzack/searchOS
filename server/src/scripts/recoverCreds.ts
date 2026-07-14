/**
 * Carve SLK connection credentials from dev.db freelist after accidental seed.
 * Usage: bunx tsx src/scripts/recoverCreds.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decrypt } from '../crypto.ts'

process.loadEnvFile('.env.local')

const __dir = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dir, '../../prisma/dev.db')
const data = fs.readFileSync(dbPath)

const marker = Buffer.from('slkclinic.comhttps://slkclinic.comsc-domain:slkclinic.com373905967')
const pos = data.indexOf(marker)
if (pos === -1) throw new Error('Site marker not found in dev.db')

const chunk = data.subarray(pos + marker.length, pos + marker.length + 600).toString('latin1')
const text = chunk.replace(/^[^\w+/]+/, '')
const [wpEnc, rest] = text.split('SLKAdmin', 2)
if (!rest?.startsWith('zachary@captivedemand.com')) throw new Error('Unexpected Site row layout')

const email = 'zachary@captivedemand.com'
const rec = {
  wpBaseUrl: 'https://slkclinic.com',
  wpUsername: 'SLKAdmin',
  wpAppPasswordEnc: wpEnc,
  googleEmail: email,
  gscProperty: 'sc-domain:slkclinic.com',
  ga4Property: '373905967',
}

const wpPlain = decrypt(rec.wpAppPasswordEnc)

let googleEnc: string | null = null
const afterEmail = rest.slice(email.length)
const b64Prefix = afterEmail.match(/^[A-Za-z0-9+/=]+/)?.[0] ?? ''
for (let len = 60; len <= b64Prefix.length; len++) {
  try {
    if (decrypt(b64Prefix.slice(0, len)).length > 20) {
      googleEnc = b64Prefix.slice(0, len)
      break
    }
  } catch {
    /* keep trying */
  }
}

console.log('Recovered from dev.db freelist:')
console.log('  WordPress:', rec.wpBaseUrl, 'user', rec.wpUsername, `(${wpPlain.length}-char app password)`)
console.log('  GSC property:', rec.gscProperty)
console.log('  GA4 property:', rec.ga4Property, '(seed had wrong id 384920117)')
console.log('  Google email:', email)
console.log(
  googleEnc
    ? `  Google refresh token: recovered (${googleEnc.length} chars)`
    : '  Google refresh token: NOT recoverable — re-connect Google in Settings',
)

const { prisma } = await import('../db.ts')
const site = await prisma.site.findFirst({ where: { domain: 'slkclinic.com' } })
if (!site) throw new Error('SLK site row not found')

await prisma.site.update({
  where: { id: site.id },
  data: {
    wpBaseUrl: rec.wpBaseUrl,
    wpUsername: rec.wpUsername,
    wpAppPasswordEnc: rec.wpAppPasswordEnc,
    googleEmail: rec.googleEmail,
    ...(googleEnc ? { googleRefreshTokenEnc: googleEnc } : {}),
    gscProperty: rec.gscProperty,
    ga4Property: rec.ga4Property,
  },
})

console.log('\nRestored Site row for', site.domain)
console.log('Next steps:')
console.log('  1. Settings → Connect Google (OAuth) if token was not recovered')
console.log('  2. Overview → Refresh to re-sync pages, GSC, and GA4')
