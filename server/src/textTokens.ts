const HEADING_STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'in', 'of', 'to', 'and', 'or', 'with', 'near', 'me', 'best', 'top',
  'your', 'our', 'how', 'what', 'is', 'are', 'vs', 'at', 'on', 'by', 'you', 'my', 'get', 'this',
])

/** Distinctive terms for topical matching (headings, link candidates, structure). */
export function significantTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !HEADING_STOPWORDS.has(w))
}
