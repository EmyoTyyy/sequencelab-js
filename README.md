# 🧪 SequenceLab — serverless edition

A serious **local, fully-offline SQLite workbench** that runs **entirely in the
browser**. No Python, no Flask, no server process: the real SQLite engine
(compiled to WebAssembly via [sql.js](https://sql.js.org)) executes your SQL
inside the page, and your databases persist in the browser's IndexedDB.

No cloud. No account. No external API. No CDN (sql.js is vendored locally).
No telemetry. Nothing leaves your machine.

---

## Stack

| Layer    | Choice                                    | Why |
|----------|-------------------------------------------|-----|
| Engine   | **sql.js 1.14** (SQLite 3.49 → WASM)       | The real SQLite, zero backend |
| Storage  | **IndexedDB**                              | Databases persist across sessions |
| Frontend | **Vanilla HTML/CSS/JS**                    | No build step, no node_modules, no CDN |
| Editor   | Hand-built syntax highlighter              | Stays 100% offline |

The interface, themes (Nocturne default; dark and light families), fonts
(vendored in `static/fonts/`) and every feature are shared with the
Flask-based edition in `../sequencelab`.

---

## Running

Serve the folder with any static file server and open it:

```bash
# any of these works — it only serves files, nothing runs server-side:
python3 -m http.server 8080
npx serve .
```

Or just **double-click `index.html`** — on `file://` the app automatically
falls back to the pure-JavaScript build of SQLite (`sql-asm.js`), no server
needed at all.

### Install & offline (PWA)

Served over **HTTPS** (e.g. GitHub Pages), SequenceLab is an installable
[Progressive Web App](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps):

- Your browser offers **Install** — it then launches in its own standalone
  window with its own icon, no address bar.
- A **service worker** ([`sw.js`](sw.js)) caches the whole static shell
  (HTML, CSS, every script, the fonts, and the SQLite WASM), so after the
  first visit the app **loads instantly and runs with no network at all**.
  Your databases were already offline — they live in IndexedDB — so this just
  removes the last network dependency: the app's own files.
- Updates land on reload; the cache version is bumped per release so stale
  shells are cleared automatically.

Service workers require a secure context, so this is inactive on `file://`
(which keeps the `sql-asm.js` fallback) and on plain `http://` except
`localhost`.

---

## Where data lives

Databases live in the **browser's IndexedDB** for this page's origin — they
survive reloads and restarts, but they are *copies inside the browser*, not
files on disk:

- **File → Open database file → Import copy** copies a real SQLite file into
  the browser; **File → Save database** downloads the edited bytes back out.
- **File → Open database file → Open with live link** (Chrome/Edge) keeps a
  writable handle to the real file: **every change is saved straight back
  into it** — no downloads. The browser asks for write permission once per
  session; the IndexedDB copy doubles as a safety net if you ever deny it.
- CSV / JSON / SQL-dump exports download as regular files.
- The **Files** rail sub-button lists everything stored, with sizes.
- **File → Close database** (or right-click in Files) removes a database from
  the browser — linked files on disk keep everything already saved to them.
- Auto-backups (last 5 per database) also live in IndexedDB.

> Clearing the browser's site data deletes your databases — download anything
> you care about. The example database reseeds itself automatically.

---

## Differences vs. the Flask edition

- **Cancel query** is unavailable: SQL runs synchronously in the page. A very
  heavy query will freeze the tab until it finishes.
- **Attach database** picks another *stored* database (no filesystem paths).
- Whole databases are held in memory — comfortable up to tens/hundreds of MB,
  not built for multi-GB files.
- Everything else — editor, results, Browse, ER diagram, triggers, PRAGMA
  settings, global search, imports/exports, themes, shortcuts — is identical.

---

## Features

**Engine layer** (same API surface, implemented over sql.js)
- create databases · open existing `.db` / `.sq3` / `.s3db` files · reset the example DB
- list tables & views (with row counts) · read full schema (columns, types, PK, FK, DDL)
- run arbitrary SQL (multi-statement aware) and return result sets
- browse tables with pagination & sorting
- inline row editing · insert · delete (parameterized, identifier-validated)
- **typed-write validation**: a value that doesn't fit a column's affinity (text in an INTEGER/REAL column) is rejected instead of silently coerced
- **coded errors**: every engine error carries a category code — `E1xx` SQL/syntax, `E2xx` constraints (`E201 FK`, `E202 UNIQUE`, `E203 NOTNULL`…), `E3xx` validation, `E4xx` naming, `E5xx` import/IO — surfaced with a plain-English explanation in the failed result tab and the **Console** (see below)
- import **CSV / JSON / Excel (.xlsx)** — append, or **replace-on-matching-PK** (upsert); optional table creation with inferred types; **duplicate primary keys are verified and rejected** with a clear message · import a whole `.sql` script
- export **CSV / JSON / Excel (.xlsx)** (whole table or a query result) · **export the database as a SQL dump**
- **attach other stored databases** for cross-db queries (`alias.table`)
- **index management** (list/create/drop) · **change a column's type / add a foreign key** via safe table rebuild (rows, keys & indexes preserved)
- **trigger management** (list/create/drop) · **PRAGMA settings** (foreign-key enforcement kept as a per-db preference, journal mode, auto-vacuum, user_version)
- **global search** across every column of every table
- `.xlsx` read/write is **hand-rolled, dependency-free** (native zip via `CompressionStream`/`DecompressionStream`) — no vendored spreadsheet library
- **backups API**: list / restore / delete the auto-backups
- query history + saved snippets, persisted in SQLite (consecutive duplicates collapse)

**Frontend** — desktop-app layout: thin **menu bar** (File / Edit / View / Help),
far-left **icon rail** for the main sections, 240px sidebar, main workspace, and
a bottom **status bar** (db path · SQLite version · last run) that **doubles as the Console toggle** (see below).
- **multiple query tabs** (persisted per browser) with a ＋ button; **drag tabs to reorder** them (result tabs too)
- SQL editor with **line numbers**, **syntax highlighting**, comment toggle (`Ctrl+/`), auto-paired quotes/brackets, duplicate-line (`Alt+Shift+↓`)
- **Run split-button**: Run all · Run selected · Run current statement — the Run button becomes **Stop** while a query runs
- `:name` / `?` **query parameters** prompt for values before running
- **context-aware autocomplete**: tables after `FROM`/`JOIN`, a table's own columns after `table.` (`Ctrl/Cmd+Space`)
- **command palette** (`Ctrl+K`): jump to any table, snippet or action
- **find & replace** in the editor (`Ctrl+F`): match counter, prev/next, replace one or all
- **Explain query plan** (Run menu): readable plan tree with full-table-scans flagged and an index hint
- **search the whole database** (`Ctrl+Shift+G`): every column of every table; click a hit to open it in Browse
- snippets support **`${name}` placeholders** (prompted on insert) and **`${cursor}`**; typing a snippet's name in the editor suggests inserting its whole SQL
- **auto-capitalization** of SQL keywords (toggle in Settings; persisted per browser)
- sidebar with **PINNED** + **ENTITIES** collapsible sections (pin via hover icon or right-click), live filter, db selector + refresh
- **file explorer** panel (rail sub-button): everything in `data/` with size & date — click a `.db` to switch to it; externally registered databases are listed too
- right-click an entity: Browse table · View schema · Copy table name · Pin · **Export ▸ CSV / JSON / Excel**
- **Browse view**: spreadsheet grid, double-click inline editing, a raw **WHERE filter bar**, and a right-click cell menu (Set NULL · Copy/Paste · Add/Clone/Delete row · **"Go to" FK navigation** that jumps to the referenced row)
- **spreadsheet-style selection** (Browse + result grids): click a cell to select it (blue outline), **drag** or **shift-click** for a rectangle, **click the # cell** for a whole row · **Ctrl/Cmd+C** copies as TSV/CSV (separator set in Settings or via the range right-click) · **Delete** removes the selected rows, **Backspace** sets the selected cells to NULL · right-click a range to **Copy as** (Tab/Comma/Semicolon/Pipe) or **Create table from selection**
- **typed cell editors**: editing picks the right input per column — number, **date / datetime / time picker**, boolean **checkbox**, or text
- right-click a **column header**: sort asc/desc · per-column filter · **Column stats** (rows, non-null, nulls, distinct, min/max, sum/avg, top values) · copy column name · open the referenced table when the column is a FK
- **saved filters** (Filters rail sub-button): a dialog to name the filter + edit the WHERE (prefilled with the current one; Save stays disabled until both are filled), re-applied in one click (stored per database, in the browser)
- **result grids**: client-side sort & per-column filter, **export as CSV / JSON / Excel / Markdown / INSERT statements**, **charts** (bar · line · area · scatter · pie · histogram) with **PNG export / copy**, double-click **cell inspector** (full text, blob hex/image preview), **Save as table** (`CREATE TABLE … AS`); results from a **simple single-table SELECT are editable in place** — double-click a cell, exactly like Browse
- **record panel** (right side, toggle in the menu bar): with it open, selecting a row shows it as a card next to its **foreign-key relations** — the parent rows it *references* and the child rows that *reference it* — each clickable to walk from record to record; a **JSON** toggle shows the raw row
- **preview-before-write** (opt-in in Settings): when on, a **Preview tab auto-opens as you type a write query** and live-shows the affected table with its rows flickering — **green = added · red = deleted · white = edited** (a transactional dry-run that's rolled back, so nothing is touched). The **Run** button then applies it for real
- in-app confirmation dialogs (no browser `confirm()` popups)
- result tabs (one per statement, re-runs refresh in place); when idle the results area shows a keyboard-shortcuts help panel
- query history panel & saved snippets panel
- **Syntax reference panel** — clickable boxes for every statement plus a grouped SQLite function reference; examples load straight into the editor
- beginner-friendly **plain-English error explanations** that **name the exact table or column** behind the failure (shown on the failed result tab and, in full, in the Console)
- **6 themes** + a **System** option that follows your OS (dark → Nocturne, light → Paper) and flips live when the OS does; grouped into dark (Nocturne · Graphite & Amber · Orchid · Gray) and light (Paper · Beige) families in both Settings and the View menu. New installs default to **System**
- **bilingual UI (English / Français)** — pick the language in Settings; the whole interface switches **live, no reload** (menus, panels, dialogs, toasts, settings, the syntax reference and error explanations). English is the default; the choice is remembered per browser. SQL keywords, example queries and your data are never translated. Built on a tiny dictionary-driven layer (`static/js/i18n.js` + `i18n.dict.js`) that translates the rendered chrome while explicitly excluding data zones (result/browse grids, the editor, the schema tree, record values)
- rich **Settings** (slide toggles): **language**, tab width, word wrap, autocomplete behavior, editor font size, auto-format on run, **confirm destructive statements**, **read-only mode**, **preview writes before applying**, Browse page size, max rows per result, history recording/limit, NULL display, cell truncation, status bar, CSV delimiter/header defaults, **range-copy separator**, and **auto-backup before destructive SQL** (the last 5 copies per db are kept in IndexedDB)
- **installable PWA**: over HTTPS a service worker caches the whole static shell (scripts, fonts, SQLite WASM) so the app installs to its own window and **loads & runs fully offline**; the browser chrome color tracks the active theme
- **versioned releases**: each feature update bumps the app version and shows a one-time **"What's new"** popup of that version's changes; the **full history** lives in Settings → About → **Update log** (and the Help → About dialog)
- **workspace export / import** (File menu): bundle your browser-side workspace — settings, query tabs, pins, saved filters, diagram layouts and notebooks — into one JSON file to back up or move between browsers/machines (databases themselves are exported separately, as `.db` or a SQL dump)

**Console** (click the bottom **status bar** to open the bottom drawer)
- a **Logs** tab — a timestamped, running feed of errors, query outcomes ("query ran successfully"), and app events
- **errors expand to a full breakdown**: the raw SQLite message, a plain-English explanation that **names the exact table or column** at fault, and — for a foreign-key violation — the **precise relationship blocking it** (e.g. deleting a referenced row spells out `order_items.product_id → products.id`)
- a **Commands** tab — a small REPL: `help`, `clear`, `close`, `version`, `db` / `use <name>` (switch database), `run <sql>` (run a statement), `pragma <name> [value]` (read or set a PRAGMA), and `reset` (erase everything, with a y/n confirm)

**Diagram view** (rail icon)
- ER diagram of the database: table cards with column names & types
- **primary keys highlighted**, foreign keys drawn as lines between the exact linked columns
- **smart link routing**: links pick which side of each card to attach to, can start and end on the **same side** (looping around stacked cards), and reroute when the direct curve would pass through another table
- **draggable** table cards (others dim while dragging) · pan · zoom · **drag a column onto another column to create a foreign key**
- **auto-link**: infer foreign keys from related column names — `user_id` → `users.id` (basic), plus an opt-in **advanced** mode that matches a column to a table's primary key by **type and overlapping values** (e.g. `borders.country1` / `country2` → `country.id`). The toolbar's auto-link button **proposes** the links as dashed connectors you can drop one by one, then **Confirm auto-links** turns the ones you kept into real FKs; **auto-link diagnostics** (Settings) explain why each candidate did or didn't link
- auto-layout groups **connected tables next to each other**, **sizes the spacing around each table's real dimensions**, and orders them to **reduce crossings so links stay readable**, with fit-to-screen; layout persists per database in the browser
- **saved layouts** (Layouts rail sub-button): keep several named arrangements and switch between them
- **legend & notes** (Notes rail sub-button): draggable **sticky notes** on the canvas (new ones cascade like OS windows), color **tags** on table cards (picked in the table editor), a legend naming what each color means, and bulk note deletion (all, or per color)
- **export the diagram as PNG or SVG** — sticky notes and tag stripes are drawn in too, with the table cards' **rounded corners** preserved
- left panel **schema editor**: add / rename / drop columns, **change column types**, **manage indexes**, **manage triggers** (view SQL / create / drop), rename / drop / create tables

**Notebook** (rail icon)
- a **document of cells** — runnable **SQL cells** and **markdown text cells** — for building queries alongside notes, like a lightweight SQL notebook
- each SQL cell runs against the active database with **results shown inline** (capped table + row count / timing), full syntax highlighting and autocomplete; **Run all** runs every SQL cell top-to-bottom
- text cells render **markdown** (headings, bold/italic, lists, code, links, quotes) — click to edit, click away to render
- **add / delete / reorder** cells; keep **multiple named notebooks** and switch between them; **export / import** a notebook as a `.slnb` file (JSON inside)
- notebooks persist per-browser (and travel with a workspace export)

**Accessibility**
- toasts announce via `aria-live`; icon buttons carry `aria-label`s
- focus is trapped in dialogs and restored on close
- ↑/↓ move the selected row in any grid; WCAG-checked contrast; compact/comfortable **density** setting

---

## Safety notes

- The "Run SQL" feature executes whatever you type — that's the point of a
  workbench. It only ever touches the copies stored in your browser.
- Row edit/insert/delete use **parameterized queries** and validate table and
  column names against the live schema, so the visual editor can't be tricked
  into running arbitrary SQL.
- **Read-only mode** blocks every write at the source; **preview-before-write**
  (opt-in) live-shows a write query's row changes (a rolled-back dry-run) before you Run it.
- Importing a file validates the SQLite header before storing it; imports also
  **verify primary-key uniqueness** before inserting.
- sql.js is vendored in `static/vendor/` (MIT, license included) — nothing is fetched from the network at runtime.
