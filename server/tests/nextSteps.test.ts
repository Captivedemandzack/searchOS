import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNextSteps } from '../src/nextSteps.ts'

test('buildNextSteps dedupes GSC opportunities already in findings', async () => {
  const siteId = `test-next-steps-${Date.now()}`
  await import('../src/db.ts').then(({ prisma }) =>
    prisma.site.create({ data: { id: siteId, name: 'Test', domain: `${siteId}.example.com` } }),
  )

  const { prisma } = await import('../src/db.ts')
  await prisma.finding.create({
    data: {
      siteId,
      auditId: 'metadata',
      category: 'Metadata',
      subjectType: 'page',
      subjectRef: '/botox-nashville',
      subjectLabel: '/botox-nashville',
      title: 'Improve CTR on /botox-nashville',
      estMonthlyClicks: 120,
      effort: 'Low',
      fingerprint: 'metadata:ctrgap:/botox-nashville',
      priorityValue: 80,
      status: 'open',
      actionsJson: JSON.stringify([{ kind: 'meta_rewrite', label: 'Draft title & meta', requiresReviewer: false }]),
    },
  })
  await prisma.opportunity.create({
    data: {
      siteId,
      title: 'Duplicate CTR opportunity',
      page: '/botox-nashville',
      why: 'CTR below benchmark',
      expected: '+120 clicks/mo',
      impact: 'High',
      confidence: 90,
      effort: 'Low',
      source: 'GSC',
      type: 'Metadata',
      fingerprint: 'ctrgap:/botox-nashville',
      score: 75,
      status: 'Open',
    },
  })

  const { steps, total } = await buildNextSteps(siteId)
  assert.equal(total, 1)
  assert.equal(steps[0]?.kind, 'finding')

  await prisma.site.delete({ where: { id: siteId } })
})
