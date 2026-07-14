/**
 * Post-push verification: after writing to WordPress, fetch the LIVE page and
 * confirm each change actually rendered. This closes the loop so we never again
 * assume a push worked — we prove it against the real frontend + REST output.
 */
import { authHeader, normalizeBaseUrl, type WpAuth } from './wordpress.ts'
import { collectSchemaTypes, extractLiveSchemaFromWpItem } from './schema.ts'

export type VerifyCheck = {
  label: string
  ok: boolean
  detail: string
}

export type PublishVerification = {
  ok: boolean
  checkedAt: string
  verifiedUrl: string | null
  checks: VerifyCheck[]
}

export type VerifyExpectations = {
  link: string | null
  contentType: 'page' | 'post'
  wpId: number
  faqQuestions?: string[]
  faqAnswers?: string[]
  linkHrefs?: string[]
  title?: string | null
  metaDesc?: string | null
  schemaTypes?: string[]
}

function textIncludes(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle))
}

function normalize(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

/** Fetch the public frontend HTML (no auth) with cache-buster. */
async function fetchFrontendHtml(link: string): Promise<string | null> {
  try {
    const url = `${link}${link.includes('?') ? '&' : '?'}_gwverify=${Date.now()}`
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Fetch the REST item (edit context) for meta/schema verification. */
async function fetchRestItem(
  auth: WpAuth,
  contentType: 'page' | 'post',
  wpId: number,
): Promise<Record<string, unknown> | null> {
  try {
    const base = normalizeBaseUrl(auth.baseUrl)
    const type = contentType === 'post' ? 'posts' : 'pages'
    const res = await fetch(
      `${base}/wp-json/wp/v2/${type}/${wpId}?context=edit&_fields=yoast_head_json,rank_math_schema,content`,
      { headers: { Authorization: authHeader(auth) } },
    )
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function verifyContentPublish(
  auth: WpAuth,
  expect: VerifyExpectations,
): Promise<PublishVerification> {
  const checks: VerifyCheck[] = []
  const needsFrontend = !!(expect.faqQuestions?.length || expect.linkHrefs?.length)
  const needsRest = !!(expect.title || expect.metaDesc || expect.schemaTypes?.length)

  const html = needsFrontend && expect.link ? await fetchFrontendHtml(expect.link) : null
  const item = needsRest ? await fetchRestItem(auth, expect.contentType, expect.wpId) : null

  if (expect.faqQuestions?.length) {
    if (!html) {
      checks.push({ label: 'FAQ questions', ok: false, detail: 'Could not fetch the live page to verify.' })
    } else {
      const missing = expect.faqQuestions.filter((q) => !textIncludes(html, q))
      checks.push({
        label: 'FAQ questions',
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? `All ${expect.faqQuestions.length} FAQ questions render on the live page.`
            : `${missing.length} of ${expect.faqQuestions.length} questions not found live: ${missing[0].slice(0, 60)}…`,
      })
    }
  }

  // Answers must render too — the previous stacked layout showed blank answers,
  // which the question-only check happily passed. Sample the first sentence of
  // each answer so minor HTML wrapping doesn't cause false negatives.
  if (expect.faqAnswers?.length && html) {
    const sample = (a: string) => a.replace(/<[^>]+>/g, ' ').trim().split(/[.!?]/)[0]?.trim() ?? ''
    const checkable = expect.faqAnswers.map(sample).filter((s) => s.length >= 12)
    const missing = checkable.filter((s) => !textIncludes(html, s))
    checks.push({
      label: 'FAQ answers',
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `Answer copy renders for all ${checkable.length} questions.`
          : `${missing.length} answer(s) not found live (blank or hidden?): “${missing[0].slice(0, 50)}…”`,
    })
  }

  if (expect.faqQuestions?.length && html) {
    const lower = normalize(html)
    const firstQ = normalize(expect.faqQuestions[0]).slice(0, 40)
    const faqPos = lower.indexOf(firstQ)
    const ctaPos = lower.indexOf('book your free consultation')
    if (ctaPos >= 0 && faqPos >= 0) {
      checks.push({
        label: 'FAQ placement',
        ok: faqPos < ctaPos,
        detail:
          faqPos < ctaPos
            ? 'FAQ sits before the final consultation CTA.'
            : 'FAQ appears after the consultation CTA; it should come before.',
      })
    }
  }

  if (expect.linkHrefs?.length) {
    if (!html) {
      checks.push({ label: 'Internal links', ok: false, detail: 'Could not fetch the live page to verify.' })
    } else {
      const missing = expect.linkHrefs.filter((href) => !html.includes(`href="${href}"`) && !html.includes(`href='${href}'`))
      checks.push({
        label: 'Internal links',
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? `All ${expect.linkHrefs.length} internal links are live.`
            : `${missing.length} link(s) not found live: ${missing[0]}`,
      })
    }
  }

  if (expect.title) {
    const yoast = item?.yoast_head_json as { title?: string } | undefined
    const liveTitle = yoast?.title ?? ''
    checks.push({
      label: 'SEO title',
      ok: !!liveTitle && textIncludes(liveTitle, expect.title.slice(0, 40)),
      detail: liveTitle ? `Live title: ${liveTitle}` : 'Could not read live SEO title.',
    })
  }

  if (expect.metaDesc) {
    const yoast = item?.yoast_head_json as { description?: string } | undefined
    const liveDesc = yoast?.description ?? ''
    checks.push({
      label: 'Meta description',
      ok: !!liveDesc && textIncludes(liveDesc, expect.metaDesc.slice(0, 40)),
      detail: liveDesc ? 'Meta description updated live.' : 'Could not read live meta description.',
    })
  }

  if (expect.schemaTypes?.length) {
    const liveSchema = item ? extractLiveSchemaFromWpItem(item) : null
    const liveTypes = collectSchemaTypes(liveSchema)
    const missing = expect.schemaTypes.filter((t) => !liveTypes.includes(t))
    checks.push({
      label: 'Schema graph',
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `Live graph now includes ${expect.schemaTypes.join(', ')}.`
          : `Missing from live Yoast graph: ${missing.join(', ')}.`,
    })
  }

  return {
    ok: checks.length > 0 && checks.every((c) => c.ok),
    checkedAt: new Date().toISOString(),
    verifiedUrl: expect.link,
    checks,
  }
}
