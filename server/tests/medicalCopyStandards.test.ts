/**
 * Medical copy standards — unit tests.
 * Run: bun run test (from server/)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { humanizeText, stripH1LinesFromOutline } from '../src/anthropic.ts'
import { formatAuthorBylineHtml } from '../src/medicalCopyStandards.ts'

test('humanizeText converts em dashes to commas', () => {
  assert.equal(humanizeText('Treatments — same week'), 'Treatments, same week')
})

test('humanizeText converts en-dash ranges to hyphens', () => {
  assert.equal(humanizeText('$240–$480'), '$240-$480')
  assert.equal(humanizeText('6–10 weeks'), '6-10 weeks')
})

test('humanizeText leaves plain hyphens alone', () => {
  assert.equal(humanizeText('6-10 weeks'), '6-10 weeks')
})

test('stripH1LinesFromOutline removes H1 lines for blog posts', () => {
  const raw = 'H1: SEO Title Here\nH2: Section One\nH3: Subsection'
  assert.equal(stripH1LinesFromOutline(raw), 'H2: Section One\nH3: Subsection')
})

test('formatAuthorBylineHtml links to team page', () => {
  const html = formatAuthorBylineHtml({
    primaryAuthor: 'Jennifer Steinberg, NP',
    teamPagePath: '/team',
    authors: [{ name: 'Jennifer Steinberg, NP' }],
  })
  assert.match(html, /href="\/team"/)
  assert.match(html, /Jennifer Steinberg, NP/)
})
