import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyContentRecommendationsToElementor,
  collectHeadingWidgets,
  extractH1FromOutline,
  outlineForBodyWidgets,
  parseElementorRoot,
  parseHeadingOutline,
  parseLinkSuggestions,
  patchHeadingWidgets,
  normalizeElementorLinks,
  patchLinkWidgets,
  patchLinkWidgetsDetailed,
  resolveLinkSuggestionsText,
  serializeElementorRoot,
} from '../src/elementorPatch.ts'
import { buildPagePathAliasMap } from '../src/url.ts'

const SAMPLE_TREE = [
  {
    id: 'c1',
    elType: 'container',
    elements: [
      {
        id: 'h1',
        elType: 'widget',
        widgetType: 'heading',
        settings: { title: 'Old H1 Title', header_size: 'h1' },
      },
      {
        id: 't1',
        elType: 'widget',
        widgetType: 'text-editor',
        settings: {
          editor: '<p>At SLK Clinic we offer Botox treatments to our valued clients.</p>',
        },
      },
      {
        id: 'h2',
        elType: 'widget',
        widgetType: 'heading',
        settings: { title: 'Why Choose Us', header_size: 'h2' },
      },
    ],
  },
]

test('parseHeadingOutline reads H1/H2 lines', () => {
  const lines = parseHeadingOutline('H1: New Title\nH2: Section Two')
  assert.equal(lines.length, 2)
  assert.equal(lines[0].level, 1)
  assert.equal(lines[0].text, 'New Title')
})

test('patchHeadingWidgets updates heading widgets in order', () => {
  const tree = structuredClone(SAMPLE_TREE)
  const n = patchHeadingWidgets(tree, 'H1: Which Botox Lasts Longest?\nH2: The Five Brands')
  assert.equal(n, 2)
  const widgets = collectHeadingWidgets(tree)
  assert.equal(widgets[0].settings?.title, 'Which Botox Lasts Longest?')
  assert.equal(widgets[0].settings?.header_size, 'h1')
  assert.equal(widgets[1].settings?.title, 'The Five Brands')
})

test('blog posts: externalH1 keeps one H1 via post title, body widgets are H2+', () => {
  const tree = structuredClone(SAMPLE_TREE)
  const outline =
    'H1: Which Botox Lasts the Longest? Comparing 5 Brands\nH2: The Five Botulinum Toxin Brands\nH3: Research Bias'
  assert.equal(
    extractH1FromOutline(outline),
    'Which Botox Lasts the Longest? Comparing 5 Brands',
  )
  const bodyOutline = outlineForBodyWidgets(outline, { externalH1: true })
  assert.equal(bodyOutline[0].level, 2)
  assert.equal(bodyOutline[0].text, 'The Five Botulinum Toxin Brands')

  const n = patchHeadingWidgets(tree, outline, { externalH1: true })
  assert.ok(n >= 1)
  const widgets = collectHeadingWidgets(tree)
  assert.equal(widgets[0].settings?.header_size, 'h2')
  assert.equal(widgets[0].settings?.title, 'The Five Botulinum Toxin Brands')
  assert.notEqual(widgets[0].settings?.title, extractH1FromOutline(outline))
})

test('parseLinkSuggestions handles arrow and Add formats', () => {
  const rows = parseLinkSuggestions(
    '"pairs well with dermal fillers" → /lip-fillers\nAdd "book a consultation" → /botox-nashville in closing paragraph',
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].target, '/lip-fillers')
  assert.equal(rows[1].append, true)
})

test('parseLinkSuggestions accepts ASCII arrow (->)', () => {
  const rows = parseLinkSuggestions(
    '"stop responding to Botox" -> /is-it-possible-to-stop-responding-to-botox\nAdd "affordable Botox in Chattanooga" -> /affordable-fillers-and-botox-of-chattanooga in the Recommendations section',
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].target, '/is-it-possible-to-stop-responding-to-botox')
  assert.equal(rows[1].append, true)
  assert.equal(rows[1].placement, 'Recommendations')
})

test('resolveLinkSuggestionsText rewrites bare slug to /blog/ permalink', () => {
  const aliases = buildPagePathAliasMap([
    {
      slug: 'the-benefits-of-botox-for-men',
      type: 'post',
      url: 'https://slkclinic.com/blog/the-benefits-of-botox-for-men',
    },
  ])
  const out = resolveLinkSuggestionsText(
    '"which Botox lasts the longest" -> /the-benefits-of-botox-for-men',
    aliases,
  )
  assert.match(out, /\/blog\/the-benefits-of-botox-for-men/)
})

test('patchLinkWidgets resolves bare slug to /blog/ permalink on push', () => {
  const tree = structuredClone(SAMPLE_TREE)
  tree[0].elements![1].settings!.editor =
    '<p>Readers often ask which Botox lasts the longest when comparing brands.</p>'
  const aliases = new Map([['/the-benefits-of-botox-for-men', '/blog/the-benefits-of-botox-for-men']])
  const n = patchLinkWidgets(
    tree,
    '"which Botox lasts the longest" -> /the-benefits-of-botox-for-men',
    'https://slkclinic.com',
    aliases,
  )
  assert.equal(n, 1)
  const html = String(tree[0].elements![1].settings!.editor)
  assert.match(html, /href="https:\/\/slkclinic\.com\/blog\/the-benefits-of-botox-for-men"/)
})

test('parseLinkSuggestions skips legacy inbound dash format', () => {
  const rows = parseLinkSuggestions('/botox — "which Botox brand lasts the longest"')
  assert.equal(rows.length, 0)
})

test('patchLinkWidgets wraps anchor text in text-editor HTML', () => {
  const tree = structuredClone(SAMPLE_TREE)
  tree[0].elements![1].settings!.editor =
    '<p>Our treatments pairs well with dermal fillers for full results.</p>'
  const n = patchLinkWidgets(
    tree,
    'pairs well with dermal fillers → /lip-fillers',
    'https://slkclinic.com',
  )
  assert.equal(n, 1)
  const html = String(tree[0].elements![1].settings!.editor)
  assert.match(html, /href="https:\/\/slkclinic\.com\/lip-fillers"/)
})

test('patchLinkWidgets matches anchors with different casing and spacing', () => {
  const tree = structuredClone(SAMPLE_TREE)
  tree[0].elements![1].settings!.editor =
    '<p>We also carry Botox   Treatments for our valued clients.</p>'
  const n = patchLinkWidgets(tree, '"botox treatments" -> /botox-nashville', 'https://slkclinic.com')
  assert.equal(n, 1)
  const html = String(tree[0].elements![1].settings!.editor)
  assert.match(html, /href="https:\/\/slkclinic\.com\/botox-nashville"/)
})

test('patchLinkWidgetsDetailed places contextual links inline and SKIPS links with no natural anchor (no stuffing)', () => {
  const tree = structuredClone(SAMPLE_TREE)
  tree[0].elements![1].settings!.editor =
    '<p>At SLK Clinic we offer Botox treatments to our valued clients across Nashville.</p>'
  const suggestions = [
    '"Botox treatments" -> /botox-nashville', // inline (verbatim in prose)
    '"how to choose a filler injector" -> /blog/choosing-a-filler-injector', // no prose match → skipped
    '"benefits of Botox for men" -> /blog/botox-for-men', // no prose match → skipped
  ].join('\n')

  const outcome = patchLinkWidgetsDetailed(tree, suggestions, 'https://slkclinic.com')
  assert.equal(outcome.placements.length, 3)
  assert.equal(outcome.placements.filter((p) => p.mode === 'inline').length, 1)
  assert.equal(outcome.placements.filter((p) => p.mode === 'skipped').length, 2)

  const html = String(tree[0].elements![1].settings!.editor)
  assert.match(html, /href="https:\/\/slkclinic\.com\/botox-nashville"/)
  // No appended "related reading" dump — skipped links are simply not written.
  assert.doesNotMatch(html, /gw-related-reading/)
  assert.doesNotMatch(html, /choosing-a-filler-injector/)
  assert.doesNotMatch(html, /botox-for-men/)
})

test('patchLinkWidgetsDetailed skips a link with no natural anchor rather than stuffing it', () => {
  const tree = structuredClone(SAMPLE_TREE)
  const suggestions = '"unmatched anchor phrase" -> /blog/some-post'
  const outcome = patchLinkWidgetsDetailed(tree, suggestions, 'https://slkclinic.com')
  assert.equal(outcome.changed, 0)
  assert.equal(outcome.placements[0].mode, 'skipped')
  const html = String(tree[0].elements![1].settings!.editor)
  assert.doesNotMatch(html, /some-post/)
})

test('patchLinkWidgetsDetailed places a link using DESTINATION keywords when the AI anchor is not in the body', () => {
  const tree = structuredClone(SAMPLE_TREE)
  tree[0].elements![1].settings!.editor =
    '<p>We compare botulinum toxin brands and cover the benefits of botox for men in detail.</p>'
  // The AI anchor phrase does NOT appear verbatim in the body:
  const suggestions = '"our complete male treatment resource" -> /blog/the-benefits-of-botox-for-men'
  const outcome = patchLinkWidgetsDetailed(tree, suggestions, 'https://slkclinic.com')
  assert.equal(outcome.placements.length, 1)
  assert.equal(outcome.placements[0].mode, 'inline', 'link lands via destination keywords, not skipped')
  const html = String(tree[0].elements![1].settings!.editor)
  assert.match(html, /href="https:\/\/slkclinic\.com\/blog\/the-benefits-of-botox-for-men"/)
  // Anchor is a real, descriptive phrase pulled from the body:
  assert.match(html, /<a [^>]*>benefits of botox for men<\/a>/i)
})

test('patchLinkWidgetsDetailed dedupes duplicate targets and enforces the word-count cap', () => {
  const tree = structuredClone(SAMPLE_TREE)
  // Short body → cap floors at 2 contextual links.
  tree[0].elements![1].settings!.editor =
    '<p>We offer Botox treatments, dermal fillers, laser hair removal, and skin care.</p>'
  const suggestions = [
    '"Botox treatments" -> /botox-nashville',
    '"Botox treatments" -> /botox-nashville', // duplicate target+anchor → dropped
    '"dermal fillers" -> /lip-fillers',
    '"laser hair removal" -> /laser-hair-removal', // exceeds cap of 2 → skipped
  ].join('\n')
  const outcome = patchLinkWidgetsDetailed(tree, suggestions, 'https://slkclinic.com')
  const inline = outcome.placements.filter((p) => p.mode === 'inline')
  assert.equal(inline.length, 2, 'cap of 2 contextual links honored')
})

test('patchLinkWidgetsDetailed does not double-link an already-linked target', () => {
  const tree = structuredClone(SAMPLE_TREE)
  tree[0].elements![1].settings!.editor =
    '<p>See <a href="https://slkclinic.com/botox-nashville">Botox in Nashville</a> for pricing.</p>'
  const outcome = patchLinkWidgetsDetailed(
    tree,
    '"Botox in Nashville" -> /botox-nashville',
    'https://slkclinic.com',
  )
  assert.equal(outcome.changed, 0)
  assert.equal(outcome.placements[0].mode, 'existing')
  const html = String(tree[0].elements![1].settings!.editor)
  assert.equal((html.match(/<a /g) ?? []).length, 1)
})

test('normalizeElementorLinks fixes bare-slug blog links, strips related block, unwraps dupes', () => {
  const aliases = new Map([
    ['/the-benefits-of-botox-for-men', '/blog/the-benefits-of-botox-for-men'],
    ['/botox-nashville', '/botox-nashville'], // service page — unchanged
  ])
  const tree = [
    {
      id: 'c1',
      elType: 'container',
      elements: [
        {
          id: 't1',
          elType: 'widget',
          widgetType: 'text-editor',
          settings: {
            editor:
              '<p>See <a href="https://slkclinic.com/the-benefits-of-botox-for-men">Botox for men</a> and ' +
              '<a href="https://slkclinic.com/the-benefits-of-botox-for-men">again</a>. ' +
              'Visit <a href="/botox-nashville">Botox in Nashville</a>.' +
              '<!-- gw-related-reading --><p><strong>Related reading</strong></p><ul><li><a href="/x">x</a></li></ul><!-- /gw-related-reading -->',
          },
        },
      ],
    },
  ]
  const res = normalizeElementorLinks(tree, 'https://slkclinic.com', aliases)
  const html = String((tree[0].elements![0] as { settings: { editor: string } }).settings.editor)
  assert.equal(res.removedRelatedBlocks, 1)
  assert.doesNotMatch(html, /gw-related-reading/)
  // Bare blog slug rewritten to /blog/ permalink.
  assert.match(html, /href="https:\/\/slkclinic\.com\/blog\/the-benefits-of-botox-for-men"/)
  // Duplicate link to same destination unwrapped (only one anchor remains).
  assert.equal((html.match(/href="https:\/\/slkclinic\.com\/blog\/the-benefits-of-botox-for-men"/g) ?? []).length, 1)
  assert.match(html, /again/) // duplicate's words preserved
  // Service page link untouched.
  assert.match(html, /href="\/botox-nashville"/)
})

test('applyContentRecommendationsToElementor round-trips JSON array root', () => {
  const raw = JSON.stringify(SAMPLE_TREE)
  const result = applyContentRecommendationsToElementor(raw, [
    {
      tab: 'headings',
      current: 'H1: Old H1 Title',
      suggested: 'H1: Updated H1',
    },
    {
      tab: 'body',
      current: 'old intro',
      suggested: 'Botox in Nashville starts at $12 per unit with same-week booking.',
    },
  ])
  assert.ok(result.summary.length >= 2)
  const reparsed = parseElementorRoot(result.elementorData)
  assert.equal(reparsed.wrap, 'array')
  assert.equal(serializeElementorRoot(reparsed, reparsed.root), result.elementorData)
  assert.equal(collectHeadingWidgets(reparsed.root)[0].settings?.title, 'Updated H1')
})
