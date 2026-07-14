import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasSeoPluginFacts,
  metaFieldsForAdapters,
  seoPublishDest,
  summarizeSeoPlugins,
} from '../src/seoPlugins.ts'

const slkPlugins = [
  {
    key: 'wordpress-seo-wp-seo',
    value: JSON.stringify({ name: 'Yoast SEO', status: 'active', slug: 'wordpress-seo/wp-seo' }),
  },
  {
    key: 'wpseo-local-local-seo',
    value: JSON.stringify({ name: 'Yoast SEO: Local', status: 'active', slug: 'wpseo-local/local-seo' }),
  },
  {
    key: 'wpseo-video-video-seo',
    value: JSON.stringify({ name: 'Yoast SEO: Video', status: 'active', slug: 'wpseo-video/video-seo' }),
  },
  {
    key: 'wordpress-seo-premium-wp-seo-premium',
    value: JSON.stringify({
      name: 'Yoast SEO Premium',
      status: 'active',
      slug: 'wordpress-seo-premium/wp-seo-premium',
    }),
  },
]

test('summarizeSeoPlugins: detects Yoast stack with extensions', () => {
  const summary = summarizeSeoPlugins(slkPlugins)
  assert.equal(summary.detected, true)
  assert.equal(summary.primary?.name, 'Yoast SEO')
  assert.equal(summary.extensions.length, 3)
  assert.equal(summary.capabilities.metaWrite, true)
  assert.ok(summary.capabilities.metaAdapters.includes('yoast'))
  assert.equal(summary.capabilities.redirects, true)
  assert.equal(summary.capabilities.redirectPublish, false)
  assert.match(summary.detail, /Yoast SEO/)
  assert.match(summary.detail, /meta write/)
  assert.match(summary.detail, /redirects \(manual\)/)
})

test('summarizeSeoPlugins: Rank Math with redirect publish', () => {
  const summary = summarizeSeoPlugins([
    {
      key: 'seo-by-rank-math-rank-math',
      value: JSON.stringify({ name: 'Rank Math', status: 'active', slug: 'seo-by-rank-math/rank-math' }),
    },
  ])
  assert.equal(summary.primary?.name, 'Rank Math')
  assert.equal(summary.capabilities.redirectPublish, true)
  assert.match(summary.detail, /redirect publish/)
})

test('summarizeSeoPlugins: empty plugins', () => {
  const summary = summarizeSeoPlugins([])
  assert.equal(summary.detected, false)
  assert.match(summary.detail, /Not detected yet/)
})

test('seoPublishDest: uses primary plugin name', () => {
  const summary = summarizeSeoPlugins(slkPlugins)
  assert.equal(seoPublishDest(summary), 'WordPress · Yoast SEO')
})

test('hasSeoPluginFacts: true for Yoast', () => {
  assert.equal(hasSeoPluginFacts(slkPlugins), true)
})

test('metaFieldsForAdapters: yoast-only writes yoast keys', () => {
  const fields = metaFieldsForAdapters(['yoast'], { title: 'T', description: 'D' })
  assert.equal(fields._yoast_wpseo_title, 'T')
  assert.equal(fields._yoast_wpseo_metadesc, 'D')
  assert.equal(fields.rank_math_title, undefined)
})

test('metaFieldsForAdapters: empty adapters writes all supported keys', () => {
  const fields = metaFieldsForAdapters([], { title: 'T', description: 'D' })
  assert.ok(fields._yoast_wpseo_title)
  assert.ok(fields.rank_math_title)
  assert.ok(fields._seopress_titles_title)
  assert.ok(fields._aioseo_title)
})
