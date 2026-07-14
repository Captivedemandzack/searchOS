export type ParsedWhy = {
  keyword?: string
  position?: number
  impressions?: string
  ctr?: string
  signal?: string
  /** Fallback when the string does not match a known GSC pattern. */
  note?: string
}

/** Turn opportunity `why` prose into scannable fields. */
export function parseOpportunityWhy(why: string): ParsedWhy {
  const trimmed = why.trim()
  if (!trimmed) return {}

  const striking = trimmed.match(
    /^"([^"]+)"\s+at position\s+([\d.]+)\s+with\s+([\d,.]+[KkMm]?)\s+impressions\s*[—–-]\s*(.+)$/i,
  )
  if (striking) {
    const tail = striking[4].trim()
    const signal = tail.toLowerCase().startsWith('striking distance')
      ? 'Striking distance'
      : tail.split(',')[0]?.trim() || tail
    return {
      keyword: striking[1],
      position: Number(striking[2]),
      impressions: striking[3],
      signal,
    }
  }

  const ctr = trimmed.match(
    /^([\d,.]+[KkMm]?)\s+impressions at\s+([\d.]+)% CTR\s*[—–-]\s*position\s+([\d.]+)/i,
  )
  if (ctr) {
    const topQuery = trimmed.match(/top query:\s*"([^"]+)"/i)?.[1]
    return {
      keyword: topQuery,
      impressions: ctr[1],
      ctr: `${ctr[2]}%`,
      position: Number(ctr[3]),
    }
  }

  const keywordOnly = trimmed.match(/^"([^"]+)"/)
  if (keywordOnly) {
    return { keyword: keywordOnly[1], note: trimmed }
  }

  return { note: trimmed }
}

export function displayPagePath(pageOrUrl: string): string {
  const raw = pageOrUrl.trim()
  if (!raw) return ''
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const u = new URL(raw)
      return u.pathname || '/'
    }
  } catch {
    /* use raw */
  }
  return raw.split(/\s/)[0] ?? raw
}
