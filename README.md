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
- create databases · open existing `.db` files · reset the example DB
- list tables & views (with row counts) · read full schema (columns, types, PK, FK, DDL)
- run arbitrary SQL (multi-statement aware) and return result sets
- browse tables with pagination & sorting
- inline row editing · insert · delete (parameterized, identifier-validated)
- import CSV (append / replace, optional table creation) · import a whole `.sql` script
- export CSV (whole table or a query) · **export the database as a SQL dump**
- **attach other stored databases** for cross-db queries (`alias.table`)
- **index management** (list/create/drop) · **change a column's type / add a foreign key** via safe table rebuild (rows, keys & indexes preserved)
- **trigger management** (list/create/drop) · **PRAGMA settings** (foreign-key enforcement kept as a per-db preference, journal mode, auto-vacuum, user_version)
- **global search** across every column of every table · **JSON import** (array of objects; optional table creation with inferred types)
- **backups API**: list / restore / delete the auto-backups
- query history + saved snippets, persisted in SQLite (consecutive duplicates collapse)

**Frontend** — desktop-app layout: thin **menu bar** (File / Edit / View / Help),
far-left **icon rail** for the main sections, 240px sidebar, main workspace, and
a bottom **status bar** (db path · SQLite version · last run).
- **multiple query tabs** (persisted per browser) with a ＋ button
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
- right-click an entity: Browse table · View schema · Copy table name · Pin · Export CSV
- **Browse view**: spreadsheet grid, double-click inline editing, a raw **WHERE filter bar**, and a right-click cell menu (Set NULL · Copy/Paste · Add/Clone/Delete row · **"Go to" FK navigation** that jumps to the referenced row)
- right-click a **column header**: sort asc/desc · prefill the WHERE bar with the column · copy column name · open the whole referenced table when the column is a FK
- **saved filters** (Filters rail sub-button): save the current table + WHERE under a name and re-apply it in one click (stored per database, in the browser)
- **result grids**: client-side sort & filter, **export as CSV / JSON / Markdown / INSERT statements**, quick **bar/line chart** for numeric columns, double-click **cell inspector** (full text, blob hex/image preview)
- result tabs (one per statement, re-runs refresh in place); when idle the results area shows a keyboard-shortcuts help panel
- query history panel & saved snippets panel
- **Syntax reference panel** — clickable boxes for every statement plus a grouped SQLite function reference; examples load straight into the editor
- beginner-friendly **plain-English error explanations**
- **6 themes**, grouped into dark (Nocturne · Graphite & Amber · Orchid · Gray) and light (Paper · Beige) families in both Settings and the View menu
- rich **Settings** (slide toggles): tab width, word wrap, autocomplete behavior, editor font size, auto-format on run, **confirm destructive statements**, **read-only mode**, Browse page size, max rows per result, history recording/limit, NULL display, cell truncation, status bar, CSV delimiter/header defaults, and **auto-backup before destructive SQL** (the last 5 copies per db are kept in IndexedDB)

**Diagram view** (rail icon)
- ER diagram of the database: table cards with column names & types
- **primary keys highlighted**, foreign keys drawn as lines between the exact linked columns
- **smart link routing**: links pick which side of each card to attach to, can start and end on the **same side** (looping around stacked cards), and reroute when the direct curve would pass through another table
- **draggable** table cards (others dim while dragging) · pan · zoom · **drag a column onto another column to create a foreign key**
- auto-layout groups **connected tables next to each other** (FK-adjacency ordering, serpentine grid) & fit-to-screen; layout persists per database in the browser
- **saved layouts** (Layouts rail sub-button): keep several named arrangements and switch between them
- **legend & notes** (Notes rail sub-button): draggable **sticky notes** on the canvas (new ones cascade like OS windows), color **tags** on table cards (picked in the table editor), a legend naming what each color means, and bulk note deletion (all, or per color)
- **export the diagram as PNG or SVG** — sticky notes and tag stripes are drawn into the export too
- left panel **schema editor**: add / rename / drop columns, **change column types**, **manage indexes**, **manage triggers** (view SQL / create / drop), rename / drop / create tables

**Accessibility**
- toasts announce via `aria-live`; icon buttons carry `aria-label`s
- focus is trapped in dialogs and restored on close
- ↑/↓ move the selected row in any grid; WCAG-checked contrast; compact/comfortable **density** setting

---

## Keyboard shortcuts

| Shortcut                  | Action                         |
|---------------------------|--------------------------------|
| `Ctrl/Cmd + Enter`        | Run                            |
| `Ctrl/Cmd + Shift + Enter`| Run current statement          |
| `Ctrl/Cmd + Space`        | Trigger autocomplete           |
| `Ctrl/Cmd + S`            | Save current SQL as a snippet  |
| `Ctrl/Cmd + /`            | Toggle comment                 |
| `Alt + Shift + ↓`         | Duplicate line                 |
| `Ctrl/Cmd + K`            | Command palette                |
| `Ctrl/Cmd + F`            | Find & replace in editor       |
| `Ctrl/Cmd + Shift + G`    | Search the whole database      |
| `Alt + W`                 | Close result tab               |
| `Alt + S`                 | Toggle side panel              |
| `Tab` (in editor)         | Indent / accept autocomplete   |
| Double-click a cell | Edit it inline (in browse view)|

---

## Safety notes

- The "Run SQL" feature executes whatever you type — that's the point of a
  workbench. It only ever touches the copies stored in your browser.
- Row edit/insert/delete use **parameterized queries** and validate table and
  column names against the live schema, so the visual editor can't be tricked
  into running arbitrary SQL.
- Importing a file validates the SQLite header before storing it.
- sql.js is vendored in `static/vendor/` (MIT, license included) — nothing is fetched from the network at runtime.
