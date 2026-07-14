import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assessAnchorText,
  countWords,
  dedupeLinkPlan,
  maxContextualLinksForWordCount,
} from '../src/linkingStandards.ts'

test('maxContextualLinksForWordCount stays in the 2-8 healthy range', () => {
  assert.equal(maxContextualLinksForWordCount(0), 2)
  assert.equal(maxContextualLinksForWordCount(300), 2) // floor
  assert.equal(maxContextualLinksForWordCount(1000), 4) // ~1 per 250 words
  assert.equal(maxContextualLinksForWordCount(5000), 8) // ceiling
})

test('countWords ignores extra whitespace', () => {
  assert.equal(countWords('  one   two  three '), 3)
  assert.equal(countWords(''), 0)
})

test('assessAnchorText rejects generic and malformed anchors', () => {
  assert.equal(assessAnchorText('click here').ok, false)
  assert.equal(assessAnchorText('read more').ok, false)
  assert.equal(assessAnchorText('Botox').ok, false) // single word
  assert.equal(assessAnchorText('https://example.com/x').ok, false)
  assert.equal(assessAnchorText('how long Botox results last').ok, true)
})

test('dedupeLinkPlan drops repeat targets and repeat anchors', () => {
  const rows = [
    { anchor: 'Botox in Nashville', target: '/botox-nashville' },
    { anchor: 'best Botox pricing', target: '/botox-nashville' }, // dup target
    { anchor: 'Botox in Nashville', target: '/other' }, // dup anchor
    { anchor: 'dermal filler guide', target: '/lip-fillers' },
  ]
  const out = dedupeLinkPlan(rows)
  assert.equal(out.length, 2)
  assert.deepEqual(
    out.map((r) => r.target),
    ['/botox-nashville', '/lip-fillers'],
  )
})
