import { useEffect, useState } from 'react'
import type { PublishVerification, ReviewDiff } from '../data'
import { colors } from '../theme'
import { HButton } from '../lib/Hover'
import { CopyOnHover } from './CopyOnHover'

type ReviewItem = {
  id: string
  title: string
  detail: string
  type: string
  risk: string
  reviewer: string
  dest: string
  diff?: ReviewDiff | null
  verification?: PublishVerification | null
  pending: boolean
  published: boolean
  canPublish?: boolean
  resolvedLabel: string
}

/** Post-push verification result: proves each change rendered on the live site. */
function VerificationPanel({ verification }: { verification: PublishVerification }) {
  const allOk = verification.ok
  return (
    <div
      style={{
        marginTop: 16,
        padding: '12px 14px',
        borderRadius: 8,
        background: allOk ? colors.greenBg : colors.amberBg,
        border: `1px solid ${allOk ? `${colors.green}44` : `${colors.amber}55`}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 650, color: allOk ? colors.green : colors.text }}>
          {allOk ? 'Verified live on WordPress' : 'Pushed — some checks need attention'}
        </span>
        {verification.verifiedUrl ? (
          <a
            href={verification.verifiedUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11.5, color: colors.accent, marginLeft: 'auto' }}
          >
            View live page
          </a>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {verification.checks.map((c) => (
          <div key={c.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span
              aria-hidden="true"
              style={{ fontSize: 12, fontWeight: 700, color: c.ok ? colors.green : colors.red, lineHeight: 1.5 }}
            >
              {c.ok ? '\u2713' : '\u2717'}
            </span>
            <span style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600 }}>{c.label}:</strong> {c.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export type ReviewActions = {
  busy?: boolean
  pushBlockedReason?: string | null
  onApprove: (edits: Record<string, string>) => void | Promise<void>
  onPushToWordPress: (edits: Record<string, string>) => void | Promise<void>
  onReject: () => void
}

function describePushPlan(diff: ReviewDiff) {
  const seo: string[] = []
  const elementor: string[] = []
  const schema: string[] = []
  const manual: string[] = []
  if (diff.title?.before.trim() !== diff.title?.after.trim()) seo.push('SEO title')
  if (diff.meta?.before.trim() !== diff.meta?.after.trim()) seo.push('meta description')
  for (const block of diff.content ?? []) {
    if (block.before.trim() === block.after.trim()) continue
    const tab = block.tab.toLowerCase()
    if (tab.includes('schema')) {
      schema.push('FAQ/schema graph')
    } else if (tab.includes('heading') || tab.includes('h1') || tab.includes('body') || tab.includes('link')) {
      elementor.push(block.tab)
    } else if (tab.includes('faq') && block.elementorReady) {
      elementor.push('FAQ section')
    } else if (tab.includes('faq') && block.postContentReady) {
      elementor.push('FAQ into post body')
    } else if (tab.includes('faq')) {
      manual.push(block.tab)
    } else {
      manual.push(block.tab)
    }
  }
  return { seo, elementor, schema, manual }
}

function PushPlanSummary({ diff }: { diff: ReviewDiff }) {
  const { seo, elementor, schema, manual } = describePushPlan(diff)
  const hasPush = seo.length > 0 || elementor.length > 0 || schema.length > 0

  return (
    <div style={{ fontSize: 13, color: colors.text, lineHeight: 1.55 }}>
      <div style={{ fontSize: 11, fontWeight: 650, color: colors.muted2, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
        What happens when you finish
      </div>
      {hasPush ? (
        <>
          {seo.length > 0 ? (
            <p style={{ margin: '0 0 8px' }}>
              <strong style={{ fontWeight: 600 }}>Push to WordPress</strong> updates{' '}
              {seo.join(' and ')} via your SEO plugin (Yoast, Rank Math, etc.).
            </p>
          ) : null}
          {elementor.length > 0 ? (
            <p style={{ margin: seo.length > 0 ? '0 0 10px' : '0 0 10px' }}>
              {seo.length > 0 ? 'It also' : 'Push to WordPress'}{' '}
              {elementor.some((t) => t.toLowerCase().includes('faq'))
                ? 'adds or updates'
                : 'patches'}{' '}
              {elementor.join(', ').toLowerCase()}
              {elementor.some((t) => t.toLowerCase().includes('post body'))
                ? ' on this post (inside your Single Post template content area).'
                : ' in Elementor on this page.'}
              {elementor.some((t) => t.toLowerCase().includes('faq') && !elementor.some((t) => t.toLowerCase().includes('post body')))
                ? ' FAQ is inserted before the final consultation CTA. Open the visual builder after push to fine-tune spacing and layout.'
                : ''}
              {!elementor.some((t) => t.toLowerCase().includes('faq')) &&
              elementor.some((t) => !t.toLowerCase().includes('post body'))
                ? ' Links are added in body copy on this page, pointing out to other URLs.'
                : ''}
            </p>
          ) : null}
          {schema.length > 0 ? (
            <p style={{ margin: '0 0 10px' }}>
              Adds {schema.join(', ').toLowerCase()} into Yoast&apos;s structured data output (not the page body).
            </p>
          ) : null}
        </>
      ) : (
        <p style={{ margin: '0 0 10px', color: colors.muted }}>
          Nothing in this plan can be pushed automatically. Copy from the tabs above and apply in WordPress.
        </p>
      )}
      {manual.length > 0 ? (
        <p style={{ margin: 0, color: colors.muted }}>
          <strong style={{ fontWeight: 600, color: colors.text }}>Apply manually:</strong>{' '}
          {manual.join(', ')}. New Elementor sections and full page layouts stay manual: copy the
          generated JSON into Elementor&apos;s template importer when you are ready.
        </p>
      ) : null}
      <p style={{ margin: '12px 0 0', fontSize: 12.5, color: colors.muted2 }}>
        Use <strong style={{ fontWeight: 600, color: colors.text }}>Approve</strong> if you applied everything yourself. Use{' '}
        <strong style={{ fontWeight: 600, color: colors.text }}>Reject</strong> to discard this game plan.
      </p>
    </div>
  )
}

function EditableDiffBlock({
  label,
  before,
  after,
  fieldKey,
  edits,
  onEdit,
  onCopied,
  readOnly,
}: {
  label: string
  before: string
  after: string
  fieldKey: string
  edits: Record<string, string>
  onEdit: (key: string, value: string) => void
  onCopied: () => void
  readOnly?: boolean
}) {
  const value = edits[fieldKey] ?? after

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 650,
          color: colors.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: 10.5, color: colors.muted2, marginBottom: 4 }}>Current</div>
          <CopyOnHover text={before} onCopied={onCopied}>
            <pre
              style={{
                margin: 0,
                padding: '10px 36px 10px 12px',
                borderRadius: 8,
                background: '#faf9f6',
                border: `1px solid ${colors.hair}`,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: colors.muted,
                lineHeight: 1.5,
                minHeight: 72,
              }}
            >
              {before || '(empty)'}
            </pre>
          </CopyOnHover>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: colors.muted2, marginBottom: 4 }}>Proposed</div>
          <CopyOnHover text={value} onCopied={onCopied}>
            {readOnly ? (
              <pre
                style={{
                  margin: 0,
                  padding: '10px 36px 10px 12px',
                  borderRadius: 8,
                  background: '#f0faf4',
                  border: `1px solid #c8e6d4`,
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: colors.ink,
                  lineHeight: 1.5,
                  minHeight: 72,
                }}
              >
                {value || '(empty)'}
              </pre>
            ) : (
              <textarea
                value={value}
                onChange={(e) => onEdit(fieldKey, e.target.value)}
                style={{
                  width: '100%',
                  minHeight: 72,
                  padding: '10px 36px 10px 12px',
                  borderRadius: 8,
                  background: '#f0faf4',
                  border: `1px solid #c8e6d4`,
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: colors.ink,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            )}
          </CopyOnHover>
        </div>
      </div>
    </div>
  )
}

export function ReviewFocusPanel({
  item,
  onBack,
  onViewAll,
  showToast,
  actions,
  embedded,
  hideDiffBody,
  pushEdits,
  regenerateAvailable,
}: {
  item: ReviewItem
  onBack: () => void
  onViewAll: () => void
  showToast: (msg: string) => void
  actions?: ReviewActions
  /** When true, only the diff + action bar render (no back link or title header). */
  embedded?: boolean
  /** When true with embedded, hide the full diff — content lives in editor tabs above. */
  hideDiffBody?: boolean
  /** Live text from the editor tabs — used when pushing to WordPress. */
  pushEdits?: Record<string, string>
  /** Show copy when a prior push completed and the user can regenerate above. */
  regenerateAvailable?: boolean
}) {
  const [edits, setEdits] = useState<Record<string, string>>(pushEdits ?? {})

  useEffect(() => {
    if (pushEdits) setEdits(pushEdits)
  }, [pushEdits])

  const diff = item.diff
  const hasDiff =
    diff &&
    (diff.title ||
      diff.meta ||
      (diff.content && diff.content.length > 0) ||
      (diff.manual && diff.instructions))

  const isComplete = !item.pending && !item.canPublish
  const pushBlocked = !!actions?.pushBlockedReason
  const showActions = !!actions && (item.pending || item.canPublish)
  const publishOnly = !!item.canPublish && !item.pending

  return (
    <div>
      {!embedded ? (
      <HButton
        onClick={onBack}
        hover={{ textDecoration: 'underline' }}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: 11.5,
          fontWeight: 550,
          color: colors.accent,
          marginBottom: 12,
        }}
      >
        ← Back to opportunities
      </HButton>
      ) : null}

      <div
        style={{
          background: '#fff',
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {!embedded ? (
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${colors.hair}` }}>
          <div style={{ fontSize: 11, fontWeight: 650, color: colors.muted2, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {isComplete ? 'Completed change' : 'Review this change'}
          </div>
          <h2 style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 650, letterSpacing: '-.01em' }}>{item.title}</h2>
          <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 6 }}>{item.detail}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 550, color: colors.muted, background: colors.chipBg, borderRadius: 6, padding: '2px 8px' }}>
              {item.type}
            </span>
            <span style={{ fontSize: 11, color: colors.muted2 }}>Risk: {item.risk}</span>
            <span style={{ fontSize: 11, color: colors.muted2 }}>→ {item.dest}</span>
            {isComplete ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: item.resolvedLabel === 'Rejected' ? colors.red : colors.green,
                  background: item.resolvedLabel === 'Rejected' ? colors.redBg : colors.greenBg,
                  borderRadius: 6,
                  padding: '2px 8px',
                }}
              >
                {item.resolvedLabel}
              </span>
            ) : null}
          </div>
        </div>
        ) : null}

        <div style={{ padding: '18px 20px' }}>
          {isComplete && item.verification && item.verification.checks.length > 0 ? (
            <VerificationPanel verification={item.verification} />
          ) : null}
          {hideDiffBody && diff ? (
            <PushPlanSummary diff={diff} />
          ) : hideDiffBody ? (
            <div style={{ fontSize: 13, color: colors.muted, lineHeight: 1.55 }}>
              {item.canPublish && !item.pending
                ? 'Approved and ready to publish. Use the button above or in the verified draft panel.'
                : isComplete && regenerateAvailable
                  ? 'This was already pushed to WordPress. Use Regenerate game plan above to rebuild with the latest fixes, then approve and push again.'
                  : isComplete
                    ? 'This change is complete.'
                    : 'Review each section in the tabs above, then push or mark complete when you are ready.'}
            </div>
          ) : !hasDiff ? (
            <div style={{ fontSize: 13, color: colors.muted, lineHeight: 1.55 }}>
              No side-by-side preview for this item yet. Open Workspace to generate or edit the suggested
              change, then return here to approve and publish.
            </div>
          ) : diff?.manual && diff.instructions ? (
            <div style={{ fontSize: 13, color: colors.text, lineHeight: 1.55 }}>
              <strong style={{ fontWeight: 600 }}>Manual step:</strong> {diff.instructions}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: colors.text, lineHeight: 1.5 }}>
                {isComplete
                  ? 'This change is complete. Hover over any text to copy it to your clipboard.'
                  : 'Compare current and proposed copy. Edit the proposed text if needed, then approve and push to WordPress or mark complete if you will apply it manually.'}
              </div>
              {diff?.title ? (
                <EditableDiffBlock
                  label="SEO title"
                  before={diff.title.before}
                  after={diff.title.after}
                  fieldKey="title"
                  edits={edits}
                  onEdit={(k, v) => setEdits((prev) => ({ ...prev, [k]: v }))}
                  onCopied={() => showToast('Copied to clipboard')}
                  readOnly={isComplete}
                />
              ) : null}
              {diff?.meta ? (
                <EditableDiffBlock
                  label="Meta description"
                  before={diff.meta.before}
                  after={diff.meta.after}
                  fieldKey="meta"
                  edits={edits}
                  onEdit={(k, v) => setEdits((prev) => ({ ...prev, [k]: v }))}
                  onCopied={() => showToast('Copied to clipboard')}
                  readOnly={isComplete}
                />
              ) : null}
              {diff?.meta && diff.meta.before.trim() === diff.meta.after.trim() && !isComplete ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: colors.amberBg,
                    border: `1px solid ${colors.amber}44`,
                    fontSize: 12,
                    color: colors.text,
                    lineHeight: 1.5,
                  }}
                >
                  This meta description already matches what is on the page. The proposed update may
                  have been applied, or suggestions need to be regenerated after a WordPress sync.
                </div>
              ) : null}
              {diff?.content?.map((c) => (
                <EditableDiffBlock
                  key={c.tab}
                  label={c.tab}
                  before={c.before}
                  after={c.after}
                  fieldKey={c.tab}
                  edits={edits}
                  onEdit={(k, v) => setEdits((prev) => ({ ...prev, [k]: v }))}
                  onCopied={() => showToast('Copied to clipboard')}
                  readOnly={isComplete}
                />
              ))}
            </>
          )}

          {showActions ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 20,
                paddingTop: 16,
                borderTop: `1px solid ${colors.hair}`,
                flexWrap: 'wrap',
              }}
            >
              <HButton
                onClick={() => {
                  if (actions.busy || pushBlocked) return
                  void actions.onPushToWordPress(edits)
                }}
                hover={actions.busy || pushBlocked ? undefined : { background: colors.inkStrong }}
                title={pushBlocked ? (actions.pushBlockedReason ?? undefined) : undefined}
                style={{
                  background: colors.ink,
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#fff',
                  opacity: actions.busy || pushBlocked ? 0.55 : 1,
                  cursor: actions.busy || pushBlocked ? 'not-allowed' : 'pointer',
                }}
              >
                {actions.busy ? 'Publishing…' : publishOnly ? 'Publish to WordPress' : 'Push to WordPress'}
              </HButton>
              {!publishOnly ? (
                <>
                  <HButton
                    onClick={() => {
                      if (actions.busy) return
                      void actions.onApprove(edits)
                    }}
                    hover={actions.busy ? undefined : { background: '#1a8450' }}
                    style={{
                      background: colors.green,
                      border: `1px solid ${colors.green}`,
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: '#fff',
                      opacity: actions.busy ? 0.7 : 1,
                    }}
                  >
                    Approve
                  </HButton>
                  <HButton
                    onClick={() => {
                      if (actions.busy) return
                      actions.onReject()
                    }}
                    hover={actions.busy ? undefined : { background: colors.redBg }}
                    style={{
                      background: '#fff',
                      border: `1px solid ${colors.borderBtn}`,
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 12.5,
                      fontWeight: 550,
                      color: colors.red,
                    }}
                  >
                    Reject
                  </HButton>
                </>
              ) : null}
              {pushBlocked ? (
                <div style={{ width: '100%', fontSize: 11.5, color: colors.muted, lineHeight: 1.45 }}>
                  {actions.pushBlockedReason} Use Approve if you pasted the text into WordPress yourself.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <HButton
        onClick={onViewAll}
        hover={{ textDecoration: 'underline' }}
        style={{
          marginTop: 14,
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: 12,
          fontWeight: 550,
          color: colors.muted2,
        }}
      >
        View all items in review queue
      </HButton>
    </div>
  )
}
