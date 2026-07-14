import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLinkEvidenceReason,
  mergeLinkSuggestionsWithTargets,
  rankLinkCandidates,
  selectLinkTargets,
} from '../src/linkCandidates.ts'
import { buildPagePathAliasMap } from '../src/url.ts'

test('rankLinkCandidates: ranks by shared topical terms', () => {
  const ranked = rankLinkCandidates(
    'botox brands dysport xeomin comparison',
    [
      { slug: 'lip-fillers', title: 'Lip Fillers', contentHtml: '<p>filler lips</p>', type: 'page' },
      {
        slug: 'which-botox-lasts',
        title: 'Which Botox Lasts',
        contentHtml: '<p>botox dysport xeomin brands</p>',
        type: 'post',
        url: 'https://slkclinic.com/blog/which-botox-lasts',
      },
      {
        slug: 'stop-responding',
        title: 'Stop Responding to Botox',
        contentHtml: '<p>botox resistance antibodies</p>',
        type: 'post',
        url: 'https://slkclinic.com/blog/stop-responding',
      },
    ],
    'current-post',
  )
  assert.ok(ranked[0].score >= ranked[1].score)
  assert.ok(ranked.some((r) => r.path.includes('botox')))
})

test('rankLinkCandidates: title terms + distinctive overlap beat a generic-word match', () => {
  // Source is a Botox brand-comparison article. A page that shares the core
  // topic (botox/dysport) must outrank one that only shares a generic word.
  const ranked = rankLinkCandidates(
    'Which Botox Lasts Longest? Comparison of Botulinum Toxins dysport xeomin how long results last',
    [
      // Off-topic page that merely shares the generic query word "last"/"long".
      {
        slug: 'how-to-get-results-that-last-with-vivace',
        title: 'How To Get Results That Last With Vivace',
        contentHtml: '<p>vivace microneedling radiofrequency skin tightening lasts</p>',
        type: 'post',
        url: 'https://slkclinic.com/blog/how-to-get-results-that-last-with-vivace',
      },
      // On-topic: shares botox in the label + distinctive brand terms in body.
      {
        slug: 'is-it-possible-to-stop-responding-to-botox',
        title: 'Is It Possible To Stop Responding To Botox',
        contentHtml: '<p>botox dysport xeomin jeuveau botulinum toxin resistance</p>',
        type: 'post',
        url: 'https://slkclinic.com/blog/is-it-possible-to-stop-responding-to-botox',
      },
    ],
    'current-post',
    { titleText: 'Which Botox Lasts Longest? Comparison of Botulinum Toxins' },
  )
  assert.equal(
    ranked[0].path,
    '/blog/is-it-possible-to-stop-responding-to-botox',
    'the botox-topical page must rank first, not the generic "lasts" match',
  )
})

test('rankLinkCandidates: a "Which X is Best" page never outranks the subject money page', () => {
  // Regression for the live bug: a Botox brand-comparison article ranked a
  // "4 Types of Lip Filler: Which Lip Filler Is Best" post ABOVE the Botox
  // service pages, because IDF penalized the site-common subject word "botox"
  // and generic title words (which/best/types) drove the match.
  const source = 'All 5 Botox Brands Compared: Which Lasts Longest? botox brands dysport xeomin'
  const ranked = rankLinkCandidates(
    source,
    [
      {
        slug: '4-types-of-lip-filler-which-lip-filler-is-best-for-you',
        title: '4 Types of Lip Filler: Which Lip Filler Is Best for You',
        contentHtml: '<p>lip filler juvederm restylane volume</p>',
        type: 'post',
        url: 'https://slkclinic.com/blog/4-types-of-lip-filler-which-lip-filler-is-best-for-you',
      },
      {
        slug: 'botox-nashville',
        title: 'Botox Nashville',
        contentHtml: '<p>botox injections nashville pricing book</p>',
        type: 'page',
        url: 'https://slkclinic.com/botox-nashville',
      },
    ],
    'current-post',
    { titleText: 'All 5 Botox Brands Compared: Which Lasts Longest?' },
  )
  assert.equal(ranked[0].path, '/botox-nashville', 'the Botox money page must outrank the generic lip-filler post')
})

test('selectLinkTargets: same inputs produce same outputs', () => {
  const ranked = rankLinkCandidates('botox nashville', [
    { slug: 'a', title: 'Botox A', contentHtml: '<p>botox</p>' },
    { slug: 'b', title: 'Botox B', contentHtml: '<p>botox</p>' },
    { slug: 'c', title: 'Laser', contentHtml: '<p>laser</p>' },
  ], 'x')
  const a = selectLinkTargets(ranked)
  const b = selectLinkTargets(ranked)
  assert.deepEqual(a.map((t) => t.path), b.map((t) => t.path))
})

test('mergeLinkSuggestionsWithTargets: forces pre-selected paths in order', () => {
  const selected = selectLinkTargets(
    rankLinkCandidates('botox', [
      {
        slug: 'stop-responding',
        title: 'Stop Responding',
        contentHtml: '<p>botox</p>',
        type: 'post',
        url: 'https://slkclinic.com/blog/stop-responding',
      },
    ], 'current'),
  )
  const aliases = buildPagePathAliasMap([
    {
      slug: 'stop-responding',
      type: 'post',
      url: 'https://slkclinic.com/blog/stop-responding',
    },
  ])
  const out = mergeLinkSuggestionsWithTargets(
    '"wrong path" -> /stop-responding',
    selected,
    aliases,
  )
  assert.match(out, /\/blog\/stop-responding/)
})

test('buildLinkEvidenceReason: cites source queries and overlap', () => {
  const reason = buildLinkEvidenceReason(
    [{ path: '/blog/foo', title: 'Foo', snippet: '', score: 2, matchedTerms: ['botox', 'men'] }],
    [{ query: 'botox brands', impressions: 1200 }],
  )
  assert.match(reason, /botox brands/)
  assert.match(reason, /topical overlap/)
  assert.match(reason, /botox, men/)
})
