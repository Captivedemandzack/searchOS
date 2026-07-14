/**
 * Pexels stock-photo search — picks a featured image for a generated blog post.
 * Free API; the key lives in PEXELS_API_KEY (server/.env.local).
 */
export type PexelsPhoto = {
  url: string // direct image URL (large, ~1200px)
  alt: string
  credit: string // attribution
  downloadUrl: string // the URL to fetch bytes from for WP upload
}

export function hasPexelsKey(): boolean {
  return !!process.env.PEXELS_API_KEY
}

export async function searchPexels(query: string): Promise<PexelsPhoto | null> {
  const key = process.env.PEXELS_API_KEY
  if (!key) throw new Error('No Pexels API key. Set PEXELS_API_KEY in server/.env.local.')
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&size=medium`
  const res = await fetch(url, { headers: { Authorization: key } })
  if (!res.ok) throw new Error(`Pexels search failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as {
    photos?: { src: { large: string; large2x: string }; alt: string; photographer: string; photographer_url: string }[]
  }
  const photo = json.photos?.[0]
  if (!photo) return null
  return {
    url: photo.src.large,
    downloadUrl: photo.src.large2x || photo.src.large,
    alt: photo.alt || query,
    credit: `Photo by ${photo.photographer} on Pexels`,
  }
}
