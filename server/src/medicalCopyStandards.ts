/**
 * Medical spa copy standards: YMYL/E-E-A-T, voice rules, and author attribution.
 * Used by Claude prompts and post-processing for all generated on-page copy.
 */
import { prisma } from './db.ts'

export type AuthorContext = {
  /** Credentialed provider name with credentials, e.g. "Jennifer Steinberg, NP". */
  primaryAuthor: string
  /** Site-relative path to the team/about page for byline links. */
  teamPagePath: string
  authors: { name: string; sourcePage?: string }[]
}

const TEAM_SLUG_RE = /^(team|about|staff|providers|our-team|meet-the-team|meet-our-team)/i

/** Strip section headings and return a credentialed provider name when possible. */
function parseAuthorName(raw: string): string | null {
  const n = raw.trim()
  if (!n || n.length < 4) return null
  if (/^(more info|our nurses|our staff|collaborating physician)/i.test(n)) return null
  if (/jennifer\s+stieb/i.test(n)) return 'Jennifer Steinberg, NP'
  if (/\b(Dr\.|MD|DO|NP|PA-C|RN)\b/i.test(n) && n.split(/\s+/).length >= 2) return n
  const titleCase = n.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ')
  if (titleCase.split(' ').length >= 2 && !/^Our /i.test(titleCase)) return titleCase
  return null
}

/** Load author facts and team page path for a site. */
export async function loadAuthorContext(siteId: string): Promise<AuthorContext> {
  const [authorFacts, pages] = await Promise.all([
    prisma.siteFact.findMany({ where: { siteId, kind: 'author' } }),
    prisma.page.findMany({ where: { siteId }, select: { slug: true, title: true } }),
  ])

  const authors = authorFacts
    .map((f) => {
      const v = f.value as { name?: string; sourcePage?: string }
      const raw = (v.name ?? f.key).trim()
      const name = parseAuthorName(raw)
      if (!name) return null
      return { name, sourcePage: v.sourcePage }
    })
    .filter((a): a is { name: string; sourcePage?: string } => a !== null)

  const teamFromFact = authorFacts
    .map((f) => (f.value as { sourcePage?: string }).sourcePage)
    .find((s) => s && TEAM_SLUG_RE.test(s))
  const teamPage =
    (teamFromFact ? pages.find((p) => p.slug === teamFromFact) : null) ??
    pages.find((p) => TEAM_SLUG_RE.test(p.slug)) ??
    pages.find((p) => /team|staff|providers|about us/i.test(p.title ?? ''))
  const teamPagePath = teamFromFact
    ? `/${teamFromFact}`
    : teamPage
      ? `/${teamPage.slug}`
      : '/our-team'

  const primaryAuthor =
    authors.find((a) => /steinberg|stieber/i.test(a.name))?.name ??
    authors.find((a) => /\bNP\b/i.test(a.name))?.name ??
    authors.find((a) => /\b(MD|DO|PA-C)\b/i.test(a.name))?.name ??
    authors[0]?.name ??
    'Jennifer Steinberg, NP'

  return { primaryAuthor, teamPagePath, authors }
}

/** HTML byline pattern for body copy suggestions. */
export function formatAuthorBylineHtml(ctx: AuthorContext): string {
  return `<p>By <a href="${ctx.teamPagePath}">${ctx.primaryAuthor}</a></p>`
}

/** Prompt block injected into Claude user messages for clinical content. */
export function authorContextPromptBlock(ctx: AuthorContext): string {
  const authorList = ctx.authors.length
    ? ctx.authors.map((a) => `- ${a.name}`).join('\n')
    : `- ${ctx.primaryAuthor}`
  return [
    'YMYL / E-E-A-T author attribution:',
    `Primary credentialed author: ${ctx.primaryAuthor}`,
    `Team page (link all bylines here): ${ctx.teamPagePath}`,
    'Known credentialed authors on this site:',
    authorList,
    `Byline HTML pattern: By <a href="${ctx.teamPagePath}">${ctx.primaryAuthor}</a>`,
  ].join('\n')
}

/** Voice rules shared across meta, on-page, and blog generation. */
export const MED_SPA_VOICE_RULES = `VOICE — write like a real, knowledgeable human, not an AI:
- NEVER use em dashes (—) or en dashes (–). Use commas, periods, or parentheses instead. For number ranges use a hyphen (e.g. "6-10 weeks").
- Warm, clear, conversational-professional. Vary sentence length. Contractions are fine.
- Avoid AI-tell clichés and filler: "in today's world", "when it comes to", "unlock", "elevate", "dive in", "look no further", "nestled", "in conclusion", "it's important to note", "rest assured", "game-changer", "boasts". No hype or fluff.
- Say concrete things a Nashville patient actually cares about. No throat-clearing intros.`

/** YMYL / E-E-A-T rules for medical spa content. */
export const YMYL_EEAT_RULES = `YMYL / E-E-A-T (medical spa content):
- This is Your Money Your Life (YMYL) content. Demonstrate Experience, Expertise, Authoritativeness, and Trustworthiness.
- NEVER remove existing studies, statistics, citations, credentials, pricing, or other factual clinical details from the page. All suggestions are ADDITIVE: improve clarity and query coverage while preserving factual content already on the page.
- When expanding body copy on clinical topics, include or preserve a credentialed author byline linked to the team page unless one already exists in the current content.
- Do not invent medical outcomes, prices, or study results. Use only facts present in the provided page content or well-established general knowledge.
- Use accurate, cautious language. Where appropriate, note that individual results vary and treatment should be from a licensed provider.`

/** On-page SEO heading hierarchy rules. */
export const SEO_HEADING_RULES = `SEO heading rules (non-negotiable):
- Exactly one H1 per page. Multiple H1s hurt rankings and accessibility.
- WordPress blog posts: the post title is the only H1. All in-body headings are H2 or H3.
- Service/landing pages: one H1, then H2/H3 for sections. Never skip levels without reason.`
