import { blogGapAudit } from './blogGapAudit.ts'
import { competitorGapAudit } from './competitorGapAudit.ts'
import { contentAudit } from './contentAudit.ts'
import { croAudit } from './croAudit.ts'
import { eeatAudit } from './eeatAudit.ts'
import { internalLinkingAudit } from './internalLinkingAudit.ts'
import { localAudit } from './localAudit.ts'
import { metadataAudit } from './metadataAudit.ts'
import { serviceArchitectureAudit } from './serviceArchitectureAudit.ts'
import { crawlAudit } from './crawlAudit.ts'
import { pagespeedAudit } from './pagespeedAudit.ts'
import { indexationAudit } from './indexationAudit.ts'
import { technicalAudit } from './technicalAudit.ts'
import type { Audit } from './types.ts'

export const AUDIT_REGISTRY: Audit[] = [
  contentAudit,
  metadataAudit,
  blogGapAudit,
  competitorGapAudit,
  serviceArchitectureAudit,
  internalLinkingAudit,
  technicalAudit,
  crawlAudit,
  pagespeedAudit,
  indexationAudit,
  localAudit,
  croAudit,
  eeatAudit,
]

export function getAudit(id: string): Audit | undefined {
  return AUDIT_REGISTRY.find((a) => a.id === id)
}
