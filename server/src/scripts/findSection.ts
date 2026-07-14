import { prisma } from '../db'
import { parseElementorRoot, stripHtml } from '../elementorPatch'
import type { ElementorNode } from '../elementorPatch'

const slug = process.argv[2] ?? 'which-botox-lasts-the-longest-a-comparison-of-botulinum-toxins'
const needle = (process.argv[3] ?? 'consultation').toLowerCase()

const page = await prisma.page.findFirst({ where: { slug }, select: { elementorData: true } })
const parsed = parseElementorRoot(page!.elementorData!)

function allText(n: ElementorNode): string {
  const s = n.settings ?? {}
  const parts: string[] = []
  if (s.title) parts.push(stripHtml(String(s.title)))
  if (s.editor) parts.push(stripHtml(String(s.editor)))
  if (s.text) parts.push(stripHtml(String(s.text)))
  if (Array.isArray(n.elements)) for (const c of n.elements) parts.push(allText(c))
  return parts.join(' ')
}

parsed.root.forEach((root, i) => {
  const text = allText(root).toLowerCase()
  if (text.includes(needle) || root.settings?._groundwork_faq_section) {
    console.log(`[${i}] marker=${root.settings?._groundwork_faq_section ?? '-'} type=${root.elType}`)
    console.log('  ', allText(root).slice(0, 200).replace(/\s+/g, ' '))
  }
})

await prisma.$disconnect()
