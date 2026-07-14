# Groundwork

An SEO management operating system for WordPress + Elementor sites — a React
implementation of the design exported from Claude Design
(`../project/SEO Operating System.dc.html`).

The product connects Google Search Console, GA4, WordPress, Elementor, and SEO
plugins (Rank Math / Yoast) to surface opportunities, prioritize them by impact ×
confidence ÷ effort, generate reviewable page/content/Elementor updates, and track
whether shipped changes actually moved rankings, clicks, and revenue. Nothing
publishes without passing through the Review Queue.

Demo data is a Nashville med spa, **SLK Clinic**.

## Stack

- React 18 + TypeScript + Vite (web client)
- Fastify + Prisma + SQLite (`server/`) — the local-first API and store
- `@tanstack/react-query` for data fetching/caching
- No CSS framework — the design's inline-style system is preserved via shared
  design tokens (`src/theme.ts`) and a small hover primitive (`src/lib/Hover.tsx`).

## Run

```bash
npm install                      # web deps (also run `npm install` inside server/)
npm run db:reset                 # create + seed the SQLite store from the demo data
npm run dev                      # starts BOTH the Vite web client and the API
```

`npm run dev` runs the web client (`:5173`) and the API (`:8787`) together via
`concurrently`; Vite proxies `/api` → the Fastify server, so the browser stays
same-origin and never sees the backend port. Other scripts: `npm run build`
(typecheck + production build), `npm run preview`, `npm run seed`.

> Fonts load from Google Fonts (Geist / Geist Mono). In network-restricted
> environments they fall back to the system sans-serif; everything else is
> self-contained.

### Data flow (Phase 0)

Views no longer import static data directly — they read it through
`useData()` (`src/data/DataProvider.tsx`), which hydrates a React Query
`bootstrap` request from the API. The static `src/data.ts` remains as the
TypeScript contract **and** the offline fallback: if the API is unreachable the
UI still renders identically (the DB is seeded from the same source). As later
phases replace seeded rows with values computed from real GSC/GA4/WordPress data,
the views don't change — the shapes are the contract.

See `server/prisma/schema.prisma`: core tables (Site, Opportunity,
Recommendation, ElementorSection, ReviewItem) are populated now; forward-looking
tables (Page, Snapshot, GscRow, Ga4Row, ChangeLog) are defined for Phases 1–5.

## Architecture

State-driven single page — the sidebar swaps views via in-memory state, exactly
like the prototype (no URL routing).

```
src/
  main.tsx            # entry
  App.tsx             # shell layout + view switch
  global.css          # reset, fonts, scrollbar, sync-pulse keyframe
  theme.ts            # design tokens + pill / card helpers
  data.ts             # data-shape contract + offline fallback (SLK Clinic account)
  data/DataProvider   # React Query hydration + useData() — the UI↔API seam
  lib/api.ts          # typed API client (/api/*)
  store.tsx           # central UI state, setState, nav, toast, sync cycling
  selectors.tsx       # derived opportunities + review-queue rows
  lib/Hover.tsx       # HButton / HDiv — replicate the prototype's style-hover
server/               # Fastify + Prisma/SQLite API (schema, seed, routes)
  components/         # Sidebar, Topbar, Toast, Pill, primitives
  views/             # Overview, Opportunities, PageDetail, ContentEditor,
                     # Elementor, Competitors, Technical, ReviewQueue,
                     # Impact, Settings
```

### The 10 views (workflow spine)

Detect → Prioritize → Diagnose → Generate → Approve → Measure.

| View | What it does |
| --- | --- |
| **Overview** | Metric cards, organic trend chart, top opportunities, losing pages, competitor gaps, SEO Operating Score, ready-for-review, recently published |
| **Opportunities** | Filterable/sortable table (type, impact, effort, source, status); Review action + Generate update |
| **Pages** | Split-pane page action plan — left: diagnosis (GSC queries, ranking, competitors, structure); right: proposed changes with an included/excluded checklist |
| **Content Updates** | Tabbed editor (title / meta / H1-H2 / body / FAQ / schema / links) with current-vs-suggested diff, char counts, approve / edit / reject |
| **Elementor JSON** | Import-ready sections with preview, expandable JSON, copy / download / send-to-draft / add-to-queue |
| **Competitors** | Competitor cards, keyword-gap table, pages-to-create, SERP feature opportunities |
| **Technical SEO** | Crawl issue table with severity + queue-fix |
| **Review Queue** | Human-in-the-loop approval center with risk, reviewer, destination, approve / reject |
| **Impact Tracking** | Annotated clicks chart + published-change verdict table |
| **Settings** | Data-source / publish-target connection cards |

### Interactivity

Sidebar nav, site switcher (multi-client), date range, opportunity filters,
Generate-update → Review Queue flow, editor approve/edit/reject with live char
counts, Elementor JSON expand/copy/download, review approvals, page-plan
checklist toggles. The sync indicator (dot + label, in the sidebar footer and top
bar) cycles **Synced → Syncing → Attention** on click — the prototype's "Demo
states" control.
