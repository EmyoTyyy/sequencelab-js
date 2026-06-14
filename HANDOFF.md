# SequenceLab (serverless edition) — handoff

A local, fully-offline **SQLite workbench that runs entirely in the browser**.
The real SQLite engine (sql.js / WASM) executes SQL in the page; databases
persist in IndexedDB. No backend, no build step, no framework, no CDN, no
telemetry. Hosted on GitHub Pages (`EmyoTyyy/sequencelab-js`).

There is a **sibling project, `../sequencelab`** (Flask + Python). It is the
same frontend with a server backend instead of sql.js. **Both editions share
the exact same `API` surface** — the only file that meaningfully differs is
[static/js/api.js](static/js/api.js). Keep that contract identical when you
touch shared UI, or the two editions drift apart.

---

## How it runs

- Open `index.html` through any static server, or **double-click it**:
  on `file://` the loader in [index.html](index.html) swaps the WASM build
  (`sql-wasm.js`) for the pure-JS build (`sql-asm.js`), since browsers can't
  `fetch` a `.wasm` from `file://`.
- No bundler. Scripts are plain `<script>` tags loaded in order:
  vendor sql.js → icons → api → editor → diagram → syntax → app.
- sql.js is **vendored** in [static/vendor/](static/vendor/) (MIT license
  included). Never load it — or fonts, or anything — from a CDN. That is a
  hard rule of the project.

## Architecture

Vanilla JS IIFE modules, each exposing one global:

| File | Global | Role |
|------|--------|------|
| [static/js/api.js](static/js/api.js) | `API` | **The whole "backend."** Wraps sql.js + IndexedDB and exposes the same methods the Flask edition serves over HTTP (`listDatabases`, `query`, `browse`, `schema`, `diagram`, `updateRow`, `triggers`, `pragma`, `search`, `importJson`, `backups`, …). |
| [static/js/app.js](static/js/app.js) | `SLApp` (bridge) | The shell: menus, dialogs, sidebar, query tabs, results, Browse view, settings, keyboard. ~2800 lines. |
| [static/js/editor.js](static/js/editor.js) | `SQLEditor` | Hand-built highlighter (textarea over `<pre>`), autocomplete, snippets, find/replace hooks. |
| [static/js/diagram.js](static/js/diagram.js) | `ERD` | ER diagram: cards, smart FK routing, layouts, notes, schema editing. |
| [static/js/icons.js](static/js/icons.js) | `ICON` | `ICON(name)` returns inline SVG (16×16, `stroke=currentColor`). Elements with `data-icon` auto-hydrate. Add new glyphs to the `P` map. |
| [static/js/syntax.js](static/js/syntax.js) | `Syntax` | SQL reference panel. |

### sql.js + persistence (api.js internals)

- IndexedDB database `"sequencelab"`, three stores:
  - `dbs`: `name → { bytes: Uint8Array, mtime }` — the database files.
  - `backups`: `"name::stamp" → { db, name, bytes, size, mtime }` (last 5/db).
  - `kv`: misc — `"history"`, `"snippets"`, `"attachments"`, `"prefs"`, and
    `"handle::<name>"` (a File System Access handle, see live links).
- `open` is an in-memory `Map(name → { db, attached:Set })` of live
  `SQL.Database` instances.
- **Every write persists**: `persist(name)` exports the db to bytes, writes
  IndexedDB, then `writeBack()` (live links). `API.query` calls it after any
  write statement; row/schema mutations go through the `alter()` helper
  (SAVEPOINT + optional backup + persist).
- `guard()` wraps every async method to await the engine and map thrown
  errors to `{ error, explanation }` (beginner-friendly, see `explainError`).
- ATTACH works because two `SQL.Database` instances **share one Emscripten
  MEMFS** — attach by pointing at the other instance's `.filename`.

### Live file links (Chrome/Edge only)

File System Access API. `linkDbFile()` keeps a writable handle in
`kv["handle::<name>"]`; `persist()` writes changes straight back into the real
file on disk. The IndexedDB copy stays the source of truth, so a denied
permission never loses data. Other browsers / `file://` fall back to
import-a-copy + Save/Download. The UI shows a **link vs copy icon** with a
tooltip everywhere a database is named (selector, status bar, Files panel).

### Conventions you must keep

- **No half-features, no dead code.** Wire everything you add.
- **Themed dropdowns:** never use a native `<select>` for in-app choices — the
  OS draws its open list (system blue) and ignores CSS. Use `mkSelect(...)` in
  app.js (a button that opens the app's own menu). Same reason the db picker
  is a button.
- **Menus:** `showCtxMenu` / `toggleCtxMenu(anchorEl, items, opts)`; items are
  `{ icon?, label, keys?, checked?, danger?, sub?, onClick }` or `{ sep:true }`.
- **Theming:** CSS variables under `html[data-theme="..."]` in
  [static/css/styles.css](static/css/styles.css); 6 themes in two families
  (dark: nocturne/amber/orchid/gray, light: light/beige — "light" is shown as
  "Paper"). Read colors from CSS vars, never hardcode.
- **AZERTY-safe keys:** match `e.key` (layout-aware), not `e.code`.
- **localStorage** holds UI state (`sl.theme`, `sl.db`, `sl.settings`,
  `sl.qtabs`, `sl.pins`, `sl.erd.<db>`, `sl.bfilters.<db>`, …); **IndexedDB**
  holds the data. Don't mix them.
- **Sync the README** in the same pass as any user-facing change.
- After editing JS, sanity-check with `node --check static/js/<file>.js`. The
  API layer can be integration-tested under Node with browser shims (the
  vendored `sql-wasm.js` runs in Node). Do **not** claim the UI was
  browser-verified — say "implemented," and ask the user to hard-refresh.
- The repo ignores `AI_PROFILE.md` — read it locally if present; it restates
  these working rules.

---

## Planned features (to be added)

### 1. PWA install + offline
Make the hosted app installable and fully offline-capable.
- Add `manifest.webmanifest` (name, icons from [static/img/](static/img/),
  `theme_color`, `display: standalone`, `start_url: "."`) and link it in
  [index.html](index.html).
- Add a **service worker** that cache-first serves the app shell: `index.html`,
  the CSS, all `static/js/*`, the vendored fonts, and **the WASM**
  (`static/vendor/sql-wasm.wasm` is the big one). Register it from
  [index.html](index.html); bump a cache-version constant on each release.
- Gotchas: service workers need HTTPS or localhost — GitHub Pages is HTTPS, so
  it works there but **not on `file://`** (leave the `sql-asm.js` fallback as
  is). Data already persists in IndexedDB, so offline data needs nothing new —
  this is purely about caching the static shell so it loads with no network.

### 2. Record detail panel
Click a row (in Browse or a result grid) → a side panel showing that row as a
card **plus its related rows pulled through foreign keys**. This is the
headline feature; the FK plumbing already exists.
- **Outgoing FKs** (this row → parent rows): for each FK column, look up the
  one referenced row in the parent table.
- **Incoming FKs** (child rows → this row): scan every table's
  `foreign_keys` (via `API.diagram` / `API.schema`) for ones that reference
  the current table, then query those children `WHERE <fkcol> = <this pk>`.
- Related rows are clickable → open *their* detail / jump to Browse. Reuse
  `browse.fks`, `quoteIfNeeded`, and the existing `#jsonPanel` aside (or a new
  one) for layout. Keep it read-only first; editing can come later.

### 3. Inline-editable results
When a result tab comes from a **simple single-table SELECT** (one source
table, no joins/aggregates/expressions), let its cells be edited in place like
the Browse grid.
- Detect the simple case (parse the statement, or just re-run it with `rowid`
  added and bail out of edit-mode if that fails / columns don't map 1:1 to a
  real table).
- Reuse Browse's editing path: `beginEdit` → `API.updateRow(db, table,
  {__rowid__}, {col: val})`. The `cellTd` / editable-cell logic in app.js is
  the model to copy.
- Disable cleanly (no edit affordance) whenever the result isn't a clean
  single-table mapping — better to not offer it than to guess wrong.

Suggested order: **PWA first** (small, high value now that it's hosted),
then **record detail panel** (biggest capability gain), then
**inline-editable results**.

Apply 2 and 3 to the Flask edition `../sequencelab` too where they're not
serverless-specific, keeping the shared `API` contract aligned.
