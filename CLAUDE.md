# Groundwork (searchOS)

SEO operating system for WordPress + Elementor sites. React + Vite frontend, Fastify + Prisma + SQLite backend. Primary client: **SLK Clinic** (`slkclinic.com`).

GitHub: https://github.com/Captivedemandzack/searchOS

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, `@tanstack/react-query` |
| Backend | Fastify, Prisma, SQLite |
| AI | Anthropic Claude (`server/src/anthropic.ts`) |
| WordPress | REST API + Groundwork Connector plugin v1.4.0 |
| SEO data | Google Search Console + GA4 (OAuth) |

**Package manager:** `npm` (root + `server/`). `bun` also works for one-off scripts in `server/`.

**Tests:** `npm run test` (runs `server/tests/*.test.ts` via tsx).

## Run locally

```bash
# Kill zombie API first (tsx watch crash-loops on EADDRINUSE otherwise)
lsof -nP -iTCP:8787 -sTCP:LISTEN -t | xargs kill 2>/dev/null

npm install && npm install --prefix server
npm run dev          # web :5173 + API :8787 (Vite proxies /api)
```

**Never run `npm run db:reset`** unless you intend to wipe all SLK synced data, recommendations, review items, and encrypted connections.

## Local-only files (never commit, never delete casually)

| File | Contains |
|---|---|
| `server/prisma/dev.db` | SQLite DB: GSC/GA4 rows, pages, opportunities, recommendations, review items, **encrypted** WP + Google tokens |
| `server/.env.local` | `ENCRYPTION_KEY`, Google OAuth creds, `ANTHROPIC_API_KEY` |

Copy **both together** when moving machines. `ENCRYPTION_KEY` must match the DB or encrypted tokens decrypt as garbage.

Template for fresh setup: `server/.env.example` → copy to `.env.local`.

Recovery after accidental `db:reset`: `npm run recover:creds --prefix server` (WP creds from DB freelist; Google may still need re-OAuth in Settings).

## Connections

Stored in `Site` row (`server/prisma/schema.prisma`):

- `wpBaseUrl`, `wpUsername`, `wpAppPasswordEnc` — WordPress Application Password (AES-256-GCM)
- `googleRefreshTokenEnc`, `gscProperty`, `ga4Property` — Google OAuth

Re-connect in **Settings** view if broken. WordPress uses the app DB only (no separate MCP). Google is a 30-second OAuth re-flow.

## Product workflow

Detect → Prioritize → Diagnose → Generate → Approve → Publish → Verify

1. **Opportunities** — GSC-driven, scored by impact × confidence ÷ effort
2. **Opportunity detail** — diagnosis + content tabs + autonomous run
3. **Content Updates** — tabbed editor: title, meta, headings, body, FAQ, schema, links
4. **Review Queue** — human approval gate; nothing publishes without it
5. **Autonomous workflow** — `POST /api/sites/:siteId/opportunities/:oppId/run-autonomous` generates content, runs **publish readiness** checks, auto-approves to verified draft; **human clicks Publish** to push live
6. **Post-push verification** — `verificationJson` on ReviewItem confirms live page matches intent

## Key server modules (July 2026)

| Module | Purpose |
|---|---|
| `server/src/elementorFaq.ts` | FAQ Elementor accordion JSON; placed **before final CTA**; background on accordion items only (not section padding); `faq_schema: 'yes'` |
| `server/src/elementorPatch.ts` | Patch headings/body/links into Elementor; `normalizeElementorLinks` runs **before** link placement (strip old "Related reading" blocks, fix `/blog/` permalinks) |
| `server/src/linkCandidates.ts` | Internal link target ranking — source-centrality weighting (subject terms like "botox" are NOT penalized for being site-common) |
| `server/src/linkingStandards.ts` | Google 2025–2026 contextual linking rules; caps link count by word count |
| `server/src/publishReadiness.ts` | Pre-publish dry-run: proves all changes would land before any live write |
| `server/src/publishExecute.ts` | Push approved review items to WordPress; stores `verificationJson` |
| `server/src/publishVerify.ts` | Post-push live checks (FAQ answers visible, links, meta, etc.) |
| `server/src/schema.ts` | Yoast graph delta planning; FAQPage JSON-LD when missing from live graph |
| `server/src/contentPublish.ts` | Assemble review diff from recommendations |
| `wordpress-connector/groundwork-connector.php` | WP plugin v1.4.0 — schema graph injection, Elementor meta |

## Internal linking rules (important)

- **Contextual only** — links placed inline where a natural phrase exists in body text
- **No "Related reading" stuffing blocks** — removed on every Elementor push
- **Blog permalinks** must include `/blog/` — `normalizeElementorLinks` repairs bare slugs
- AI picks anchors verbatim from body; ranking picks targets from title + GSC queries + headings (not noisy full-body prose)
- Readiness links check is **non-blocking** (best-effort enhancement)

## FAQ + Schema

- **FAQ tab** generates Q&A + Elementor JSON for blog posts (pushes into post's Elementor data, not single-post template)
- **Schema tab** adds missing types to Yoast graph via Groundwork Connector — does NOT duplicate Article/BlogPosting
- If live Yoast graph already has `FAQPage` (from Elementor `faq_schema`), schema tab shows "Nothing to add" with the real reason (not "add FAQ first")

## Dev gotchas

1. **tsx watch + EADDRINUSE** — stale node process on :8787 means code changes never load. Kill port before `npm run dev`.
2. **Prisma client stale** — after `prisma db push`, `touch server/src/index.ts` to force tsx restart.
3. **DATABASE_URL** — Prisma resolves `file:./dev.db` relative to `prisma/schema.prisma` → actual file is `server/prisma/dev.db`.
4. **Recommendation page paths** — some old recs stored under full URL vs `/blog/slug`; generation uses `/blog/slug` canonical form.
5. **GSC scoring** — never `Math.max(...array)` on 100k+ rows (stack overflow); use loop helpers in `scoring.ts`.

## UI / UX conventions

Cursor rules live at `~/.cursor/rules/` (ux-design, ui-design, stack, motion-design). Key principles:

- 8pt spacing grid, no em dashes in UI copy
- Productivity tool motion: restrained, under 300ms
- Empty states need one clear CTA
- YMYL content requires named reviewer credentials

## MCP / external tools

- **WordPress, GSC, GA4** — through the app API, not MCP
- **Google Search Console MCP** — configured per IDE (Cursor vs Claude Code separately)
- **Browser MCP** — Cursor-only unless wired in Claude Code

## Project memory (Claude Code)

Also see `~/.claude/projects/-Users-yarn-searchOS/memory/`:

- `groundwork-real-data-state.md` — dashboard/opportunities/pages (July 8)
- `groundwork-cursor-handoff-july-2026.md` — FAQ, linking, publish workflow (July 13)
