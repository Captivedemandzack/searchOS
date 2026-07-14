/**
 * Diagnostic: inspect a live WordPress post/page's real structure so we can
 * verify where content (and our FAQ) actually renders — Elementor builder data
 * vs post_content vs Single Post template.
 *
 * Usage: bun run src/scripts/inspectPage.ts [domain] [slug-or-path]
 */
import { prisma } from '../db'
import { decrypt } from '../crypto'

const domain = process.argv[2] ?? 'slkclinic.com'
const needle = process.argv[3] ?? 'which-botox-lasts-the-longest-a-comparison-of-botulinum-toxins'

function authHeader(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

async function wpFetch(baseUrl: string, auth: string, path: string) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/wp-json${path}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  })
  const text = await res.text()
  try {
    return { status: res.status, body: JSON.parse(text) as unknown }
  } catch {
    return { status: res.status, body: text }
  }
}

function has(hay: string | null | undefined, sub: string): boolean {
  return !!hay && hay.toLowerCase().includes(sub.toLowerCase())
}

async function main() {
  const site = await prisma.site.findFirst({ where: { domain } })
  if (!site?.wpUsername || !site.wpAppPasswordEnc) throw new Error(`No WP creds for ${domain}`)
  const auth = authHeader(site.wpUsername, decrypt(site.wpAppPasswordEnc))
  const baseUrl = `https://${domain}`

  const slug = needle.split('/').filter(Boolean).pop()!
  const found = await wpFetch(
    baseUrl,
    auth,
    `/wp/v2/posts?slug=${encodeURIComponent(slug)}&context=edit&_fields=id,slug,link,content,meta,groundwork_elementor,template`,
  )
  const arr = Array.isArray(found.body) ? (found.body as Record<string, unknown>[]) : []
  const post = arr[0]
  if (!post) {
    console.log('No post found for slug:', slug, '\nResponse:', found.status, found.body)
    await prisma.$disconnect()
    return
  }

  const content = post.content as { rendered?: string; raw?: string } | undefined
  const gw = post.groundwork_elementor as
    | { data?: string | null; edit_mode?: string | null; version?: string | null }
    | undefined
  const rendered = content?.rendered ?? ''
  const raw = content?.raw ?? ''
  const elementorData = gw?.data ?? null

  console.log('=== POST', post.id, '·', post.slug, '===')
  console.log('link:', post.link)
  console.log('template:', post.template || '(default/theme)')
  console.log('')
  console.log('--- Elementor builder ---')
  console.log('edit_mode:', gw?.edit_mode ?? '(none)')
  console.log('elementor version:', gw?.version ?? '(none)')
  console.log('has _elementor_data:', !!elementorData, elementorData ? `(${elementorData.length} chars)` : '')
  console.log('elementor_data mentions FAQ:', has(elementorData, 'faq') || has(elementorData, 'frequently asked'))
  console.log('elementor_data has groundwork marker:', has(elementorData, 'groundwork-faq') || has(elementorData, '_groundwork_faq_section'))
  console.log('')
  console.log('--- post_content ---')
  console.log('raw length:', raw.length, '· rendered length:', rendered.length)
  console.log('post_content has groundwork-faq marker:', has(raw, 'groundwork-faq') || has(rendered, 'groundwork-faq'))
  console.log('post_content mentions "frequently asked":', has(raw, 'frequently asked') || has(rendered, 'frequently asked'))
  console.log('')
  console.log('--- Interpretation ---')
  if (elementorData && (gw?.edit_mode === 'builder')) {
    console.log('This POST is built directly in Elementor (edit_mode=builder).')
    console.log('=> The frontend renders _elementor_data, NOT raw post_content.')
    console.log('=> FAQ appended to post_content will NOT appear. It must go into _elementor_data.')
  } else if (elementorData) {
    console.log('Post has _elementor_data but edit_mode is not "builder" — ambiguous; verify on frontend.')
  } else {
    console.log('No _elementor_data on the post itself.')
    console.log('=> Frontend renders post_content (likely inside a Theme Builder Single template).')
    console.log('=> FAQ appended to post_content SHOULD appear.')
  }

  // Local DB view
  const pageRow = await prisma.page.findFirst({
    where: { siteId: site.id, slug },
    select: { id: true, type: true, wpId: true, elementorData: true, contentHtml: true },
  })
  console.log('')
  console.log('--- Local DB (Page row) ---')
  if (pageRow) {
    console.log('type:', pageRow.type, '· wpId:', pageRow.wpId)
    console.log('local elementorData:', !!pageRow.elementorData, pageRow.elementorData ? `(${pageRow.elementorData.length} chars)` : '')
    console.log('local contentHtml has groundwork-faq:', has(pageRow.contentHtml, 'groundwork-faq'))
  } else {
    console.log('No local Page row for slug', slug, '(needs sync)')
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
