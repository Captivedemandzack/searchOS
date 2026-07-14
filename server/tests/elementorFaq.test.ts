import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendFaqSectionToElementor,
  buildFaqElementorSection,
  extractElementorStyleTokens,
  faqUsesElementorSection,
  findFaqInsertIndex,
  findGroundworkFaqContainer,
  mergeFaqIntoPostContent,
} from '../src/elementorFaq.ts'
import { parseElementorRoot } from '../src/elementorPatch.ts'

const STYLE_TREE = JSON.stringify([
  {
    id: 'c1',
    elType: 'container',
    settings: {
      background_color: '#F5F3EF',
      boxed_width: { unit: 'px', size: 880 },
    },
    elements: [
      {
        id: 'h1',
        elType: 'widget',
        widgetType: 'heading',
        settings: {
          title: 'Botox in Nashville',
          title_color: '#222222',
          typography_font_family: 'Inter',
        },
      },
    ],
  },
])

const ACCORDION_TREE = JSON.stringify([
  {
    id: 'c1',
    elType: 'container',
    settings: {
      background_color: '#ECEBE8',
      boxed_width: { unit: 'px', size: 1100 },
    },
    elements: [
      {
        id: 'acc1',
        elType: 'widget',
        widgetType: 'accordion',
        settings: {
          title_color: '#322C2D',
          tab_active_color: '#58585B',
          content_color: '#58585B',
          border_color: '#D2D2D2',
          title_typography_font_family: 'Modny',
          content_typography_font_family: 'Quasimoda',
        },
      },
    ],
  },
])

test('extractElementorStyleTokens adopts heading font when no accordion exists', () => {
  const tokens = extractElementorStyleTokens(STYLE_TREE)
  // No accordion on the page → brand defaults, but heading font is adopted.
  assert.equal(tokens.faqBlockBg, '#ECEBE8')
  assert.equal(tokens.headingFont, 'Inter')
  assert.equal(tokens.boxedWidth, 1100)
})

test('extractElementorStyleTokens lifts styling from an existing accordion', () => {
  const tokens = extractElementorStyleTokens(ACCORDION_TREE)
  assert.equal(tokens.faqBlockBg, '#ECEBE8')
  assert.equal(tokens.boxedWidth, 1100)
  assert.equal(tokens.titleColor, '#322C2D')
  assert.equal(tokens.titleActiveColor, '#58585B')
  assert.equal(tokens.contentColor, '#58585B')
  assert.equal(tokens.borderColor, '#D2D2D2')
  assert.equal(tokens.titleFont, 'Modny')
  assert.equal(tokens.contentFont, 'Quasimoda')
})

test('buildFaqElementorSection builds accordion block on tinted inner container only', () => {
  const section = buildFaqElementorSection(
    [{ q: 'How long does Botox last?', a: 'Typically 3 to 4 months.' }],
    { styleReference: ACCORDION_TREE },
  )
  assert.equal(section.elType, 'container')
  assert.equal(section.settings?._groundwork_faq_section, '1')
  assert.equal(section.settings?.background_color, undefined)
  assert.equal(section.settings?.background_background, undefined)

  const block = section.elements?.find((e) => e.elType === 'container' && e.isInner)
  assert.ok(block, 'accordion must sit inside an inner container')
  assert.equal(block?.settings?.background_color, '#ECEBE8')

  const accordion = block?.elements?.find((e) => e.widgetType === 'accordion')
  assert.ok(accordion, 'inner container must wrap the accordion widget')
  assert.equal(accordion?.settings?.faq_schema, 'yes')
  const tabs = accordion?.settings?.tabs as { tab_title: string; tab_content: string }[]
  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].tab_title, 'How long does Botox last?')
  assert.ok(tabs[0].tab_content.includes('Typically 3 to 4 months'))
})

test('appendFaqSectionToElementor appends then replaces on second push', () => {
  const base = JSON.stringify([
    {
      id: 'main',
      elType: 'container',
      settings: {},
      elements: [],
    },
  ])
  const section = buildFaqElementorSection([{ q: 'Q1', a: 'A1' }])
  const first = appendFaqSectionToElementor(base, section)
  assert.equal(first.action, 'appended')
  const parsed1 = parseElementorRoot(first.elementorData)
  assert.equal(parsed1.root.length, 2)

  const section2 = buildFaqElementorSection([
    { q: 'Q1', a: 'A1 updated' },
    { q: 'Q2', a: 'A2' },
  ])
  const second = appendFaqSectionToElementor(first.elementorData, section2)
  assert.equal(second.action, 'replaced')
  const parsed2 = parseElementorRoot(second.elementorData)
  assert.equal(parsed2.root.length, 2)
  assert.ok(findGroundworkFaqContainer(parsed2.root))
  assert.ok(second.elementorData.includes('A1 updated'))
})

test('faqUsesElementorSection: routes by builder data, not post vs page', () => {
  // Posts built directly in Elementor render _elementor_data, not post_content.
  assert.equal(
    faqUsesElementorSection({ type: 'post', elementorData: '{}' }),
    true,
  )
  assert.equal(
    faqUsesElementorSection({ type: 'page', elementorData: '{}' }),
    true,
  )
  // No builder data → fall back to post_content HTML.
  assert.equal(
    faqUsesElementorSection({ type: 'post', elementorData: null }),
    false,
  )
  assert.equal(
    faqUsesElementorSection({ type: 'page', elementorData: '' }),
    false,
  )
})

test('findFaqInsertIndex places FAQ before final consultation CTA, not early Book Now', () => {
  const roots = [
    { id: 'intro', elType: 'container', settings: {}, elements: [] },
    {
      id: 'early-cta',
      elType: 'container',
      settings: {},
      elements: [{ id: 'b1', elType: 'widget', widgetType: 'button', settings: { text: 'Book Now' }, elements: [] }],
    },
    { id: 'body', elType: 'section', settings: {}, elements: [] },
    {
      id: 'final-cta-copy',
      elType: 'section',
      settings: {},
      elements: [
        {
          id: 't1',
          elType: 'widget',
          widgetType: 'text-editor',
          settings: { editor: '<p>BOOK YOUR FREE CONSULTATION at our Nashville location.</p>' },
          elements: [],
        },
      ],
    },
    {
      id: 'final-cta-btn',
      elType: 'container',
      settings: {},
      elements: [
        {
          id: 'b2',
          elType: 'widget',
          widgetType: 'button',
          settings: { text: 'Book a consultation' },
          elements: [],
        },
      ],
    },
    {
      id: 'refs',
      elType: 'container',
      settings: {},
      elements: [
        {
          id: 'r1',
          elType: 'widget',
          widgetType: 'text-editor',
          settings: { editor: '<p>References</p><ol><li>Study</li></ol>' },
          elements: [],
        },
      ],
    },
  ]
  assert.equal(findFaqInsertIndex(roots), 3)
})

test('appendFaqSectionToElementor inserts before CTA and repositions existing FAQ', () => {
  const base = JSON.stringify([
    { id: 'body', elType: 'section', settings: {}, elements: [] },
    {
      id: 'cta',
      elType: 'section',
      settings: {},
      elements: [
        {
          id: 't1',
          elType: 'widget',
          widgetType: 'text-editor',
          settings: { editor: 'BOOK YOUR FREE CONSULTATION' },
          elements: [],
        },
      ],
    },
    {
      id: 'faq-old',
      elType: 'container',
      settings: { _groundwork_faq_section: '1' },
      elements: [],
    },
  ])
  const section = buildFaqElementorSection([{ q: 'Q1', a: 'A1' }])
  const result = appendFaqSectionToElementor(base, section)
  assert.equal(result.insertIndex, 1)
  const parsed = parseElementorRoot(result.elementorData)
  assert.equal(parsed.root.length, 3)
  assert.equal(parsed.root[0].id, 'body')
  assert.equal(parsed.root[1].settings?._groundwork_faq_section, '1')
  assert.equal(parsed.root[2].id, 'cta')
  assert.ok(findGroundworkFaqContainer(parsed.root))
})

test('mergeFaqIntoPostContent inserts before free consultation CTA in HTML', () => {
  const html =
    '<p>Article body.</p>\n<p>BOOK YOUR FREE CONSULTATION at our Nashville location.</p>\n<h2>References</h2>'
  const out = mergeFaqIntoPostContent(html, [{ q: 'How long?', a: '3 to 4 months.' }])
  const faqPos = out.indexOf('groundwork-faq')
  const ctaPos = out.toLowerCase().indexOf('book your free consultation')
  const refPos = out.toLowerCase().indexOf('references')
  assert.ok(faqPos >= 0)
  assert.ok(faqPos < ctaPos)
  assert.ok(ctaPos < refPos)
})
