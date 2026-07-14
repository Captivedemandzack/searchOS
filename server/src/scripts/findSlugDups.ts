process.loadEnvFile('.env.local')
import { prisma } from '../db.ts'
import { decrypt } from '../crypto.ts'
import { fetchWpContent } from '../wordpress.ts'

const site = await prisma.site.findFirst({ where: { domain: 'slkclinic.com' } })
if (!site?.wpBaseUrl || !site.wpUsername || !site.wpAppPasswordEnc) {
  throw new Error('SLK not connected')
}
const auth = {
  baseUrl: site.wpBaseUrl,
  username: site.wpUsername,
  appPassword: decrypt(site.wpAppPasswordEnc),
}
const content = await fetchWpContent(auth)
const bySlug = new Map<string, { id: number; type: string; link: string }[]>()
for (const item of content) {
  const list = bySlug.get(item.slug) ?? []
  list.push({ id: item.id, type: item.contentType, link: item.link })
  bySlug.set(item.slug, list)
}
const dups = [...bySlug.entries()].filter(([, v]) => v.length > 1)
console.log('total items', content.length, 'duplicate slugs', dups.length)
for (const [slug, items] of dups) {
  console.log(slug, JSON.stringify(items))
}
