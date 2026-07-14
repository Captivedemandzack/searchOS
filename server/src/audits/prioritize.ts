import type { ContentPolicy } from '../contentPolicy.ts'
import type { FindingDraft, RankedFinding } from './types.ts'

const EFFORT: Record<string, number> = { Low: 1, Medium: 2, High: 3.2 }

function impactFromClicks(clicks: number): 'High' | 'Medium' | 'Low' {
  if (clicks >= 100) return 'High'
  if (clicks >= 30) return 'Medium'
  return 'Low'
}

/** One global ranking function for every Finding across every audit. */
export function rankFindings(drafts: FindingDraft[], policy: ContentPolicy): RankedFinding[] {
  return drafts
    .map((f) => {
      const effortW = EFFORT[f.effort] ?? 2
      const intentBoost =
        f.category === 'Service pages' ? policy.servicePageBonus
        : f.category === 'Conversion' ? 1.8
        : f.category === 'Local' ? 1.6
        : f.category === 'New content' ? 1.2
        : 1
      const bookingBoost = f.estBookingValue != null && f.estBookingValue > 0 ? 1 + Math.min(f.estBookingValue / 100, 0.5) : 1
      const priorityValue = f.suppressRank
        ? 0
        : (f.estMonthlyClicks * intentBoost * bookingBoost * f.confidence) / effortW
      return {
        ...f,
        impact: f.impact || impactFromClicks(f.estMonthlyClicks),
        priorityValue: Math.round(priorityValue * 10) / 10,
      }
    })
    .sort(
      (a, b) =>
        b.priorityValue - a.priorityValue ||
        b.estMonthlyClicks - a.estMonthlyClicks ||
        a.subjectRef.localeCompare(b.subjectRef),
    )
}
