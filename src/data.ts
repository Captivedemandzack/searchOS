/**
 * Static dummy data for Groundwork — a Nashville med-spa (SLK Clinic) SEO account.
 * Ported verbatim from the design prototype. All numbers are realistic-but-fictional.
 */

export type ViewId =
  | 'overview'
  | 'audit'
  | 'act'
  | 'opportunities'
  | 'pages'
  | 'editor'
  | 'studio'
  | 'elementor'
  | 'competitors'
  | 'technical'
  | 'review'
  | 'impact'
  | 'settings'

export type Site = { name: string; domain: string }

export const sites: Site[] = [
  { name: 'SLK Clinic', domain: 'slkclinic.com' },
  { name: 'Music City Plumbing', domain: 'musiccityplumbing.co' },
  { name: 'Belle Meade Dental', domain: 'bellemeadedental.com' },
]

export type Opportunity = {
  id: string
  title: string
  page: string
  why: string
  expected: string
  impact: 'High' | 'Medium' | 'Low'
  confidence: number
  effort: 'Low' | 'Medium' | 'High'
  source: 'GSC' | 'GA4' | 'Crawl' | 'Competitor' | 'Manual'
  type: 'Metadata' | 'Content' | 'Internal links' | 'Schema' | 'Technical' | 'New page'
  status?: string // persisted checklist status: Open | Drafted | Done | Dismissed
}

export const opps: Opportunity[] = [
  { id: 'o1', title: 'Rewrite title tags for high-impression, low-CTR queries', page: '/botox-nashville', why: '41.2k impressions at 1.1% CTR — expected 3.4% at position 4.8', expected: '+310 clicks/mo', impact: 'High', confidence: 92, effort: 'Low', source: 'GSC', type: 'Metadata' },
  { id: 'o2', title: 'Refresh service page content for “Botox Nashville”', page: '/botox-nashville', why: 'Content 14 months old; slipped #4 → #7 while two competitors refreshed', expected: '+220 clicks/mo', impact: 'High', confidence: 84, effort: 'Medium', source: 'GSC', type: 'Content' },
  { id: 'o3', title: 'Add local-intent section to lip filler page', page: '/lip-fillers', why: '“lip fillers nashville” stuck at position 11 — no local signals on page', expected: '+180 clicks/mo', impact: 'High', confidence: 81, effort: 'Medium', source: 'GSC', type: 'Content' },
  { id: 'o4', title: 'Create comparison page: Botox vs Dysport', page: 'new page', why: 'Skin Solutions ranks #3 for “botox vs dysport” (2.9k/mo) — you have no page', expected: '+150 clicks/mo', impact: 'High', confidence: 76, effort: 'High', source: 'Competitor', type: 'New page' },
  { id: 'o5', title: 'Add internal links to underperforming landing pages', page: '/laser-hair-removal +2', why: 'Only 2 internal links point here; 9 relevant pages could link with exact anchors', expected: '+90 clicks/mo', impact: 'Medium', confidence: 88, effort: 'Low', source: 'Crawl', type: 'Internal links' },
  { id: 'o6', title: 'Add FAQ schema to pages with question-based queries', page: '/coolsculpting', why: '23 question queries in GSC; competitors hold the FAQ rich results', expected: '+70 clicks/mo', impact: 'Medium', confidence: 90, effort: 'Low', source: 'GSC', type: 'Schema' },
  { id: 'o7', title: 'Rewrite meta description on HydraFacial page', page: '/hydrafacial', why: 'CTR 0.8% vs 2.6% expected — description truncates and has no offer', expected: '+55 clicks/mo', impact: 'Medium', confidence: 87, effort: 'Low', source: 'GSC', type: 'Metadata' },
  { id: 'o8', title: 'Fix 6 pages with missing H1s', page: '6 service pages', why: 'Crawl found template variant that renders the H1 as a styled div', expected: 'Hygiene', impact: 'Medium', confidence: 99, effort: 'Low', source: 'Crawl', type: 'Technical' },
  { id: 'o9', title: 'Create “Laser Hair Removal Cost” guide', page: 'new page', why: 'Franklin Skin & Laser ranks #2 for cost queries (1.6k/mo combined)', expected: '+120 clicks/mo', impact: 'Medium', confidence: 72, effort: 'High', source: 'Competitor', type: 'New page' },
  { id: 'o10', title: 'Deduplicate meta descriptions on 9 service pages', page: '9 pages', why: 'Same template description across services — Google rewrites most of them', expected: 'Hygiene', impact: 'Low', confidence: 99, effort: 'Low', source: 'Crawl', type: 'Technical' },
  { id: 'o11', title: 'Recover declining chemical peels page', page: '/chemical-peels', why: 'GA4 organic sessions −11% QoQ; top query dropped to page 2', expected: '+60 clicks/mo', impact: 'Medium', confidence: 74, effort: 'Medium', source: 'GA4', type: 'Content' },
  { id: 'o12', title: 'Add pricing section to laser hair removal page', page: '/laser-hair-removal', why: 'Top-10 results all show pricing; page has none. Marked by your strategist', expected: '+140 clicks/mo', impact: 'High', confidence: 83, effort: 'Medium', source: 'Manual', type: 'Content' },
]

export type EditorItem = {
  id: string
  page: string
  type?: string // "page" | "post" — WordPress content type of the target page
  current: string
  suggested: string
  elementorJson?: string | null
  reason: string
  queries: string[]
  chars: boolean
}

/** Storage keys from the API — title and meta are grouped in the SEO tab in the UI. */
export type RecommendationTabId = 'title' | 'meta' | 'headings' | 'body' | 'faq' | 'schema' | 'links'

/** Editor navigation tabs (seo = title tag + meta description together). */
export type EditorTabId = 'seo' | 'headings' | 'body' | 'faq' | 'schema' | 'links'

export const editorData: Record<RecommendationTabId, EditorItem[]> = {
  title: [
    { id: 'e1', page: '/botox-nashville', current: 'Botox Nashville | SLK Clinic', suggested: 'Botox in Nashville: Pricing & Same-Week Appointments | SLK', reason: '“botox nashville cost” gets 9.4k impressions at 0.9% CTR. Titles with explicit pricing intent average 2.8× CTR on this site’s service pages.', queries: ['botox nashville cost', 'botox nashville', 'botox specials nashville'], chars: true },
    { id: 'e2', page: '/laser-hair-removal', current: 'Laser Hair Removal | SLK Clinic', suggested: 'Laser Hair Removal Nashville — Prices & Packages | SLK', reason: 'No geo modifier in the current title despite 78% of impressions coming from Nashville-modified queries.', queries: ['laser hair removal nashville', 'laser hair removal cost nashville'], chars: true },
  ],
  meta: [
    { id: 'e3', page: '/hydrafacial', current: 'SLK Clinic offers HydraFacial treatments. Contact us today to learn more about our services and book your appointment.', suggested: 'HydraFacial in Nashville from $179 — deep cleanse, extraction & hydration in 45 minutes. Same-week booking at SLK Clinic, Green Hills.', reason: 'Current description is generic; Google rewrites it 71% of the time. New version includes price anchor, duration, and location.', queries: ['hydrafacial nashville', 'hydrafacial cost'], chars: true },
  ],
  headings: [
    { id: 'e4', page: '/botox-nashville', current: 'H2: Why Choose SLK Clinic', suggested: 'H2: How Much Does Botox Cost in Nashville?', reason: 'Matches the highest-impression question query on this page. Existing “Why choose us” section keeps its content under the new heading with a pricing table added above.', queries: ['how much does botox cost in nashville'], chars: false },
    { id: 'e5', page: '/coolsculpting', current: 'H2: The CoolSculpting Process', suggested: 'H2: What to Expect: CoolSculpting Before & After', reason: '“coolsculpting before and after” (1.9k/mo) — page ranks #22 with no matching section.', queries: ['coolsculpting before and after'], chars: false },
  ],
  body: [
    { id: 'e6', page: '/botox-nashville', current: 'At SLK Clinic, we are proud to offer Botox treatments to our valued clients. Our experienced team is dedicated to helping you look and feel your best…', suggested: 'Botox at SLK Clinic in Nashville starts at $12/unit, with most first-time treatments ranging from $240–$480. Our nurse injectors have performed 4,000+ treatments, and same-week appointments are usually available at our Green Hills location…', reason: 'First 60 words now answer the dominant query intents: price, credibility, availability, location. Reading level and tone matched to your existing pages.', queries: ['botox nashville cost', 'botox near me'], chars: false },
  ],
  faq: [
    { id: 'e7', page: '/coolsculpting', current: '— no FAQ section on page —', suggested: 'Q: How much does CoolSculpting cost in Nashville?\nA: At SLK Clinic, CoolSculpting starts at $600 per cycle. Most treatment plans use 2–4 cycles per area…', reason: 'Answers the top question query directly; paired with FAQPage schema below to compete for the rich result Skin Solutions currently holds.', queries: ['coolsculpting cost nashville', 'is coolsculpting worth it'], chars: false },
    { id: 'e8', page: '/coolsculpting', current: '— no FAQ section on page —', suggested: 'Q: Does CoolSculpting really work?\nA: Clinical studies show 20–25% fat reduction in treated areas after one session, with full results visible at 8–12 weeks…', reason: '“does coolsculpting work” appears in 8 query variants with 2.1k combined impressions.', queries: ['does coolsculpting work'], chars: false },
  ],
  schema: [
    { id: 'e9', page: '/coolsculpting', current: '— no structured data beyond Rank Math defaults —', suggested: '{\n  "@type": "FAQPage",\n  "mainEntity": [\n    { "@type": "Question",\n      "name": "How much does CoolSculpting cost in Nashville?", … }\n  ]\n}', reason: 'FAQPage markup makes the page eligible for the FAQ rich result. Injected via Rank Math’s schema filter — no template edits.', queries: ['coolsculpting cost nashville'], chars: false },
  ],
  links: [
    { id: 'e10', page: '/botox-nashville', current: '“…other treatments we offer.” (unlinked)', suggested: '“…pairs well with dermal fillers for full-face results.” → links to /lip-fillers', reason: 'Passes authority to a page stuck at position 11; anchor matches its target query.', queries: ['lip fillers nashville'], chars: false },
    { id: 'e11', page: '/blog/botox-aftercare-tips', current: 'No link to service page', suggested: 'Add “book a Botox consultation in Nashville” → /botox-nashville in closing paragraph', reason: 'This post gets 900 organic visits/mo but sends none to the money page.', queries: ['botox aftercare'], chars: false },
  ],
}

export const editorTabDefs: [EditorTabId, string][] = [
  ['seo', 'SEO title & meta'],
  ['headings', 'H1 / H2s'],
  ['body', 'Body copy'],
  ['faq', 'FAQ'],
  ['schema', 'Schema'],
  ['links', 'Links on this page'],
]

export type ReviewDiff = {
  subjectRef?: string
  title?: { before: string; after: string } | null
  meta?: { before: string; after: string } | null
  content?: { tab: string; before: string; after: string; elementorReady?: boolean; postContentReady?: boolean }[]
  manual?: boolean
  instructions?: string
}

export type VerifyCheck = { label: string; ok: boolean; detail: string }

export type PublishVerification = {
  ok: boolean
  checkedAt: string
  verifiedUrl: string | null
  checks: VerifyCheck[]
}

export type ReviewRow = {
  id: string
  title: string
  detail: string
  type: string
  risk: 'High' | 'Medium' | 'Low'
  reviewer: string
  dest: string
  preset?: string
  actionKind?: string | null
  findingId?: string | null
  executedAt?: string | null
  publishTier?: string | null
  diff?: ReviewDiff | null
  verification?: PublishVerification | null
}

export const reviewData: ReviewRow[] = [
  { id: 'r1', title: 'Content rewrite — Botox intro + pricing section', detail: '/botox-nashville · 2 sections, 340 words changed', type: 'Content', risk: 'Low', reviewer: 'M. Torres', dest: 'WordPress · page revision' },
  { id: 'r2', title: 'Elementor section — CoolSculpting FAQ block', detail: '/coolsculpting · new section after “Process”', type: 'Elementor', risk: 'Low', reviewer: 'Unassigned', dest: 'Elementor · draft import' },
  { id: 'r3', title: 'Title + meta rewrite — 4 service pages', detail: '/botox-nashville, /hydrafacial, /lip-fillers, /microneedling', type: 'Metadata', risk: 'Low', reviewer: 'M. Torres', dest: 'Rank Math' },
  { id: 'r4', title: 'Add missing H1s to 6 pages', detail: 'Template fix: heading widget renders div → h1', type: 'Technical', risk: 'Medium', reviewer: 'J. Whitfield', dest: 'Theme templates' },
  { id: 'r5', title: 'New draft — Botox vs Dysport comparison page', detail: '1,450 words · comparison table · 2 internal links', type: 'New page', risk: 'Medium', reviewer: 'Unassigned', dest: 'WordPress · new draft' },
  { id: 'r6', title: 'FAQPage schema — CoolSculpting', detail: 'Injected via Rank Math filter', type: 'Schema', risk: 'Low', reviewer: 'M. Torres', dest: 'Rank Math', preset: 'Approved' },
  { id: 'r7', title: 'Internal links batch — 5 links across service pages', detail: 'Exact-match anchors, all same-topic targets', type: 'Links', risk: 'Low', reviewer: 'Unassigned', dest: 'WordPress · page revisions' },
]

export const elemJson = `{
  "version": "0.4",
  "title": "SLK — Pricing Table (Service v3)",
  "type": "section",
  "content": [{
    "elType": "section",
    "settings": {
      "structure": "33",
      "background_background": "classic",
      "background_color": "#FAFAF7",
      "padding": { "unit": "px", "top": 72, "bottom": 72 }
    },
    "elements": [{
      "elType": "column",
      "elements": [{
        "elType": "widget",
        "widgetType": "heading",
        "settings": {
          "title": "Laser Hair Removal Packages",
          "header_size": "h2",
          "typography_typography": "custom",
          "typography_font_family": "Plus Jakarta Sans"
        }
      }, {
        "elType": "widget",
        "widgetType": "price-table",
        "settings": {
          "heading": "Small Area",
          "price": "89",
          "period": "per session", "…": "…"
        }
      }]
    }]
  }]
}`

export type ElemDef = {
  id: string
  name: string
  status: string
  ok: boolean
  useCase: string
  placement: string
  notes: string
  rationale: string
  size: string
  json: string
}

export const elemDefs: ElemDef[] = [
  { id: 's1', name: 'Pricing table — Laser Hair Removal', status: 'Generated · validated', ok: true, useCase: 'Answer pricing intent directly on the service page', placement: '/laser-hair-removal · after “Treatment Areas”', notes: 'Matches “Service v3” template: same container width, heading scale, and button style', rationale: 'All top-10 competitors show pricing; top queries are cost-modified', size: '4.2 KB', json: elemJson },
  { id: 's2', name: 'FAQ section — CoolSculpting', status: 'Generated · validated', ok: true, useCase: 'Capture 23 question queries + FAQ rich result eligibility', placement: '/coolsculpting · before final CTA', notes: 'Accordion widget, one open by default; pairs with FAQPage schema', rationale: 'Skin Solutions holds the FAQ rich result for 6 of these queries', size: '3.1 KB', json: elemJson.replace('Pricing Table', 'FAQ Accordion').replace('Laser Hair Removal Packages', 'CoolSculpting FAQs') },
  { id: 's3', name: 'Comparison hero — Botox vs Dysport', status: 'Draft — needs review', ok: false, useCase: 'Hero + comparison table for the new comparison page', placement: 'New page · /botox-vs-dysport', notes: 'Two-column table with sticky header on mobile', rationale: 'Competitor gap: 2.9k/mo query with no owned page', size: '5.8 KB', json: elemJson.replace('Pricing Table', 'Comparison Hero') },
]

export type PlanChange = { id: string; title: string; why: string; kind: string }

export const planDefs: PlanChange[] = [
  { id: 'p1', title: 'Rewrite title tag with pricing intent', why: 'CTR 0.6% on cost queries vs 2.9% expected', kind: 'Metadata' },
  { id: 'p2', title: 'Add pricing table section (Elementor)', why: 'All top-10 results show pricing; page has none', kind: 'Section' },
  { id: 'p3', title: 'Refresh intro copy with city + device credentials', why: 'First 60 words carry no query intent', kind: 'Content' },
  { id: 'p4', title: 'Add FAQ section + FAQPage schema', why: '11 question queries, rich result available', kind: 'Schema' },
  { id: 'p5', title: 'Add before/after gallery section', why: 'Engagement signal; competitors average 8 images', kind: 'Section' },
  { id: 'p6', title: 'Add 3 internal links from blog posts', why: 'Only 2 internal links point to this page', kind: 'Links' },
]

// ---- Overview ----

export const metrics = [
  { label: 'Organic clicks', value: '12,840', delta: '+14.2%', up: true },
  { label: 'Impressions', value: '486K', delta: '+9.1%', up: true },
  { label: 'Avg. position', value: '7.4', delta: '+0.8', up: true },
  { label: 'Organic conversions', value: '318', delta: '+11.6%', up: true },
  { label: 'Est. traffic value', value: '$18,400', delta: '−2.3%', up: false },
]

export const losingPages = [
  { path: '/laser-hair-removal', delta: '−18%' },
  { path: '/chemical-peels', delta: '−11%' },
  { path: '/blog/botox-myths', delta: '−9%' },
]

export const compGaps = [
  { kw: 'botox vs dysport', vol: '2.9k', note: 'No page' },
  { kw: 'med spa nashville', vol: '5.4k', note: 'Pos. 18' },
  { kw: 'laser hair removal cost nashville', vol: '1.6k', note: 'Pos. 14' },
]

export const scoreParts = [
  { label: 'Content', val: 68, pct: '68%', color: '#3b5bdb' },
  { label: 'Technical', val: 81, pct: '81%', color: '#3b5bdb' },
  { label: 'Authority', val: 64, pct: '64%', color: '#3b5bdb' },
  { label: 'Experience', val: 75, pct: '75%', color: '#3b5bdb' },
]

export const readyItems = [
  { label: 'Content rewrite — Botox intro + pricing', kind: 'Content' },
  { label: 'CoolSculpting FAQ block', kind: 'Elementor' },
  { label: 'Title + meta — 4 service pages', kind: 'Metadata' },
]

export const recentPublished = [
  { label: 'Title rewrite — HydraFacial', meta: 'May 12 · clicks +38% since', status: 'Improving', good: true },
  { label: 'FAQ schema — Microneedling', meta: 'May 28 · rich result won', status: 'Improving', good: true },
  { label: 'Content refresh — Chemical Peels', meta: 'Jun 9 · position 12 → 9', status: 'Monitoring', good: false },
]

// ---- Page detail ----

export const pageQueries = [
  { q: 'laser hair removal nashville', impr: '18.2k', ctr: '3.1%', pos: '8', gap: '−2.4 pts', bad: true },
  { q: 'laser hair removal cost nashville', impr: '6.4k', ctr: '0.6%', pos: '14', gap: '−2.3 pts', bad: true },
  { q: 'best laser hair removal nashville', impr: '4.1k', ctr: '2.2%', pos: '9', gap: '−1.1 pts', bad: true },
  { q: 'laser hair removal near me', impr: '3.8k', ctr: '1.9%', pos: '11', gap: 'in range', bad: false },
  { q: 'brazilian laser hair removal nashville', impr: '2.2k', ctr: '4.4%', pos: '6', gap: 'in range', bad: false },
]

export const pageComps = [
  { name: 'Skin Solutions Nashville', pos: 2, note: 'Refreshed Apr 2026 · pricing table · 14 FAQs' },
  { name: 'Franklin Skin & Laser', pos: 3, note: 'Cost calculator · 2,100 words · video' },
  { name: 'SLK Clinic (you)', pos: 8, note: '890 words · no pricing · no FAQ · last edit May 2025' },
]

export const planLinks = [
  { from: '/blog/laser-vs-waxing', anchor: 'laser hair removal in Nashville' },
  { from: '/blog/summer-skin-prep', anchor: 'laser hair removal packages' },
  { from: '/services', anchor: 'laser hair removal pricing' },
]

export const planChecklist = [
  { label: 'Draft revision created in WordPress', done: true },
  { label: 'Elementor section validated against theme', done: true },
  { label: 'Metadata within length limits', done: true },
  { label: 'Reviewer assigned', done: false },
  { label: 'Approved in review queue', done: false },
]

// ---- Competitors ----

export const competitors = [
  { name: 'Skin Solutions', domain: 'skinsolutionsnashville.com', overlap: '64%', gaps: 118 },
  { name: 'Franklin Skin & Laser', domain: 'franklinskinandlaser.com', overlap: '51%', gaps: 86 },
  { name: 'Nashville Cosmetic', domain: 'nashvillecosmetic.com', overlap: '43%', gaps: 71 },
  { name: 'SkinMD Nashville', domain: 'skinmdnashville.com', overlap: '38%', gaps: 54 },
]

export const kwGaps = [
  { kw: 'botox vs dysport', vol: '2,900', comp: 3, us: '—', diff: 34, value: '$2.1k/mo', action: 'Create page', bad: true },
  { kw: 'med spa nashville', vol: '5,400', comp: 6, us: '#18', diff: 61, value: '$3.4k/mo', action: 'Strengthen home', bad: false },
  { kw: 'laser hair removal cost nashville', vol: '1,600', comp: 2, us: '#14', diff: 28, value: '$1.2k/mo', action: 'Add pricing section', bad: false },
  { kw: 'coolsculpting before and after', vol: '1,900', comp: 5, us: '#22', diff: 31, value: '$900/mo', action: 'Add gallery + H2', bad: false },
  { kw: 'lip flip nashville', vol: '880', comp: 4, us: '—', diff: 22, value: '$700/mo', action: 'Create page', bad: true },
]

export const contentGapCards = [
  { title: 'Botox vs Dysport comparison', why: '3 of 4 competitors have one; combined 4.2k/mo across variants', diff: 34, value: '$2.1k/mo', priority: 'High' },
  { title: 'Treatment cost guides hub', why: 'Franklin S&L captures 11 cost queries with a single guide format', diff: 29, value: '$1.8k/mo', priority: 'High' },
  { title: 'Financing & payment plans page', why: '“med spa financing nashville” + CareCredit queries, zero coverage', diff: 18, value: '$600/mo', priority: 'Medium' },
]

export const serpFeatures = [
  { label: 'FAQ rich results available', count: '12 keywords' },
  { label: 'Local pack — not ranking', count: '8 keywords' },
  { label: 'People Also Ask coverage', count: '31 questions' },
  { label: 'Image pack (before/after)', count: '6 keywords' },
]

// ---- Technical ----

export const techIssues = [
  { issue: 'Missing H1 headings', detail: 'Heading widget renders as styled div in “Service v3” template', affected: '6 pages', severity: 'High', status: 'Fix ready', fixReady: true },
  { issue: 'Slow LCP on mobile', detail: 'Hero background images uncompressed, avg 3.8s', affected: '4 templates', severity: 'High', status: 'Investigating', fixReady: false },
  { issue: 'Duplicate meta descriptions', detail: 'Same template description across service pages', affected: '9 pages', severity: 'Medium', status: 'Fix ready', fixReady: true },
  { issue: 'Orphan pages', detail: 'No internal links point to these URLs', affected: '3 pages', severity: 'Medium', status: 'Fix ready', fixReady: true },
  { issue: 'Redirect chains', detail: '2+ hops from legacy URLs', affected: '11 URLs', severity: 'Low', status: 'Fix ready', fixReady: true },
  { issue: 'Images missing alt text', detail: 'Mostly gallery and before/after images', affected: '34 images', severity: 'Low', status: 'Queued', fixReady: false },
]

// ---- Impact ----

export const impactRows = [
  { label: 'Title rewrite', page: '/hydrafacial', date: 'May 12', clicks: '+38%', pos: '9.1 → 6.4', verdict: 'Improving', good: true },
  { label: 'FAQ schema added', page: '/microneedling', date: 'May 28', clicks: '+22% impr.', pos: 'rich result won', verdict: 'Improving', good: true },
  { label: 'Content refresh', page: '/chemical-peels', date: 'Jun 9', clicks: '+6%', pos: '12 → 9', verdict: 'Monitoring', good: false },
  { label: 'Internal links batch', page: '5 service pages', date: 'Jun 20', clicks: 'flat', pos: 'no change yet', verdict: 'Monitoring', good: false },
]

// ---- Settings ----

export const connections = [
  { abbr: 'GSC', name: 'Google Search Console', detail: 'sc-domain:slkclinic.com · synced 12 min ago', status: 'Connected' },
  { abbr: 'GA4', name: 'Google Analytics 4', detail: 'Property 384920117 · synced 12 min ago', status: 'Connected' },
  { abbr: 'WP', name: 'WordPress', detail: 'v6.7 · REST API · publishes as draft revisions only', status: 'Connected' },
  { abbr: 'EL', name: 'Elementor', detail: 'v3.21 Pro · theme “Hello Elementor” · schema validated', status: 'Connected' },
  { abbr: 'RM', name: 'Rank Math', detail: 'v1.0.226 · metadata + schema write access', status: 'Connected' },
  { abbr: 'CR', name: 'Site crawler', detail: '214 URLs · weekly · last run Jul 6, 4:12 AM', status: 'Healthy' },
]

export const navDefs: [ViewId, string, number?][] = [
  ['overview', 'Dashboard'],
  ['opportunities', 'Opportunities'],
  ['pages', 'Pages'],
  ['impact', 'Impact'],
  ['settings', 'Settings'],
]
