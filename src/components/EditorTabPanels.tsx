import type { CSSProperties, ReactNode } from 'react'
import type { EditorItem } from '../data'
import type { SitePathIndex } from '../lib/sitePaths'
import { resolveLinkSuggestionText } from '../lib/sitePaths'
import { CopyOnHover } from './CopyOnHover'
import { colors, mono, th } from '../theme'

export type TabItemView = {
  it: EditorItem
  sectionLabel?: string
  charLimit?: number
}

function parseFaqPairs(text: string): { q: string; a: string }[] {
  const chunks = text.split(/\n(?=Q:\s)/i).filter((c) => c.trim())
  if (chunks.length === 0) return [{ q: text.trim(), a: '' }]
  return chunks.map((chunk) => {
    const m = chunk.match(/^Q:\s*(.+?)(?:\nA:\s*([\s\S]+))?$/i)
    if (m) return { q: m[1].trim(), a: (m[2] ?? '').trim() }
    return { q: chunk.trim(), a: '' }
  })
}

function parseLinkRows(text: string): { anchor: string; target: string; append?: boolean; legacy?: boolean; placement?: string }[] {
  const arrow = /\s*(?:→|->|—>|–>)\s*/i
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const addQuoted = line.match(/^Add\s+[""]([^""]+)[""]/i)
      if (addQuoted) {
        const rest = line.slice(addQuoted[0].length)
        const targetMatch = rest.match(new RegExp(`^${arrow.source}(\\S+)`, 'i'))
        const placementMatch = line.match(new RegExp(`${arrow.source}\\S+\\s+in\\s+(?:the\\s+)?(.+)$`, 'i'))
        if (targetMatch) {
          return {
            anchor: addQuoted[1].trim(),
            target: normalizeOutboundPath(targetMatch[1]),
            append: true,
            placement: placementMatch?.[1]?.trim().replace(/\s+section$/i, '').trim(),
          }
        }
      }

      const parts = line.split(arrow)
      if (parts.length >= 2) {
        let anchor = parts[0]
          .replace(/^[""]|[""]$/g, '')
          .replace(/^…+/g, '')
          .replace(/\s*\(unlinked\)\s*$/i, '')
          .trim()
        if (anchor.startsWith('…')) anchor = anchor.slice(1).trim()
        let targetPart = parts[parts.length - 1].trim()
        const placementMatch = targetPart.match(/\s+in\s+(?:the\s+)?(.+)$/i)
        if (placementMatch) targetPart = targetPart.slice(0, placementMatch.index).trim()
        return {
          anchor,
          target: normalizeOutboundPath(targetPart),
          placement: placementMatch?.[1]?.trim().replace(/\s+section$/i, '').trim(),
        }
      }

      // Legacy inbound format from older game plans — regenerate to refresh.
      const inbound = line.match(/^(\/\S+)\s*[—-]\s*[""]([^""]+)[""]\s*$/i)
      if (inbound) {
        return {
          anchor: inbound[2].trim(),
          target: inbound[1].trim(),
          legacy: true,
        }
      }

      return { anchor: line, target: '', legacy: false }
    })
}

function normalizeOutboundPath(target: string): string {
  const t = target.replace(/[.,;]+$/g, '').trim()
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      return new URL(t).pathname.replace(/\/$/, '') || '/'
    } catch {
      return t
    }
  }
  return t.startsWith('/') ? t : `/${t}`
}

function SuggestedCopyWrap({
  text,
  onCopied,
  children,
}: {
  text: string
  onCopied?: () => void
  children: ReactNode
}) {
  if (!onCopied || !text.trim()) return <>{children}</>
  return (
    <CopyOnHover text={text} onCopied={onCopied}>
      {children}
    </CopyOnHover>
  )
}

function BlockLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 650, letterSpacing: '.05em', textTransform: 'uppercase', color: colors.muted2, marginBottom: 8 }}>
      {children}
    </div>
  )
}

function TextBlock({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.6,
        color: muted ? colors.muted : colors.ink,
        whiteSpace: 'pre-wrap',
      }}
    >
      {text}
    </div>
  )
}

function ComparisonGrid({
  beforeLabel,
  afterLabel,
  before,
  after,
  afterStyle,
}: {
  beforeLabel: string
  afterLabel: string
  before: ReactNode
  after: ReactNode
  afterStyle?: CSSProperties
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      <div style={{ padding: '14px 18px', borderRight: `1px solid ${colors.hair2}` }}>
        <BlockLabel>{beforeLabel}</BlockLabel>
        {before}
      </div>
      <div style={{ padding: '14px 18px', background: colors.suggestBg, ...afterStyle }}>
        <BlockLabel>{afterLabel}</BlockLabel>
        {after}
      </div>
    </div>
  )
}

export function SeoSectionBody({
  sectionLabel,
  current,
  charLimit,
  isEditing,
  text,
  onTextChange,
  onCopied,
}: {
  sectionLabel: string
  current: string
  suggested: string
  charLimit?: number
  isEditing: boolean
  text: string
  onTextChange: (v: string) => void
  onCopied?: () => void
}) {
  const overLimit = charLimit != null && text.length > charLimit
  return (
    <div style={{ borderBottom: `1px solid ${colors.hair}` }}>
      <div style={{ padding: '10px 18px', background: colors.subtle, borderBottom: `1px solid ${colors.hair2}` }}>
        <span style={{ fontSize: 12, fontWeight: 650, color: colors.ink }}>{sectionLabel}</span>
        {charLimit != null ? (
          <span style={{ marginLeft: 8, fontSize: 11, color: overLimit ? colors.red : colors.muted2 }}>
            {text.length} / {charLimit} chars
          </span>
        ) : null}
      </div>
      <ComparisonGrid
        beforeLabel="Current"
        afterLabel="Suggested"
        before={<TextBlock text={current} muted />}
        after={
          isEditing ? (
            <textarea
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              style={{
                width: '100%',
                minHeight: 72,
                border: '1px solid #c7d2f2',
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                lineHeight: 1.6,
                color: colors.ink,
                resize: 'vertical',
                background: '#fff',
              }}
            />
          ) : (
            <SuggestedCopyWrap text={text} onCopied={onCopied}>
              <TextBlock text={text} />
            </SuggestedCopyWrap>
          )
        }
      />
    </div>
  )
}

export function FaqTabBody({
  current,
  suggested,
  elementorJson,
  delivery = 'post_content',
  onCopied,
}: {
  current: string
  suggested: string
  elementorJson?: string | null
  delivery?: 'elementor' | 'post_content'
  onCopied?: () => void
}) {
  const afterPairs = parseFaqPairs(suggested)
  const hasElementor = delivery === 'elementor' && !!elementorJson?.trim()
  return (
    <ComparisonGrid
      beforeLabel="Current"
      afterLabel={hasElementor ? 'Suggested FAQs + Elementor section' : 'Suggested FAQs'}
      before={<TextBlock text={current || 'No FAQ section on this page yet.'} muted />}
      after={
        <div>
          <SuggestedCopyWrap text={suggested} onCopied={onCopied}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {afterPairs.map((pair, i) => (
                <div
                  key={`${pair.q}-${i}`}
                  style={{
                    paddingBottom: i < afterPairs.length - 1 ? 12 : 0,
                    borderBottom:
                      i < afterPairs.length - 1 ? `1px solid ${colors.hair2}` : undefined,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 650, color: colors.ink, marginBottom: 4 }}>
                    {pair.q}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, color: colors.muted }}>
                    {pair.a || '—'}
                  </div>
                </div>
              ))}
            </div>
          </SuggestedCopyWrap>
          {hasElementor ? (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.hair2}` }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 650,
                  color: colors.muted2,
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                  marginBottom: 8,
                }}
              >
                Elementor section (push-ready)
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.55, color: colors.muted }}>
                Pushes as a native Elementor accordion before the final consultation CTA. The
                heading sits on the blog canvas; only the FAQ block carries the stone
                background so it feels part of the post. Edit spacing and colors in the
                visual builder after push.
              </p>
              <CopyOnHover text={elementorJson!} onCopied={onCopied ?? (() => undefined)}>
                <pre
                  style={{
                    margin: 0,
                    maxHeight: 180,
                    overflow: 'auto',
                    fontFamily: mono,
                    fontSize: 10.5,
                    lineHeight: 1.45,
                    color: colors.muted,
                    background: colors.chipBg,
                    borderRadius: 8,
                    padding: '10px 12px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {elementorJson}
                </pre>
              </CopyOnHover>
            </div>
          ) : afterPairs.length ? (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.hair2}` }}>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: colors.muted }}>
                {delivery === 'post_content' && afterPairs.length
                  ? 'Pushes into the post body so it appears inside your Single Post template content area. Style it in Elementor or your theme after push.'
                  : 'Pushes as HTML in page content.'}
              </p>
            </div>
          ) : null}
        </div>
      }
    />
  )
}

export function SchemaTabBody({
  current,
  suggested,
  reason,
  liveUrl,
  liveTypes,
  onCopied,
  onRefreshLive,
  refreshing,
}: {
  current: string
  suggested: string
  reason?: string
  liveUrl?: string | null
  liveTypes?: string[]
  onCopied?: () => void
  onRefreshLive?: () => void
  refreshing?: boolean
}) {
  const hasSuggestion = !!suggested.trim()
  const nothingToAddCopy =
    reason?.trim() ||
    (liveTypes?.includes('FAQPage')
      ? 'FAQPage schema is already live on this page. Nothing to add to Yoast\'s graph.'
      : 'Yoast already outputs what this page needs for this page type. Use the FAQ tab if you want FAQPage schema added.')
  return (
    <ComparisonGrid
      beforeLabel="Live on page (Yoast)"
      afterLabel={hasSuggestion ? 'Add to Yoast graph' : 'Nothing to add'}
      before={
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            {liveTypes?.length ? (
              liveTypes.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: colors.muted,
                    background: colors.chipBg,
                    borderRadius: 99,
                    padding: '2px 8px',
                  }}
                >
                  {t}
                </span>
              ))
            ) : (
              <span style={{ fontSize: 12, color: colors.muted }}>No types detected yet</span>
            )}
            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11.5, color: colors.accent, marginLeft: 'auto' }}
              >
                View live page
              </a>
            ) : null}
            {onRefreshLive ? (
              <button
                type="button"
                onClick={onRefreshLive}
                disabled={refreshing}
                style={{
                  fontSize: 11.5,
                  color: colors.muted,
                  background: 'transparent',
                  border: `1px solid ${colors.hair}`,
                  borderRadius: 6,
                  padding: '2px 8px',
                  cursor: refreshing ? 'default' : 'pointer',
                }}
              >
                {refreshing ? 'Refreshing…' : 'Refresh from WordPress'}
              </button>
            ) : null}
          </div>
          <pre
            style={{
              margin: 0,
              fontFamily: mono,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: colors.muted,
              whiteSpace: 'pre-wrap',
              maxHeight: 320,
              overflow: 'auto',
            }}
          >
            {current}
          </pre>
        </div>
      }
      after={
        hasSuggestion ? (
          <SuggestedCopyWrap text={suggested} onCopied={onCopied}>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.muted, lineHeight: 1.5 }}>
              Pushes into Yoast&apos;s schema graph on publish (not page body HTML).
            </p>
            <pre
              style={{
                margin: 0,
                fontFamily: mono,
                fontSize: 11.5,
                lineHeight: 1.5,
                color: colors.ink,
                whiteSpace: 'pre-wrap',
                maxHeight: 280,
                overflow: 'auto',
              }}
            >
              {suggested}
            </pre>
            {reason ? (
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: colors.muted2, lineHeight: 1.5 }}>{reason}</p>
            ) : null}
          </SuggestedCopyWrap>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: colors.muted, lineHeight: 1.55 }}>{nothingToAddCopy}</p>
        )
      }
    />
  )
}

function parseLinkEvidence(reason: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of reason.split('\n')) {
    const m = line.match(/^\d+\.\s+(\S+)\s+\([^)]*\)\s+—\s+topical overlap:\s+(.+)$/)
    if (m) map.set(m[1], m[2])
  }
  return map
}

export function LinksTabBody({
  current,
  suggested,
  reason,
  sitePaths,
  onCopied,
}: {
  current: string
  suggested: string
  reason?: string
  sitePaths: SitePathIndex
  onCopied?: () => void
}) {
  const resolvedSuggested = resolveLinkSuggestionText(suggested, sitePaths)
  const rows = parseLinkRows(resolvedSuggested)
  const evidenceByPath = parseLinkEvidence(reason ?? '')
  const hasLegacy = rows.some((r) => r.legacy)
  return (
    <ComparisonGrid
      beforeLabel="Current links on this page"
      afterLabel="Suggested links"
      before={<TextBlock text={current || 'No outbound links in body copy yet.'} muted />}
      after={
        <SuggestedCopyWrap text={resolvedSuggested} onCopied={onCopied}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {hasLegacy ? (
              <div
                style={{
                  fontSize: 12,
                  color: colors.amber,
                  background: colors.amberBg,
                  borderRadius: 8,
                  padding: '8px 10px',
                  lineHeight: 1.5,
                }}
              >
                Regenerate the game plan to refresh these link suggestions.
              </div>
            ) : null}
            {rows.map((row, i) => {
              const path = row.target ? sitePaths.resolvePath(row.target) : ''
              const href = path ? sitePaths.liveUrl(path) : null
              const pageTitle = path ? sitePaths.title(path) : undefined
              const overlap = path ? evidenceByPath.get(path) : undefined
              return (
                <div key={`${path}-${row.anchor}-${i}`} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  {row.legacy ? (
                    <div style={{ color: colors.muted }}>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontFamily: mono, fontSize: 11.5, color: colors.accent, textDecoration: 'none' }}
                        >
                          {path}
                        </a>
                      ) : (
                        <span style={{ fontFamily: mono, fontSize: 11.5 }}>{path}</span>
                      )}
                      {' · '}
                      <span style={{ color: colors.ink }}>&quot;{row.anchor}&quot;</span>
                    </div>
                  ) : row.target ? (
                    <>
                      <div style={{ color: colors.ink, fontWeight: 600 }}>&quot;{row.anchor}&quot;</div>
                      <div style={{ marginTop: 4, color: colors.muted }}>
                        {pageTitle ? <span>{pageTitle}</span> : null}
                        {pageTitle ? <span style={{ margin: '0 6px', color: colors.faint }}>·</span> : null}
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontFamily: mono,
                              fontSize: 11.5,
                              color: colors.accent,
                              textDecoration: 'underline',
                              textUnderlineOffset: 2,
                            }}
                          >
                            {path}
                          </a>
                        ) : (
                          <span style={{ fontFamily: mono, fontSize: 11.5, color: colors.accent }}>{path}</span>
                        )}
                      </div>
                      {row.append && row.placement ? (
                        <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 4 }}>{row.placement}</div>
                      ) : null}
                      {overlap ? (
                        <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 4 }}>
                          Overlap: {overlap}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div style={{ color: colors.muted }}>{row.anchor}</div>
                  )}
                </div>
              )
            })}
          </div>
        </SuggestedCopyWrap>
      }
    />
  )
}

export function HeadingsTabBody({
  current,
  isEditing,
  text,
  onTextChange,
  onCopied,
  isBlogPost,
}: {
  current: string
  suggested: string
  isEditing: boolean
  text: string
  onTextChange: (v: string) => void
  onCopied?: () => void
  /** Blog posts: post title is the H1; this tab is in-body H2/H3 only. */
  isBlogPost?: boolean
}) {
  return (
    <ComparisonGrid
      beforeLabel={isBlogPost ? 'Current in-body headings' : 'Current headings'}
      afterLabel={isBlogPost ? 'Suggested in-body headings (H2/H3)' : 'Suggested headings'}
      before={<TextBlock text={current} muted />}
      after={
        <>
          {isBlogPost ? (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.muted, lineHeight: 1.5 }}>
              The WordPress post title is the on-page H1 and is not changed here (URL slug stays the same).
              Use the SEO tab for the Google search results title.
            </p>
          ) : null}
          {isEditing ? (
            <textarea
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              style={{
                width: '100%',
                minHeight: 88,
                border: '1px solid #c7d2f2',
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                lineHeight: 1.6,
                fontFamily: mono,
                color: colors.ink,
                resize: 'vertical',
                background: '#fff',
              }}
            />
          ) : (
            <SuggestedCopyWrap text={text} onCopied={onCopied}>
              <pre style={{ margin: 0, fontFamily: mono, fontSize: 12.5, lineHeight: 1.55, color: colors.ink, whiteSpace: 'pre-wrap' }}>{text}</pre>
            </SuggestedCopyWrap>
          )}
        </>
      }
    />
  )
}

export function BodyTabBody({
  current,
  isEditing,
  text,
  onTextChange,
  onCopied,
}: {
  current: string
  suggested: string
  isEditing: boolean
  text: string
  onTextChange: (v: string) => void
  onCopied?: () => void
}) {
  return (
    <ComparisonGrid
      beforeLabel="Current copy"
      afterLabel="Suggested copy"
      before={<TextBlock text={current} muted />}
      after={
        isEditing ? (
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            style={{
              width: '100%',
              minHeight: 120,
              border: '1px solid #c7d2f2',
              borderRadius: 8,
              padding: 10,
              fontSize: 13,
              lineHeight: 1.65,
              color: colors.ink,
              resize: 'vertical',
              background: '#fff',
            }}
          />
        ) : (
          <SuggestedCopyWrap text={text} onCopied={onCopied}>
            <TextBlock text={text} />
          </SuggestedCopyWrap>
        )
      }
    />
  )
}

export function DefaultTabBody({
  current,
  isEditing,
  text,
  onTextChange,
  charLimit,
  onCopied,
}: {
  current: string
  suggested: string
  isEditing: boolean
  text: string
  onTextChange: (v: string) => void
  charLimit?: number
  onCopied?: () => void
}) {
  const overLimit = charLimit != null && text.length > charLimit
  return (
    <ComparisonGrid
      beforeLabel="Current"
      afterLabel="Suggested"
      before={
        <>
          {charLimit != null ? <span style={{ ...th, display: 'block', marginBottom: 6 }}>Current</span> : null}
          <TextBlock text={current} muted />
        </>
      }
      after={
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ ...th, color: colors.accent }}>Suggested</span>
            {charLimit != null ? (
              <span style={{ fontSize: 11, color: overLimit ? colors.red : colors.faint, fontWeight: overLimit ? 650 : 400 }}>
                {text.length} chars
              </span>
            ) : null}
          </div>
          {isEditing ? (
            <textarea
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              style={{
                width: '100%',
                minHeight: 88,
                border: '1px solid #c7d2f2',
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                lineHeight: 1.6,
                color: colors.ink,
                resize: 'vertical',
                background: '#fff',
              }}
            />
          ) : (
            <SuggestedCopyWrap text={text} onCopied={onCopied}>
              <TextBlock text={text} />
            </SuggestedCopyWrap>
          )}
        </>
      }
    />
  )
}
