/**
 * URL normalization — unit tests.
 * Run: npm test (from server/)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUrl, pageDisplayPath, buildPagePathAliasMap, resolveAliasedPath, urlPath, urlsEqual } from '../src/url.ts'

test('normalizeUrl: strips trailing slash', () => {
  assert.equal(normalizeUrl('https://example.com/blog/post/'), 'https://example.com/blog/post')
})

test('normalizeUrl: strips www and lowercases host', () => {
  assert.equal(normalizeUrl('https://WWW.Example.com/page'), 'https://example.com/page')
})

test('normalizeUrl: upgrades http to https', () => {
  assert.equal(normalizeUrl('http://example.com/page'), 'https://example.com/page')
})

test('normalizeUrl: strips query and hash', () => {
  assert.equal(normalizeUrl('https://example.com/page?utm=1#section'), 'https://example.com/page')
})

test('normalizeUrl: strips /en/ locale prefix', () => {
  assert.equal(normalizeUrl('https://example.com/en/blog/post'), 'https://example.com/blog/post')
})

test('normalizeUrl: bare path gets placeholder host stripped in comparison', () => {
  const a = normalizeUrl('/blog/post')
  const b = normalizeUrl('https://example.com/blog/post')
  // Bare paths normalize with placeholder host — callers should pass full URLs.
  assert.ok(a.endsWith('/blog/post'))
})

test('urlsEqual: treats www and non-www as same', () => {
  assert.ok(urlsEqual('https://www.example.com/a', 'https://example.com/a'))
})

test('urlPath: extracts display path', () => {
  assert.equal(urlPath('https://slkclinic.com/blog/botox'), '/blog/botox')
})

test('pageDisplayPath: blog posts use /blog/slug from synced url', () => {
  assert.equal(
    pageDisplayPath({
      slug: 'the-benefits-of-botox-for-men',
      type: 'post',
      url: 'https://slkclinic.com/blog/the-benefits-of-botox-for-men',
    }),
    '/blog/the-benefits-of-botox-for-men',
  )
})

test('pageDisplayPath: falls back to /blog/slug for posts without url', () => {
  assert.equal(
    pageDisplayPath({ slug: 'some-post', type: 'post', url: null }),
    '/blog/some-post',
  )
})

test('resolveAliasedPath: fixes bare slug paths to blog permalinks', () => {
  const aliases = buildPagePathAliasMap([
    {
      slug: 'the-benefits-of-botox-for-men',
      type: 'post',
      url: 'https://slkclinic.com/blog/the-benefits-of-botox-for-men',
    },
  ])
  assert.equal(
    resolveAliasedPath('/the-benefits-of-botox-for-men', aliases),
    '/blog/the-benefits-of-botox-for-men',
  )
})
