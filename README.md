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

- React 18 + TypeScript
- Vite
- No CSS framework — the design's inline-style system is preserved via shared
  design tokens (`src/theme.ts`) and a small hover primitive (`src/lib/Hover.tsx`).

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # typecheck + production build
npm run preview  # serve the production build
```

> Fonts load from Google Fonts (Geist / Geist Mono). In network-restricted
> environments they fall back to the system sans-serif; everything else is
> self-contained.

## Architecture

State-driven single page — the sidebar swaps views via in-memory state, exactly
like the prototype (no URL routing).

```
src/
  main.tsx            # entry
  App.tsx             # shell layout + view switch
  global.css          # reset, fonts, scrollbar, sync-pulse keyframe
  theme.ts            # design tokens + pill / card helpers
  data.ts             # all static dummy data (SLK Clinic account)
  store.tsx           # central state, setState, nav, toast, sync cycling
  selectors.tsx       # derived opportunities + review-queue rows
  lib/Hover.tsx       # HButton / HDiv — replicate the prototype's style-hover
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
