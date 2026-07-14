# Groundwork Connector

Exposes Elementor's protected `_elementor_data` (and related meta) to the
WordPress REST API, read-only, for authenticated editors only. This is the
standard connector to install on every site Groundwork manages — see
`../compass_artifact_..._text_markdown.md` §4 for why the default REST API
can't see this data without it.

Ships two ways — same code, two install paths depending on what access you
have to the site:

## Option A: Upload the zip via wp-admin (no FTP/hosting access needed)

Use this if you only have a WordPress admin login.

1. Log into wp-admin as an **Administrator** (installing any plugin — even a
   custom one — requires that role; a regular Editor account can't do this
   step, but can still be the account Groundwork connects with afterward).
2. Go to **Plugins → Add New Plugin → Upload Plugin**.
3. Choose `groundwork-connector.zip` from this folder → **Install Now**.
4. Click **Activate**.
5. Confirm it's live: visit
   `https://yoursite.com/wp-json/wp/v2/pages?context=edit` while logged in,
   and check for a `groundwork_elementor` field in the response.

This installs like any normal plugin — visible and toggleable from the
Plugins screen, no server file access required.

## Option B: Drop the file in via FTP/hosting file manager (mu-plugin)

Use this if you have server-level file access. "Must-use" plugins load
automatically on every request — there's no activation step, and it can't be
accidentally deactivated from the Plugins screen.

1. Upload `groundwork-connector.php` (the loose PHP file, not the zip) to
   `wp-content/mu-plugins/` on the site — create that folder if it doesn't
   exist yet.
2. Nothing to activate.
3. Confirm it's live the same way as Option A, step 5.

Both options register the exact same REST field — pick whichever matches the
access you actually have.

## Create the Application Password Groundwork will authenticate with

1. WordPress 5.6+ required (Application Passwords are built into core).
2. In wp-admin, create (or use) a dedicated user with the **Editor** role —
   least privilege that still has `edit_posts`. Avoid using an Administrator
   account.
3. Go to that user's profile → **Application Passwords** → enter a name like
   `groundwork` → **Add New Application Password**.
4. Copy the generated 24-character password immediately — WordPress won't show
   it again. Enter it in Groundwork's Settings → Connect WordPress along with
   the site's base URL and that user's username.

## SEO meta write (Rank Math / Yoast) — v1.1.0+

Groundwork publishes title and meta description via a dedicated connector endpoint:

`POST /wp-json/groundwork/v1/pages/{id}/seo-meta`

This writes directly with `update_post_meta()` to:

- `rank_math_title`, `rank_math_description`
- `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`
- SEOPress and AIOSEO equivalents

**Why this is required:** Yoast does not expose write access on its REST API ([Yoast developer docs](https://developer.yoast.com/customization/apis/rest-api/)). Standard `POST /wp/v2/pages` with a `meta` object returns success but **silently drops** Yoast keys unless they are registered with `show_in_rest`. The connector endpoint avoids that entirely.

After installing or updating the connector, re-sync WordPress from Groundwork Settings.

## Schema graph write (Yoast FAQPage, etc.) — v1.3.0+

`POST /wp-json/groundwork/v1/pages|posts/{id}/schema-graph`

Body: `{ "graph_json": "<JSON-LD object>" }`

Merges supplemental pieces (e.g. FAQPage) into Yoast output via `wpseo_schema_graph`.
Status endpoint returns `schema_write: true` when this is available.

## Elementor content write (headings, body, links, FAQ sections) — v1.2.0+

Groundwork can patch **existing** Elementor widgets in place (heading text, intro
copy in text-editor widgets, internal links in body HTML) and append new FAQ
sections to `_elementor_data` on Elementor pages. Blog posts that use a Single
Post template still receive FAQ HTML in `post_content` from Groundwork.

`POST /wp-json/groundwork/v1/pages/{id}/elementor-content`

Body: `{ "elementor_data": "<full updated _elementor_data JSON>" }`

Status endpoint returns `elementor_write: true` when this is available.

## What this plugin does *not* do

- No new public endpoints — fields only appear on existing `/wp/v2/pages` and
  `/wp/v2/posts` routes for authenticated editors.
- Elementor builder data is readable on sync; v1.2+ supports in-place widget
  patches and FAQ section append via `elementor-content`. v1.3+ supports Yoast
  schema graph writes via `schema-graph`.
- No data leaves the site on its own — Groundwork pulls on sync; this plugin
  only makes the data visible (and SEO meta writable) to authenticated requests.
