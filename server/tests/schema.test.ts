import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFaqPageSchema,
  collectSchemaTypes,
  extractLiveSchemaFromWpItem,
  planSchemaDelta,
} from '../src/schema.ts'

test('extractLiveSchemaFromWpItem reads yoast_head_json.schema', () => {
  const raw = extractLiveSchemaFromWpItem({
    yoast_head_json: {
      schema: {
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'BlogPosting', headline: 'Test' }],
      },
    },
  })
  assert.ok(raw?.includes('BlogPosting'))
})

test('collectSchemaTypes finds nested graph types', () => {
  const types = collectSchemaTypes(
    JSON.stringify({
      '@graph': [
        { '@type': 'WebPage' },
        { '@type': 'BlogPosting' },
        { '@type': 'Organization' },
      ],
    }),
  )
  assert.ok(types.includes('BlogPosting'))
  assert.ok(types.includes('WebPage'))
})

test('planSchemaDelta: blog with Yoast graph needs FAQPage only when FAQ exists', () => {
  const live = JSON.stringify({ '@graph': [{ '@type': 'BlogPosting' }, { '@type': 'WebPage' }] })
  const withFaq = planSchemaDelta(live, { pageType: 'post', hasFaqContent: true })
  assert.deepEqual(withFaq.missing, ['FAQPage'])
  const noFaq = planSchemaDelta(live, { pageType: 'post', hasFaqContent: false })
  assert.deepEqual(noFaq.missing, [])
})

test('buildFaqPageSchema outputs valid FAQPage structure', () => {
  const json = buildFaqPageSchema(
    [{ q: 'How long does Botox last?', a: 'Typically 3 to 4 months.' }],
    'https://slkclinic.com/blog/botox',
  )
  const parsed = JSON.parse(json) as { '@type': string; mainEntity: unknown[] }
  assert.equal(parsed['@type'], 'FAQPage')
  assert.equal(parsed.mainEntity.length, 1)
})
