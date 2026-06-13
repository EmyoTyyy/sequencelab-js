/* =================================================================== *
 *  SequenceLab app shell — wires the editor, sidebar, results & modals.
 * =================================================================== */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };
  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const state = {
    db: localStorage.getItem("sl.db") || "example.db",
    databases: [],
    tables: [],
    tabs: [],
    tabSeq: 1,
    activeTab: null,
    schema: {},
    autoCaps: localStorage.getItem("sl.autoCaps") !== "false",
    theme: localStorage.getItem("sl.theme") || "nocturne",
    view: "editor",
    sidePanel: "schema",
    browsePanel: "tables",    // browse-side: "tables" | "filters"
    diagramPanel: "tables",   // diagram-side: "tables" | "layouts" | "notes"
  };

  // ----------------------------------------------------------------- settings
  const SETTINGS_DEFAULTS = {
    tabWidth: 2, wordWrap: false, acEnabled: true, acMinChars: 1, autoFormat: false,
    pageSize: 100, maxRows: 500, confirmDestructive: true, readOnly: false,
    recordHistory: true, maxHistory: 200,
    nullDisplay: "NULL", truncate: 0, showStatusbar: true, density: "comfortable",
    csvDelimiter: ",", csvHeader: true, autoBackup: false,
  };
  let S = { ...SETTINGS_DEFAULTS };
  try { S = { ...SETTINGS_DEFAULTS, ...JSON.parse(localStorage.getItem("sl.settings") || "{}") }; } catch (_) {}
  function saveSettings() { localStorage.setItem("sl.settings", JSON.stringify(S)); }
  function applySettings() {
    if (editor) {
      editor.setTabWidth(S.tabWidth);
      editor.setWrap(S.wordWrap);
      editor.setAutocomplete(S.acEnabled, S.acMinChars);
    }
    $(".statusbar").hidden = !S.showStatusbar;
    browse.limit = S.pageSize;
    document.body.dataset.density = S.density;
  }
  function csvUrlOpts() {
    return { delimiter: S.csvDelimiter === "\t" ? "tab" : S.csvDelimiter, header: S.csvHeader ? 1 : 0 };
  }

  // read-only mode: refuse every mutating API call at the source, so the
  // Browse grid, dialogs and the diagram editor are all covered at once
  ["updateRow", "insertRow", "deleteRow", "importCsv", "addColumn",
   "renameColumn", "dropColumn", "renameTable", "dropTable",
   "createTrigger", "dropTrigger", "setPragma", "importJson"].forEach((k) => {
    const orig = API[k];
    API[k] = (...a) => S.readOnly
      ? Promise.resolve({ error: "Read-only mode is on (see Settings)." })
      : orig(...a);
  });

  const THEMES = [
    { id: "nocturne", name: "Nocturne", sub: "blue", dot: "#7b6cf6" },
    { id: "amber", name: "Graphite & Amber", sub: "warm", dot: "#e0a458" },
    { id: "orchid", name: "Orchid", sub: "pink/purple", dot: "#c389c9" },
    { id: "gray", name: "Gray", sub: "discord-style", dot: "#5865f2" },
    { id: "light", name: "Paper", sub: "cool gray", dot: "#5b4ee0" },
    { id: "beige", name: "Beige", sub: "warm light", dot: "#a06b1f" },
  ];
  const LIGHT_THEMES = ["light", "beige"];
  function applyTheme(id) {
    state.theme = id;
    document.documentElement.setAttribute("data-theme", id);
    localStorage.setItem("sl.theme", id);
    // navy-stroke logo on light themes, light-stroke variant on dark ones
    const logo = $(".menu-logo");
    if (logo) logo.src = LIGHT_THEMES.includes(id) ? "static/img/logo-128.png" : "static/img/logo-dark-128.png";
    // keep the PWA / browser-chrome color in step with the active theme
    const meta = $("#themeColor");
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (window.ERD && ERD.refreshTheme) ERD.refreshTheme();
  }

  // favicon follows the *browser* theme, independent of the app theme
  const darkTab = window.matchMedia("(prefers-color-scheme: dark)");
  function applyFavicon() {
    $("#favicon").href = darkTab.matches
      ? "static/img/logo-dark-128.png"
      : "static/img/logo-128.png";
  }
  darkTab.addEventListener("change", applyFavicon);
  applyFavicon();

  let editor;

  // ----------------------------------------------------------------- toast
  let toastTimer;
  function toast(msg, kind = "") {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast " + kind;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  // ----------------------------------------------------------------- modal
  let modalReturnFocus = null;
  function openModal(title, bodyNode, footNodes) {
    modalReturnFocus = document.activeElement;
    $("#modalTitle").textContent = title;
    const body = $("#modalBody");
    body.innerHTML = "";
    body.appendChild(bodyNode);
    const foot = $("#modalFoot");
    foot.innerHTML = "";
    (footNodes || []).forEach((n) => foot.appendChild(n));
    $("#modalBackdrop").hidden = false;
    const first = $("#modal").querySelector(
      "input, select, textarea, button:not(#modalClose)");
    if (first) setTimeout(() => first.focus(), 20);
  }
  function closeModal() {
    $("#modalBackdrop").hidden = true;
    if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus();
    modalReturnFocus = null;
  }
  // keep Tab cycling inside the open modal
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || $("#modalBackdrop").hidden) return;
    const focusables = $$("#modal input, #modal select, #modal textarea, #modal button")
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });
  $("#modalClose").onclick = closeModal;
  $("#modalBackdrop").addEventListener("mousedown", (e) => {
    if (e.target === $("#modalBackdrop")) closeModal();
  });
  function mkBtn(label, cls, onClick) {
    const b = el("button", "btn " + (cls || ""), label);
    b.onclick = onClick;
    return b;
  }

  // themed replacement for <select>: a button that opens the app's own menu,
  // because the native dropdown list highlight is OS-drawn (system blue).
  // options: [[value, label?], ...] — label falls back to String(value).
  function mkSelect(options, value, onChange, cls) {
    const btn = el("button", "sel-btn " + (cls || ""));
    btn.type = "button";
    let cur = value;
    const label = el("span", "sel-label");
    btn.appendChild(label);
    btn.insertAdjacentHTML("beforeend",
      `<span class="sel-caret">${ICON("chevron-down")}</span>`);
    const labelOf = ([v, l]) => String(l !== undefined ? l : v);
    const refresh = () => {
      const o = options.find(([v]) => v === cur);
      label.textContent = o ? labelOf(o) : String(cur);
    };
    refresh();
    btn.onclick = (e) => {
      e.stopPropagation();
      toggleCtxMenu(btn, options.map((o) => ({
        label: labelOf(o),
        checked: o[0] === cur,
        onClick: () => { cur = o[0]; refresh(); if (onChange) onChange(cur); },
      })), { minWidth: btn.getBoundingClientRect().width });
    };
    btn.getValue = () => cur;
    btn.setValue = (v) => { cur = v; refresh(); };
    return btn;
  }

  // ----------------------------------------------------------------- context menu
  let subPinned = false;
  function buildMenuRow(it, intoSub, hasIco) {
    const row = el("div", "ctx-item" + (it.danger ? " danger" : "") + (it.disabled ? " disabled" : ""));
    row.innerHTML =
      (it.icon ? ICON(it.icon) : hasIco ? `<span class="ctx-ico"></span>` : "") +
      `<span>${esc(it.label)}</span>` +
      (it.sub ? `<span class="ctx-keys">›</span>` :
       it.keys ? `<span class="ctx-keys">${esc(it.keys)}</span>` :
       it.checked ? `<span class="ctx-check">${ICON("check")}</span>` : "");
    if (it.sub && !intoSub) {
      // hover opens the flyout; clicking pins it open
      row.onmouseenter = () => { if (!subPinned) showSubMenu(row, it.sub()); };
      row.onclick = (e) => { e.stopPropagation(); subPinned = true; showSubMenu(row, it.sub()); };
    } else {
      if (!intoSub) row.onmouseenter = () => { if (!subPinned) hideSubMenu(); };
      if (!it.disabled) row.onclick = () => { hideCtxMenu(); it.onClick(); };
    }
    return row;
  }
  function fillMenu(menu, items, intoSub) {
    menu.innerHTML = "";
    // no icon gutter at all when the list is icon-free (e.g. Run options)
    const hasIco = items.some((it) => it.icon);
    items.forEach((it) => {
      if (it.sep) menu.appendChild(el("div", "ctx-sep"));
      else menu.appendChild(buildMenuRow(it, intoSub, hasIco));
    });
  }
  let ctxAnchor = null; // the element that opened the menu (for click-to-toggle)
  function showCtxMenu(x, y, items, opts) {
    hideSubMenu();
    subPinned = false;
    ctxAnchor = (opts && opts.anchor) || null;
    const menu = $("#ctxMenu");
    // dropdown-style menus open at least as wide as their button
    menu.style.minWidth = opts && opts.minWidth ? opts.minWidth + "px" : "";
    fillMenu(menu, items, false);
    menu.hidden = false;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - mw - 8) + "px";
    menu.style.top = Math.min(y, window.innerHeight - mh - 8) + "px";
  }
  // anchor buttons toggle: a second click closes instead of reopening
  function toggleCtxMenu(anchor, items, opts) {
    if (!$("#ctxMenu").hidden && ctxAnchor === anchor) { hideCtxMenu(); return; }
    const r = anchor.getBoundingClientRect();
    showCtxMenu(r.left, r.bottom + 4, items, { ...opts, anchor });
  }
  function showSubMenu(parentRow, items) {
    const sub = $("#ctxSub");
    fillMenu(sub, items, true);
    sub.hidden = false;
    const r = parentRow.getBoundingClientRect();
    const m = $("#ctxMenu").getBoundingClientRect();
    const sw = sub.offsetWidth, sh = sub.offsetHeight;
    // stick to the menu's outer edge; flip to its left side on overflow
    const x = m.right + sw + 8 > window.innerWidth ? m.left - sw : m.right;
    sub.style.left = x + "px";
    sub.style.top = Math.min(r.top - 5, window.innerHeight - sh - 8) + "px";
  }
  function hideSubMenu() { $("#ctxSub").hidden = true; }
  function hideCtxMenu() {
    $("#ctxMenu").hidden = true;
    hideSubMenu();
    subPinned = false;
    ctxAnchor = null;
  }
  document.addEventListener("click", hideCtxMenu);
  document.addEventListener("scroll", hideCtxMenu, true);
  window.addEventListener("blur", hideCtxMenu);

  // ============================================================ DATABASES
  const dbDisplayName = (d) => d.label + (d.missing ? " (missing)" : "");
  const TIP_LINKED = "Live-linked — every change is saved straight back into the real file on disk";
  const TIP_COPY = "Browser copy — changes stay in the browser until you use File → Save database";
  const stateIco = (linked) =>
    `<span class="state-ico" title="${linked ? TIP_LINKED : TIP_COPY}">` +
    ICON(linked ? "link" : "copy") + `</span>`;

  async function loadDatabases(selectToken) {
    const res = await API.listDatabases();
    state.databases = res.databases || [];
    // ensure current db still exists
    if (selectToken) state.db = selectToken;
    if (!state.databases.find((d) => d.token === state.db)) {
      state.db = state.databases[0] ? state.databases[0].token : "example.db";
    }
    localStorage.setItem("sl.db", state.db);
    updateDbLabel();
    updateDbInfo();
    await refreshSchema();
    await loadHistory();
  }

  function updateDbLabel() {
    const d = state.databases.find((x) => x.token === state.db);
    $("#dbSelectLabel").innerHTML =
      stateIco(d && d.linked) + esc(d ? dbDisplayName(d) : state.db);
  }
  function updateDbInfo() {
    const d = state.databases.find((x) => x.token === state.db);
    $("#dbInfo").innerHTML = d
      ? `${esc(d.path)} · ${stateIco(d.linked)} ${d.linked ? "live-linked to file" : "copy"}` +
        `  ·  ${(d.size / 1024).toFixed(1)} KB`
      : "";
  }

  async function switchDb(token) {
    state.db = token;
    localStorage.setItem("sl.db", state.db);
    updateDbLabel();
    updateDbInfo();
    await refreshSchema();
    await loadHistory();
    if (!$("#diagramView").hidden) ERD.open(state.db);
    if (!$("#browseView").hidden) { browse.table = null; openBrowse(); }
    if (state.sidePanel === "files") loadFiles();
    if (state.browsePanel === "filters") renderBrowseFilters();
  }
  $("#dbSelect").onclick = (e) => {
    e.stopPropagation();
    const btn = $("#dbSelect");
    toggleCtxMenu(btn, state.databases.map((d) => ({
      icon: d.linked ? "link" : "copy",
      label: dbDisplayName(d),
      checked: d.token === state.db,
      onClick: () => switchDb(d.token),
    })), { minWidth: btn.getBoundingClientRect().width });
  };

  // ----------------------------------------------------------------- file explorer
  function fmtSize(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : (n / 1024).toFixed(1) + " KB";
  }
  async function loadFiles() {
    const list = $("#fileList");
    list.innerHTML =
      `<div class="skeleton" style="height:12px;width:62%;margin:7px 9px">x</div>` +
      `<div class="skeleton" style="height:12px;width:46%;margin:7px 9px">x</div>`;
    const r = await API.files();
    list.innerHTML = "";
    if (r.error) { list.appendChild(el("div", "side-hint", esc(r.error))); return; }
    $("#filesHint").textContent = r.dir;
    // meta is trusted HTML (sizes/dates we build ourselves + inline icons)
    const row = (icon, name, meta, cls) => {
      const d = el("div", "file-row" + (cls ? " " + cls : ""));
      d.innerHTML =
        ICON(icon) +
        `<span class="file-name">${esc(name)}</span>` +
        `<span class="file-meta">${meta}</span>`;
      return d;
    };
    (r.files || []).forEach((f) => {
      if (f.is_dir) {
        const d = row("folder", f.name + "/", `${f.count} files`,
          f.name === "_backups" ? "clickable" : "dim");
        d.title = f.name === "_backups" ? "Auto-backups — click to manage" : "";
        if (f.name === "_backups") d.onclick = () => dbToolsDialog();
        list.appendChild(d);
        return;
      }
      const isActive = f.is_db && f.name === state.db;
      const d = row(f.is_db ? "database" : "file", f.name,
        `${f.is_db ? stateIco(f.linked) + " " : ""}${fmtSize(f.size)} · ${f.mtime}`,
        f.is_db ? "clickable" + (isActive ? " active" : "") : "dim");
      d.title = f.is_db
        ? (f.linked
            ? "Live-linked — edits save back into the real file on disk"
            : "Browser copy — use File → Save database to export it")
        : f.name;
      if (f.is_db) {
        d.onclick = () => switchDb(f.name);
        d.oncontextmenu = (ev) => {
          ev.preventDefault();
          showCtxMenu(ev.clientX, ev.clientY, [
            { icon: "database", label: "Open", onClick: () => switchDb(f.name) },
            { sep: true },
            { icon: "trash", label: "Close (remove from browser)", danger: true,
              onClick: () => closeDbAction(f.name) },
          ]);
        };
      }
      list.appendChild(d);
    });
    if ((r.external || []).length) {
      list.appendChild(el("div", "file-group", "Registered elsewhere"));
      r.external.forEach((f) => {
        const isActive = f.path === state.db;
        const d = row("database", f.name,
          f.missing ? "missing" : fmtSize(f.size),
          (f.missing ? "missing" : "clickable") + (isActive ? " active" : ""));
        d.title = f.path;
        if (!f.missing) d.onclick = () => switchDb(f.path);
        list.appendChild(d);
      });
    }
  }
  $("#btnRefreshFiles").onclick = loadFiles;

  // create
  function newDbDialog() {
    const body = el("div");
    body.appendChild(
      el("div", "field",
        `<label>Database file name</label>
         <input type="text" id="newDbName" placeholder="my_project.db" />
         <div class="hint">Stored as a real .db file inside the app's data/ folder.</div>`)
    );
    const create = mkBtn("Create", "primary", async () => {
      const name = $("#newDbName").value.trim();
      if (!name) return toast("Enter a name", "err");
      const r = await API.createDatabase(name);
      if (r.error) return toast(r.error, "err");
      closeModal();
      toast("Database created", "ok");
      await loadDatabases(r.token);
    });
    openModal("New database", body, [mkBtn("Cancel", "ghost", closeModal), create]);
    setTimeout(() => $("#newDbName").focus(), 30);
  }

  // open existing file
  function openDbDialog() {
    const fsOk = API.supportsFileLink();
    const body = el("div");
    body.appendChild(
      el("div", "field",
        `<label>Pick a .db file to import (copy)</label>
         <input type="file" id="openDbFile" accept=".db,.sqlite,.sqlite3,.db3" />
         <div class="hint">Import copies the file into the browser's storage —
         the original on disk is never touched; get the edited copy back with
         File → Save database.` +
        (fsOk
          ? `<br><br><b>Open with live link</b> instead keeps a connection to the
             real file: every change is saved straight back into it (you'll be
             asked for permission once).`
          : `<br><br>Live file links (saving straight back into the real file)
             need Chrome or Edge.`) +
        `</div>`)
    );
    const imp = mkBtn("Import copy", fsOk ? "ghost" : "primary", async () => {
      const f = $("#openDbFile").files[0];
      if (!f) return toast("Pick a file first", "err");
      const r = await API.importDbFile(f);
      if (r.error) return toast(r.error, "err");
      closeModal();
      toast("Database imported", "ok");
      await loadDatabases(r.token);
    });
    const buttons = [mkBtn("Cancel", "ghost", closeModal), imp];
    if (fsOk) {
      buttons.push(mkBtn("Open with live link", "primary", async () => {
        const r = await API.linkDbFile();
        if (r && r.cancelled) return;
        if (r.error) return toast(r.error, "err");
        closeModal();
        toast("Linked — edits save back into the file", "ok");
        await loadDatabases(r.token);
      }));
    }
    openModal("Open .db file", body, buttons);
  }

  // blob URLs have no filename of their own — download via a temporary link
  function triggerDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function closeDbAction(name, opts = {}) {
    name = name || state.db;
    const link = await API.fileLink(name);
    const msg = link && link.linked
      ? `Close "${name}"?\n\nThis removes the browser copy and the live link. ` +
        `The real file on disk keeps everything already saved to it.`
      : `Close "${name}"?\n\nThis permanently deletes the browser copy — ` +
        `download it first (File → Save database) if you need to keep it.`;
    if (!opts.silent && !confirm(msg)) return;
    await API.closeDatabase(name);
    const r = await API.listDatabases();
    if (!(r.databases || []).length) await API.resetExample(); // never strand the app
    await loadDatabases();
    if (state.sidePanel === "files") loadFiles();
    toast("Database closed", "ok");
  }

  async function downloadDbAction() {
    // linked databases save back into the real file; others download a copy
    const link = await API.fileLink(state.db);
    if (link && link.linked) {
      const r = await API.saveToFile(state.db);
      if (r.error) return toast(r.error, "err");
      return toast("Saved into the linked file", "ok");
    }
    const url = API.exportDbUrl(state.db);
    if (!url) return toast("Database not loaded yet", "err");
    triggerDownload(url, state.db);
  }

  // reset example
  async function resetExampleAction() {
    if (!confirm("Reset the example database to its original seeded state?")) return;
    const r = await API.resetExample();
    if (r.error) return toast(r.error, "err");
    toast("Example database reset", "ok");
    await loadDatabases("example.db");
  }

  // ============================================================ SCHEMA TREE
  async function refreshSchema() {
    const [tablesRes, schemaRes] = await Promise.all([
      API.listTables(state.db),
      API.schema(state.db),
    ]);
    if (schemaRes.schema) {
      state.schema = schemaRes.schema;
      if (editor) editor.setSchema(state.schema);
    }
    state.tables = tablesRes.tables || [];
    invalidateRelCache();
    renderSchemaTree(state.tables, tablesRes.error);
  }

  $("#btnRefreshSchema").onclick = refreshSchema;
  $("#schemaFilter").addEventListener("input", () => filterSchema());

  function filterSchema() {
    const q = $("#schemaFilter").value.toLowerCase();
    $$("#schemaTree .tree-table, #pinnedList .tree-table").forEach((t) => {
      t.style.display = t.dataset.name.toLowerCase().includes(q) ? "" : "none";
    });
  }

  // pins are stored per-database: sl.pins = { "<db token>": ["table", ...] }
  function getPins() {
    try {
      const all = JSON.parse(localStorage.getItem("sl.pins") || "{}");
      return all[state.db] || [];
    } catch (_) { return []; }
  }
  function setPins(list) {
    let all = {};
    try { all = JSON.parse(localStorage.getItem("sl.pins") || "{}"); } catch (_) {}
    all[state.db] = list;
    localStorage.setItem("sl.pins", JSON.stringify(all));
  }
  function togglePin(name) {
    const pins = getPins();
    const i = pins.indexOf(name);
    if (i >= 0) pins.splice(i, 1); else pins.push(name);
    setPins(pins);
    renderSchemaTree(state.tables);
  }

  function renderSchemaTree(tables, error) {
    const tree = $("#schemaTree");
    const pinnedList = $("#pinnedList");
    tree.innerHTML = "";
    pinnedList.innerHTML = "";
    if (error) {
      tree.appendChild(el("div", "msg-block", esc(error)));
      return;
    }
    const pins = getPins().filter((p) => tables.some((t) => t.name === p));
    $("#pinnedCount").textContent = pins.length;
    $("#entityCount").textContent = tables.length;

    if (!pins.length)
      pinnedList.appendChild(el("div", "msg-block",
        `<span style="color:var(--text-faint);font-size:11px">Nothing pinned. Hover a table and click the pin.</span>`));
    pins.forEach((name) => {
      const t = tables.find((x) => x.name === name);
      if (t) pinnedList.appendChild(buildEntityRow(t, true));
    });

    if (!tables.length) {
      tree.appendChild(el("div", "msg-block",
        `<span style="color:var(--text-faint)">No tables yet.<br>Run a CREATE TABLE statement to start.</span>`));
      return;
    }
    tables.forEach((t) => tree.appendChild(buildEntityRow(t, false)));
    filterSchema();
  }

  function buildEntityRow(t, inPinned) {
    const isView = t.type === "view";
    const pinned = getPins().includes(t.name);
    const wrap = el("div", "tree-table");
    wrap.dataset.name = t.name;
    const head = el("div", "tree-table-head");
    head.innerHTML =
      `<span class="tree-caret" title="Show columns">${ICON("chevron")}</span>` +
      `<span class="tree-icon" title="${isView ? "View — a saved query (read-only)" : "Table — stores rows"}">${ICON(isView ? "eye" : "table")}</span>` +
      `<span class="tree-name ${isView ? "view-label" : ""}">${esc(t.name)}</span>` +
      `<button class="tree-act tree-go" title="Open in Browse">${ICON("arrow-right")}</button>` +
      `<button class="tree-act tree-pin ${pinned ? "pinned" : ""}" title="${pinned ? "Unpin" : "Pin"}">${ICON("pin")}</button>`;
    wrap.appendChild(head);
    const cols = el("div", "tree-cols");
    cols.innerHTML =
      `<div class="skeleton" style="height:12px;width:62%;margin:5px 9px">x</div>` +
      `<div class="skeleton" style="height:12px;width:46%;margin:5px 9px">x</div>`;
    wrap.appendChild(cols);

    const toggleCols = async () => {
      const opening = !wrap.classList.contains("open");
      wrap.classList.toggle("open");
      if (opening && !cols.dataset.loaded) {
        await loadColumns(t.name, cols);
        cols.dataset.loaded = "1";
      }
    };
    head.querySelector(".tree-go").addEventListener("click", (e) => {
      e.stopPropagation();
      openBrowse(t.name);
    });
    head.querySelector(".tree-pin").addEventListener("click", (e) => {
      e.stopPropagation();
      togglePin(t.name);
    });
    // the whole row (name included) toggles the column list, like the arrow
    head.addEventListener("click", toggleCols);
    head.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      entityContextMenu(e, t);
    });
    return wrap;
  }

  function entityContextMenu(e, t) {
    const pinned = getPins().includes(t.name);
    showCtxMenu(e.clientX, e.clientY, [
      { icon: "table", label: "Browse table", onClick: () => openBrowse(t.name) },
      { icon: "layout", label: "View schema", onClick: () => schemaModal(t.name) },
      { icon: "copy", label: "Copy table name", onClick: async () => {
          try { await navigator.clipboard.writeText(t.name); toast("Copied", "ok"); }
          catch (_) { toast("Clipboard blocked by browser", "err"); }
        } },
      { icon: "pin", label: pinned ? "Unpin table" : "Pin table", onClick: () => togglePin(t.name) },
      { sep: true },
      { icon: "download", label: "Export CSV", onClick: () => {
          triggerDownload(API.exportUrl(state.db, { table: t.name, ...csvUrlOpts() }), t.name + ".csv");
        } },
    ]);
  }

  async function schemaModal(table) {
    const r = await API.schema(state.db, table);
    if (r.error) return toast(r.error, "err");
    const body = el("div");
    const rows = (r.columns || []).map((c) => {
      const fk = (r.foreign_keys || []).find((f) => f.from === c.name);
      return `<div class="er-ed-col">
        <span class="er-key" style="width:14px">${c.pk ? ICON("key") : ""}</span>
        <span class="ec-name">${esc(c.name)}</span>
        <span class="ec-type">${esc(c.type)}${c.notnull ? " · NOT NULL" : ""}</span>
        ${fk ? `<span class="er-fk" title="→ ${esc(fk.table)}.${esc(fk.to)}">${ICON("link")}</span>` : ""}
      </div>`;
    }).join("");
    body.innerHTML =
      `<div class="field"><label>Columns</label>${rows}</div>` +
      (r.ddl ? `<div class="field"><label>DDL</label><pre class="syntax-code">${esc(r.ddl)}</pre></div>` : "");
    openModal(`Schema — ${table}`, body, [mkBtn("Close", "primary", closeModal)]);
  }

  async function loadColumns(table, container) {
    const r = await API.schema(state.db, table);
    container.innerHTML = "";
    if (r.error) {
      container.appendChild(el("div", "msg-block", esc(r.error)));
      return;
    }
    (r.columns || []).forEach((c) => {
      const fk = (r.foreign_keys || []).find((f) => f.from === c.name);
      const row = el("div", "tree-col");
      row.innerHTML =
        `<span>${esc(c.name)}</span>` +
        `<span class="col-type">${esc(c.type)}</span>` +
        (c.pk ? `<span class="pk-badge" title="primary key">PK</span>` : "") +
        (fk ? `<span class="fk-badge" title="→ ${esc(fk.table)}.${esc(fk.to)}">FK</span>` : "");
      row.title = `${c.name} ${c.type}${c.notnull ? " NOT NULL" : ""}`;
      row.onclick = () => editor.setValue(insertText(editor.getValue(), c.name));
      container.appendChild(row);
    });
  }

  function insertText(cur, txt) {
    return cur ? cur + (/\s$/.test(cur) ? "" : " ") + txt : txt;
  }
  function quoteIfNeeded(name) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
  }

  // ============================================================ EDITOR / RUN
  function initEditor() {
    editor = SQLEditor.create({
      host: $(".editor-host"),
      textarea: $("#sqlInput"),
      highlight: $("#highlight"),
      gutter: $("#gutterInner"),
      dropdown: $("#acDropdown"),
      onRun: (shift) => (shift ? runCurrentStatement() : runQuery(false)),
      onSnippet: (sql) => insertSnippetText(sql),
    });
    editor.setSchema(state.schema);
    editor.setAutoCaps(state.autoCaps);
  }

  // ---- snippet insertion with ${placeholder} prompts and ${cursor} ----
  function insertSnippetText(sql) {
    const fill = (text) => {
      let caretOffset = text.length;
      const m = text.indexOf("${cursor}");
      if (m !== -1) { caretOffset = m; text = text.replace("${cursor}", ""); }
      const ta = $("#sqlInput");
      const start = ta.selectionStart;
      editor.insert(text);
      ta.selectionStart = ta.selectionEnd = start + caretOffset;
      editor.render();
      editor.focus();
    };
    const names = [...new Set(
      [...sql.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]).filter((n) => n !== "cursor"))];
    if (!names.length) return fill(sql);
    const body = el("div");
    const inputs = {};
    names.forEach((n) => {
      const f = el("div", "field");
      f.innerHTML = `<label>${esc(n)}</label><input type="text" />`;
      inputs[n] = f.querySelector("input");
      body.appendChild(f);
    });
    const go = mkBtn("Insert", "primary", () => {
      let text = sql;
      names.forEach((n) => { text = text.split("${" + n + "}").join(inputs[n].value); });
      closeModal();
      fill(text);
    });
    Object.values(inputs).forEach((inp) =>
      (inp.onkeydown = (e) => { if (e.key === "Enter") go.click(); }));
    openModal("Fill snippet placeholders", body, [mkBtn("Cancel", "ghost", closeModal), go]);
    setTimeout(() => inputs[names[0]].focus(), 30);
  }

  // ============================================================ FIND & REPLACE
  const find = { matches: [], idx: -1 };
  function findMatches() {
    const q = $("#findInput").value;
    const ta = $("#sqlInput");
    find.matches = [];
    find.idx = -1;
    if (q) {
      const hay = ta.value.toLowerCase(), needle = q.toLowerCase();
      let i = hay.indexOf(needle);
      while (i !== -1) { find.matches.push(i); i = hay.indexOf(needle, i + needle.length); }
    }
    updateFindCount();
  }
  function updateFindCount() {
    $("#findCount").textContent =
      find.matches.length ? `${find.idx + 1}/${find.matches.length}` : "0/0";
  }
  function gotoMatch(dir) {
    if (!find.matches.length) return;
    find.idx = (find.idx + dir + find.matches.length) % find.matches.length;
    const ta = $("#sqlInput");
    const q = $("#findInput").value;
    const at = find.matches[find.idx];
    ta.setSelectionRange(at, at + q.length);
    // scroll the match into view (textarea has no native scroll-to-selection)
    const line = ta.value.slice(0, at).split("\n").length;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 21;
    ta.scrollTop = Math.max(0, (line - 4) * lh);
    editor.render();
    updateFindCount();
  }
  function replaceCurrent() {
    const ta = $("#sqlInput");
    const q = $("#findInput").value;
    if (!q || find.idx < 0 || !find.matches.length) return gotoMatch(1);
    const at = find.matches[find.idx];
    const repl = $("#replInput").value;
    ta.value = ta.value.slice(0, at) + repl + ta.value.slice(at + q.length);
    editor.render();
    findMatches();
    // jump to the next match after the replacement
    find.idx = find.matches.findIndex((m) => m >= at + repl.length) - 1;
    if (find.idx < -1) find.idx = find.matches.length - 1;
    gotoMatch(1);
  }
  function replaceAll() {
    const ta = $("#sqlInput");
    const q = $("#findInput").value;
    if (!q || !find.matches.length) return;
    const repl = $("#replInput").value;
    const n = find.matches.length;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    ta.value = ta.value.replace(re, repl.replace(/\$/g, "$$$$"));
    editor.render();
    findMatches();
    toast(`Replaced ${n} occurrence${n > 1 ? "s" : ""}`, "ok");
  }
  function openFindBar() {
    if (state.view !== "editor") railSelect("editor");
    const bar = $("#findBar");
    bar.hidden = false;
    const sel = editor.getSelection ? editor.getSelection() : "";
    if (sel && sel.trim() && !sel.includes("\n")) $("#findInput").value = sel.trim();
    $("#findInput").focus();
    $("#findInput").select();
    findMatches();
    if (find.matches.length) gotoMatch(1);
  }
  function closeFindBar() {
    $("#findBar").hidden = true;
    editor.focus();
  }
  $("#findInput").oninput = () => { findMatches(); if (find.matches.length) gotoMatch(1); };
  $("#findInput").onkeydown = (e) => {
    if (e.key === "Enter") gotoMatch(e.shiftKey ? -1 : 1);
    if (e.key === "Escape") { e.stopPropagation(); closeFindBar(); }
  };
  $("#replInput").onkeydown = (e) => {
    if (e.key === "Enter") replaceCurrent();
    if (e.key === "Escape") { e.stopPropagation(); closeFindBar(); }
  };
  $("#findNext").onclick = () => gotoMatch(1);
  $("#findPrev").onclick = () => gotoMatch(-1);
  $("#replOne").onclick = replaceCurrent;
  $("#replAll").onclick = replaceAll;
  $("#findClose").onclick = closeFindBar;

  $("#btnRun").onclick = () => {
    if (runningQid) { API.cancelQuery(runningQid); return; } // acts as Stop while running
    runQuery(false);
  };
  $("#btnRunMenu").onclick = (e) => {
    e.stopPropagation();
    toggleCtxMenu(e.currentTarget, [
      { label: "Run all", onClick: () => runQuery(false) },
      { label: "Run selected", onClick: () => runQuery(true) },
      { label: "Run current statement", onClick: runCurrentStatement },
      { sep: true },
      { label: "Explain query plan", onClick: explainPlan },
    ]);
  };

  // split SQL into statements with character offsets (mirrors the server's
  // splitter: respects '…', "…", -- comments and /* */ blocks)
  function splitWithOffsets(sql) {
    const out = [];
    let i = 0, start = 0, inS = false, inD = false, inLC = false, inBC = false;
    const n = sql.length;
    const push = (end) => {
      const text = sql.slice(start, end);
      if (text.trim()) out.push({ text: text.trim(), start, end });
      start = end + 1;
    };
    while (i < n) {
      const c = sql[i], nx = sql[i + 1];
      if (inLC) { if (c === "\n") inLC = false; }
      else if (inBC) { if (c === "*" && nx === "/") { inBC = false; i++; } }
      else if (inS) { if (c === "'") { if (nx === "'") i++; else inS = false; } }
      else if (inD) { if (c === '"') { if (nx === '"') i++; else inD = false; } }
      else if (c === "-" && nx === "-") inLC = true;
      else if (c === "/" && nx === "*") { inBC = true; i++; }
      else if (c === "'") inS = true;
      else if (c === '"') inD = true;
      else if (c === ";") push(i);
      i++;
    }
    push(n);
    return out;
  }

  function currentStatementText() {
    const sel = editor.getSelection ? editor.getSelection() : "";
    if (sel && sel.trim()) return sel.trim();
    const stmts = splitWithOffsets(editor.getValue());
    if (!stmts.length) return null;
    const pos = editor.getCursor();
    let target = stmts[0];
    for (const s of stmts) if (s.start <= pos) target = s;
    return target.text;
  }
  function runCurrentStatement() {
    const stmts = splitWithOffsets(editor.getValue());
    if (!stmts.length) return toast("Nothing to run", "err");
    const pos = editor.getCursor();
    let target = stmts[0];
    for (const s of stmts) if (s.start <= pos) target = s;
    return executeSql(target.text);
  }

  // ---- EXPLAIN QUERY PLAN: how SQLite will execute the current statement ----
  async function explainPlan() {
    const stmt = currentStatementText();
    if (!stmt) return toast("Nothing to explain", "err");
    const res = await API.query(state.db, "EXPLAIN QUERY PLAN " + stmt, false);
    const r = res.results && res.results[0];
    if (res.error || (r && r.error))
      return toast((res.error || r.error) + " — the statement itself has to be valid first", "err");
    const rows = (r && r.rows) || [];
    const body = el("div");
    body.innerHTML = `<pre class="inspect-pre" style="margin-bottom:12px">${esc(stmt.length > 400 ? stmt.slice(0, 400) + "…" : stmt)}</pre>`;
    const tree = el("div", "plan-tree");
    // rows are (id, parent, notused, detail) — indent by parent chain
    const depth = {};
    let scans = [];
    rows.forEach(([id, parent, , detail]) => {
      depth[id] = (depth[parent] || 0) + 1;
      const line = el("div", "plan-line");
      line.style.paddingLeft = (depth[id] - 1) * 22 + "px";
      const isScan = /^SCAN\b/.test(detail) && !/USING (COVERING )?INDEX/.test(detail);
      if (isScan) {
        line.classList.add("plan-scan");
        const m = /^SCAN (\S+)/.exec(detail);
        if (m) scans.push(m[1]);
      }
      line.innerHTML = `<span class="plan-detail">${esc(detail)}</span>` +
        (isScan ? `<span class="plan-badge">full scan</span>` : "");
      tree.appendChild(line);
    });
    if (!rows.length) tree.appendChild(el("div", "plan-line", "Nothing to plan (not a query?)"));
    body.appendChild(tree);
    if (scans.length) {
      body.appendChild(el("div", "plan-hint",
        `💡 <b>SCAN</b> means SQLite reads every row of ${scans.map((s) => `<b>${esc(s)}</b>`).join(", ")}. ` +
        `Fine for small tables — on big ones, an index on the column(s) used in WHERE / JOIN ` +
        `usually turns it into a fast SEARCH (Diagram → table → Indexes).`));
    } else if (rows.length) {
      body.appendChild(el("div", "plan-hint",
        `✅ No full table scans — every step uses an index or a direct key lookup.`));
    }
    openModal("Query plan", body, [mkBtn("Close", "primary", closeModal)]);
  }

  $("#btnSettings").onclick = openSettings;

  // ============================================================ QUERY TABS
  const qtabs = (() => {
    try {
      const q = JSON.parse(localStorage.getItem("sl.qtabs"));
      if (q && Array.isArray(q.list) && q.list.length) {
        q.seq = Math.max(q.seq || 1, ...q.list.map((t) => t.id));
        if (!q.list.some((t) => t.id === q.active)) q.active = q.list[0].id;
        return q;
      }
    } catch (_) {}
    return { seq: 1, active: 1, list: [{ id: 1, title: "Query #1", sql: "SELECT * FROM users LIMIT 100;" }] };
  })();

  function activeQueryTab() {
    return qtabs.list.find((t) => t.id === qtabs.active) || qtabs.list[0];
  }
  function persistQueryTabs() {
    const cur = activeQueryTab();
    if (cur && editor) cur.sql = editor.getValue();
    localStorage.setItem("sl.qtabs", JSON.stringify(qtabs));
  }
  window.addEventListener("beforeunload", persistQueryTabs);

  function renderQueryTabs() {
    const bar = $("#queryTabs");
    bar.innerHTML = "";
    qtabs.list.forEach((t) => {
      const tab = el("div", "query-tab" + (t.id === qtabs.active ? " active" : ""));
      tab.innerHTML = `<span>${esc(t.title)}</span>` +
        (qtabs.list.length > 1 ? `<span class="tab-close">${ICON("x")}</span>` : "");
      tab.onclick = (e) => {
        if (e.target.closest(".tab-close")) closeQueryTab(t.id);
        else switchQueryTab(t.id);
      };
      bar.appendChild(tab);
    });
    const add = el("button", "query-tab-add", ICON("plus"));
    add.title = "New query tab";
    add.onclick = addQueryTab;
    bar.appendChild(add);
  }

  function switchQueryTab(id) {
    if (id === qtabs.active) return;
    persistQueryTabs();           // save the outgoing tab's SQL
    qtabs.active = id;
    editor.setValue(activeQueryTab().sql || "");
    renderQueryTabs();
    persistQueryTabs();
  }

  function addQueryTab() {
    persistQueryTabs();
    qtabs.seq += 1;
    // number = rightmost tab's number + 1 (ids stay unique via seq)
    const last = qtabs.list[qtabs.list.length - 1];
    const m = last && /#(\d+)\s*$/.exec(last.title);
    const n = (m ? parseInt(m[1], 10) : 0) + 1;
    const t = { id: qtabs.seq, title: `Query #${n}`, sql: "" };
    qtabs.list.push(t);
    qtabs.active = t.id;
    editor.setValue("");
    renderQueryTabs();
    persistQueryTabs();
    editor.focus();
  }

  function closeQueryTab(id) {
    if (qtabs.list.length <= 1) return;
    const idx = qtabs.list.findIndex((t) => t.id === id);
    qtabs.list.splice(idx, 1);
    if (qtabs.active === id) {
      qtabs.active = qtabs.list[Math.max(0, idx - 1)].id;
      editor.setValue(activeQueryTab().sql || "");
    }
    renderQueryTabs();
    persistQueryTabs();
  }

  function openSettings() {
    const body = el("div");

    const rerenderData = () => {
      renderActiveResult();
      if (!$("#browseView").hidden && browse.table) renderBrowseMain();
    };
    function swRow(label, key, onChange) {
      const row = el("div", "set-row");
      row.innerHTML =
        `<span class="set-label">${esc(label)}</span>` +
        `<label class="switch"><input type="checkbox" ${S[key] ? "checked" : ""} /><span class="knob"></span></label>`;
      row.querySelector("input").onchange = (e) => {
        S[key] = e.target.checked;
        saveSettings(); applySettings();
        if (onChange) onChange();
      };
      return row;
    }
    function selRow(label, key, options, onChange) {
      const row = el("div", "set-row");
      row.appendChild(el("span", "set-label", esc(label)));
      row.appendChild(mkSelect(options, S[key], (v) => {
        S[key] = v;
        saveSettings(); applySettings();
        if (onChange) onChange();
      }, "set-select"));
      return row;
    }
    function btnRow(label, btnLabel, cls, fn) {
      const row = el("div", "set-row");
      row.appendChild(el("span", "set-label", esc(label)));
      row.appendChild(mkBtn(btnLabel, cls, fn));
      return row;
    }
    const section = (t) => body.appendChild(el("div", "set-section", esc(t)));
    const add = (n) => body.appendChild(n);

    // theme — dark and light families get their own subtitle
    const themeField = el("div", "field", `<label>Theme</label>`);
    body.appendChild(themeField);
    [["Dark", THEMES.filter((t) => !LIGHT_THEMES.includes(t.id))],
     ["Light", THEMES.filter((t) => LIGHT_THEMES.includes(t.id))]].forEach(([mode, list]) => {
      themeField.appendChild(el("div", "theme-mode-head", mode));
      const grid = el("div", "theme-grid");
      list.forEach((t) => {
        const card = el("button", "theme-card" + (t.id === state.theme ? " active" : ""));
        card.innerHTML =
          `<span class="theme-dot" style="background:${t.dot}"></span>` +
          `<span class="theme-name">${t.name}</span><span class="theme-sub">${t.sub}</span>`;
        card.onclick = () => {
          applyTheme(t.id);
          $$(".theme-card", themeField).forEach((c) => c.classList.remove("active"));
          card.classList.add("active");
        };
        grid.appendChild(card);
      });
      themeField.appendChild(grid);
    });

    section("Editor");
    // auto-caps predates the settings store; it keeps its own key
    const caps = el("div", "set-row",
      `<span class="set-label">Auto-capitalize SQL keywords</span>` +
      `<label class="switch"><input type="checkbox" ${state.autoCaps ? "checked" : ""} /><span class="knob"></span></label>`);
    caps.querySelector("input").onchange = (e) => {
      state.autoCaps = e.target.checked;
      localStorage.setItem("sl.autoCaps", state.autoCaps);
      editor.setAutoCaps(state.autoCaps);
    };
    add(caps);
    add(selRow("Tab width", "tabWidth", [[2, "2 spaces"], [4, "4 spaces"]]));
    add(swRow("Word wrap (hides line numbers)", "wordWrap"));
    add(swRow("Autocomplete as you type", "acEnabled"));
    add(selRow("Autocomplete after", "acMinChars",
      [[1, "1 character"], [2, "2 characters"], [3, "3 characters"]]));
    const fsRow = el("div", "set-row");
    fsRow.appendChild(el("span", "set-label", "Editor font size"));
    fsRow.appendChild(mkSelect(
      [11, 12, 13, 13.5, 14, 15, 16, 18, 20, 22].map((v) => [v, v + " px"]),
      editorFs, (v) => setEditorFs(v), "set-select"));
    add(fsRow);
    add(swRow("Format SQL automatically on Run", "autoFormat"));

    section("Query & safety");
    add(swRow("Confirm destructive statements", "confirmDestructive"));
    add(swRow("Read-only mode (block all writes)", "readOnly"));
    add(selRow("Browse page size", "pageSize",
      [[25], [50], [100], [250], [500]],
      () => { if (!$("#browseView").hidden && browse.table) { browse.offset = 0; reloadBrowse(); } }));
    add(selRow("Max rows shown per result", "maxRows",
      [[100], [500], [1000], [0, "unlimited"]], rerenderData));

    section("History");
    add(swRow("Record query history", "recordHistory"));
    add(selRow("History entries shown", "maxHistory",
      [[50], [100], [200]], loadHistory));
    add(btnRow("Query history", "Clear all", "danger", async () => {
      if (!confirm("Clear all query history?")) return;
      await API.clearHistory();
      loadHistory();
      toast("History cleared", "ok");
    }));

    section("Display");
    add(selRow("Show NULL as", "nullDisplay",
      [["NULL", "NULL"], ["", "empty cell"], ["∅", "∅"]], rerenderData));
    add(selRow("Truncate long cells", "truncate",
      [[0, "off"], [80, "80 chars"], [200, "200 chars"], [500, "500 chars"]], rerenderData));
    add(swRow("Show status bar", "showStatusbar"));
    add(selRow("Density", "density",
      [["comfortable", "comfortable"], ["compact", "compact"]]));

    section("Data");
    add(selRow("CSV delimiter", "csvDelimiter",
      [[",", "comma ,"], [";", "semicolon ;"], ["\t", "tab"]]));
    add(swRow("CSV header row", "csvHeader"));
    add(swRow("Auto-backup before destructive SQL (keeps last 5)", "autoBackup"));
    add(btnRow("Saved diagram layouts", "Forget", "ghost", () => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sl.erd.")).forEach((k) => localStorage.removeItem(k));
      toast("Diagram layouts forgotten", "ok");
    }));

    add(el("div", "field", `<div class="hint" style="margin-top:14px">SequenceLab runs fully offline. Databases are stored as real .db files in the app's data/ folder; settings live in this browser.</div>`));

    const reset = mkBtn("Reset defaults", "ghost", () => {
      S = { ...SETTINGS_DEFAULTS };
      saveSettings(); applySettings(); rerenderData(); loadHistory();
      closeModal(); openSettings();
    });
    openModal("Settings", body, [reset, mkBtn("Done", "primary", closeModal)]);
  }

  async function runQuery(selectionOnly) {
    if (!selectionOnly && S.autoFormat) editor.format();
    const sql = (selectionOnly ? editor.getSelection() : editor.getValue()).trim();
    return executeSql(sql);
  }

  const WRITE_STMT = /^\s*(insert|update|delete|drop|alter|create|replace|vacuum)\b/i;
  const RISKY_STMT = /^\s*(drop|alter)\b/i;

  // ---- :name / ? parameter prompts ----
  function findParams(sql) {
    // scan outside strings & comments
    const named = [], positional = [];
    let i = 0, inS = false, inD = false, inLC = false, inBC = false;
    while (i < sql.length) {
      const c = sql[i], n = sql[i + 1] || "";
      if (inLC) { if (c === "\n") inLC = false; }
      else if (inBC) { if (c === "*" && n === "/") { inBC = false; i++; } }
      else if (inS) { if (c === "'") inS = false; }
      else if (inD) { if (c === '"') inD = false; }
      else if (c === "-" && n === "-") inLC = true;
      else if (c === "/" && n === "*") inBC = true;
      else if (c === "'") inS = true;
      else if (c === '"') inD = true;
      else if (c === ":" && /[A-Za-z_]/.test(n)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i + 1));
        if (!named.includes(m[0])) named.push(m[0]);
        i += m[0].length;
      } else if (c === "?") positional.push(positional.length + 1);
      i++;
    }
    return { named, positional };
  }
  function sqlLiteral(v) {
    if (v === "" || v.toUpperCase() === "NULL") return "NULL";
    return /^-?\d+(\.\d+)?$/.test(v) ? v : "'" + v.replace(/'/g, "''") + "'";
  }
  function promptParams(sql) {
    return new Promise((resolve) => {
      const { named, positional } = findParams(sql);
      const keys = named.length ? named : positional.map((n) => "?" + n);
      if (!keys.length) return resolve(sql);
      const body = el("div");
      keys.forEach((k) => {
        const f = el("div", "field");
        f.innerHTML = `<label>${esc(named.length ? ":" + k : "parameter " + k)}</label>
          <input type="text" data-param="${esc(k)}" placeholder="NULL" />`;
        body.appendChild(f);
      });
      const go = mkBtn("Run", "primary", () => {
        let out = sql;
        if (named.length) {
          $$("[data-param]", body).forEach((inp) => {
            out = out.replace(
              new RegExp(":" + inp.dataset.param + "\\b", "g"),
              sqlLiteral(inp.value));
          });
        } else {
          const vals = $$("[data-param]", body).map((inp) => sqlLiteral(inp.value));
          let i = 0;
          out = out.replace(/\?/g, () => vals[i++] ?? "NULL");
        }
        closeModal();
        resolve(out);
      });
      openModal("Query parameters", body, [
        mkBtn("Cancel", "ghost", () => { closeModal(); resolve(null); }), go,
      ]);
      setTimeout(() => body.querySelector("input")?.focus(), 30);
    });
  }

  let runningQid = null;
  function setRunState(running) {
    const b = $("#btnRun");
    b.innerHTML = (running ? ICON("x") : ICON("play")) + (running ? "Stop" : "Run");
    b.classList.toggle("danger", running);
  }

  async function executeSql(sql) {
    if (!sql) return toast("Nothing to run", "err");
    sql = await promptParams(sql);
    if (sql === null) return;
    const stmts = splitWithOffsets(sql);
    const hasWrite = stmts.some((s) => WRITE_STMT.test(s.text));
    if (S.readOnly && hasWrite)
      return toast("Read-only mode is on (see Settings).", "err");
    if (S.confirmDestructive) {
      const risky = stmts.filter((s) =>
        RISKY_STMT.test(s.text) ||
        (/^\s*(delete|update)\b/i.test(s.text) && !/\bwhere\b/i.test(s.text)));
      if (risky.length && !confirm(
        `About to run ${risky.length} destructive statement(s):\n\n` +
        risky.map((s) => s.text.slice(0, 80)).join("\n") +
        "\n\nContinue?")) return;
    }
    persistQueryTabs();
    setStatus("Running…");
    runningQid = "q" + Date.now() + Math.random().toString(36).slice(2, 7);
    setRunState(true);
    const t0 = performance.now();
    const res = await API.query(state.db, sql, S.recordHistory, S.autoBackup && hasWrite, runningQid);
    runningQid = null;
    setRunState(false);
    const ms = (performance.now() - t0).toFixed(0);
    setStatus(`Done in ${res.duration_ms ?? ms} ms`);

    if (res.error) {
      addResultTab({
        kind: "error",
        title: "Error",
        error: res.error,
        explanation: res.explanation,
        sql,
        partial: res.results || [],
      });
    } else {
      const results = res.results || [];
      if (!results.length) {
        addResultTab({ kind: "message", title: "OK", message: "Statement executed." });
      } else {
        results.forEach((r, i) =>
          addResultTab(resultToTab(r, results.length > 1 ? i + 1 : null))
        );
      }
    }
    await loadHistory();
    refreshSchema(); // schema may have changed (DDL)
  }

  function setStatus(s) {
    $("#editorStatus").textContent = s;
  }

  function resultToTab(r, idx) {
    if (r.kind === "rows") {
      return {
        kind: "grid",
        statement: r.statement,
        title: (idx ? `#${idx} ` : "") + `Result (${r.row_count})`,
        columns: r.columns.map((c) => ({ name: c })),
        rows: r.rows,
        readOnly: true,
        meta: `${r.row_count} rows · ${r.duration_ms} ms`,
      };
    }
    return {
      kind: "message",
      statement: r.statement,
      title: (idx ? `#${idx} ` : "") + "Write",
      message:
        `${r.rows_affected} row(s) affected` +
        (r.last_insert_rowid ? ` · last rowid ${r.last_insert_rowid}` : "") +
        ` · ${r.duration_ms} ms`,
    };
  }

  // ============================================================ RESULT TABS
  // identity of a tab: the SQL that produced it (errors: the whole input)
  function tabKey(t) {
    if (t.kind === "error") return "error::" + (t.sql || "");
    if (t.statement) return t.kind + "::" + t.statement;
    return null;
  }

  function addResultTab(tab) {
    // re-running the same statement refreshes & switches to its existing tab
    const key = tabKey(tab);
    const existing = key && state.tabs.find((t) => tabKey(t) === key);
    if (existing) {
      Object.assign(existing, tab, { id: existing.id });
      state.activeTab = existing.id;
      renderTabs();
      renderActiveResult();
      return;
    }
    tab.id = "t" + state.tabSeq++;
    state.tabs.push(tab);
    if (state.tabs.length > 12) {
      const removed = state.tabs.shift();
      if (state.activeTab === removed.id) state.activeTab = null;
    }
    state.activeTab = tab.id;
    renderTabs();
    renderActiveResult();
  }

  function renderTabs() {
    const bar = $("#resultsTabs");
    bar.innerHTML = "";
    state.tabs.forEach((t) => {
      const dot =
        t.kind === "error" ? "err" : t.kind === "browse" ? "tbl" : "ok";
      const tab = el("div", "result-tab" + (t.id === state.activeTab ? " active" : ""));
      tab.innerHTML =
        `<span class="dot ${dot}"></span><span>${esc(t.title)}</span>` +
        `<span class="tab-close">${ICON("x")}</span>`;
      tab.onclick = (e) => {
        if (e.target.closest(".tab-close")) {
          closeTab(t.id);
        } else {
          state.activeTab = t.id;
          renderTabs();
          renderActiveResult();
        }
      };
      bar.appendChild(tab);
    });
  }

  function closeTab(id) {
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    state.tabs.splice(idx, 1);
    if (state.activeTab === id)
      state.activeTab = state.tabs.length
        ? state.tabs[Math.max(0, idx - 1)].id
        : null;
    renderTabs();
    renderActiveResult();
  }

  function renderActiveResult() {
    const body = $("#resultsBody");
    body.innerHTML = "";
    const tab = state.tabs.find((t) => t.id === state.activeTab);
    if (!tab) {
      body.appendChild(helpResult());
      return;
    }
    if (tab.kind === "error") return body.appendChild(renderError(tab));
    if (tab.kind === "message") return body.appendChild(renderMessage(tab));
    if (tab.kind === "grid") return body.appendChild(renderGrid(tab));
  }

  const SHORTCUTS = [
    ["Run", ["Ctrl", "Enter"]],
    ["Run current statement", ["Ctrl", "Shift", "Enter"]],
    ["Autocomplete", ["Ctrl", "Space"]],
    ["Save snippet", ["Ctrl", "S"]],
    ["Format SQL", ["Ctrl", "Shift", "F"]],
    ["Toggle comment", ["Ctrl", "/"]],
    ["Duplicate line", ["Alt", "Shift", "↓"]],
    ["Command palette", ["Ctrl", "K"]],
    ["Find & replace", ["Ctrl", "F"]],
    ["Search whole database", ["Ctrl", "Shift", "G"]],
    ["Close result tab", ["Alt", "W"]],
    ["Toggle side panel", ["Alt", "S"]],
    ["Edit cell (Browse)", ["Double-click"]],
    ["Inspect cell", ["Double-click (read-only)"]],
  ];

  // results placeholder: shortcuts presented exactly like a query result
  function helpResult() {
    const wrap = el("div", "result-content");
    const gridWrap = el("div", "grid-wrap");
    const table = el("table", "grid");
    const thead = el("thead");
    const htr = el("tr");
    htr.appendChild(el("th", "rownum", "#"));
    htr.appendChild(el("th", "", "action"));
    htr.appendChild(el("th", "", "shortcut"));
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = el("tbody");
    SHORTCUTS.forEach(([label, keys], i) => {
      const tr = el("tr");
      tr.appendChild(el("td", "rownum", i + 1));
      tr.appendChild(el("td", "", esc(label)));
      tr.appendChild(el("td", "", keys.map((k) => `<kbd>${esc(k)}</kbd>`).join("")));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    gridWrap.appendChild(table);
    wrap.appendChild(gridWrap);
    return wrap;
  }

  // help modal: centered, action right-aligned / keys left-aligned on a middle line
  function helpPanel() {
    const wrap = el("div", "help-panel");
    const table = el("table", "grid help-grid");
    const tbody = el("tbody");
    SHORTCUTS.forEach(([label, keys]) => {
      const tr = el("tr");
      tr.appendChild(el("td", "help-label", esc(label)));
      tr.appendChild(el("td", "help-keys",
        keys.map((k) => `<kbd>${esc(k)}</kbd>`).join("")));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderMessage(tab) {
    const wrap = el("div", "result-content");
    wrap.appendChild(el("div", "msg-block msg-ok", "✓ " + esc(tab.message)));
    return wrap;
  }

  function renderError(tab) {
    const wrap = el("div", "result-content");
    const card = el("div", "error-card");
    card.appendChild(el("div", "error-head", "⛔ Query failed"));
    card.appendChild(el("div", "error-raw", esc(tab.error)));
    if (tab.explanation)
      card.appendChild(
        el("div", "error-explain",
          `<span class="bulb">💡</span><span>${esc(tab.explanation)}</span>`)
      );
    wrap.appendChild(card);
    return wrap;
  }

  // -------- generic read-only grid (query results) --------
  function gridView(tab) {
    // filter -> sort -> cap, all client-side
    let rows = tab.rows;
    if (tab.filter) {
      const q = tab.filter.toLowerCase();
      rows = rows.filter((r) =>
        r.some((v) => v !== null && !isBlob(v) && String(v).toLowerCase().includes(q)));
    }
    if (tab.sort) {
      const i = tab.columns.findIndex((c) => c.name === tab.sort.col);
      const dir = tab.sort.dir === "desc" ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const x = a[i], y = b[i];
        if (x === null) return 1; if (y === null) return -1;
        const nx = parseFloat(x), ny = parseFloat(y);
        if (!isNaN(nx) && !isNaN(ny)) return (nx - ny) * dir;
        return String(x).localeCompare(String(y)) * dir;
      });
    }
    const capped = S.maxRows > 0 && rows.length > S.maxRows;
    return { rows: capped ? rows.slice(0, S.maxRows) : rows, capped, total: rows.length };
  }

  function tableNameFromStatement(stmt) {
    const m = /\bfrom\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(stmt || "");
    return m ? m[1] : "my_table";
  }

  function exportMenu(e, tab, view) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const headers = tab.columns.map((c) => c.name);
    const plain = (v) => (isBlob(v) ? "<blob>" : v);
    showCtxMenu(r.left, r.bottom + 4, [
      { label: "Download CSV", onClick: () =>
        downloadText("query_result.csv", toCsv(headers, view.rows)) },
      { label: "Download JSON", onClick: () => {
        const objs = view.rows.map((row) => {
          const o = {}; headers.forEach((h, i) => (o[h] = plain(row[i]))); return o;
        });
        downloadText("query_result.json", JSON.stringify(objs, null, 2));
      } },
      { sep: true },
      { label: "Copy as Markdown", onClick: async () => {
        const md = ["| " + headers.join(" | ") + " |",
                    "| " + headers.map(() => "---").join(" | ") + " |",
          ...view.rows.map((row) => "| " + row.map((v) =>
            v === null ? "" : String(plain(v)).replace(/\|/g, "\\|")).join(" | ") + " |"),
        ].join("\n");
        try { await navigator.clipboard.writeText(md); toast("Markdown copied", "ok"); }
        catch (_) { toast("Clipboard blocked by browser", "err"); }
      } },
      { label: "Copy as INSERT statements", onClick: async () => {
        const t = tableNameFromStatement(tab.statement);
        const cols = headers.map(quoteIfNeeded).join(", ");
        const sql = view.rows.map((row) =>
          `INSERT INTO ${quoteIfNeeded(t)} (${cols}) VALUES (` +
          row.map((v) => v === null ? "NULL" :
            isBlob(v) ? "NULL /* blob */" :
            typeof v === "number" ? String(v) :
            "'" + String(v).replace(/'/g, "''") + "'").join(", ") + ");").join("\n");
        try { await navigator.clipboard.writeText(sql); toast("INSERTs copied", "ok"); }
        catch (_) { toast("Clipboard blocked by browser", "err"); }
      } },
    ]);
  }

  function renderGrid(tab) {
    const wrap = el("div", "result-content");
    const view = gridView(tab);
    const bar = el("div", "result-bar");
    bar.innerHTML =
      `<span class="stat"><b>${view.total}</b>${tab.filter ? ` / ${tab.rows.length}` : ""} rows</span>` +
      (view.capped ? `<span class="stat" style="color:var(--warn)">showing first ${S.maxRows}</span>` : "");
    const filter = el("input", "mini-input grid-filter");
    filter.placeholder = "Filter rows…";
    filter.value = tab.filter || "";
    filter.setAttribute("aria-label", "Filter result rows");
    let deb;
    filter.oninput = () => {
      clearTimeout(deb);
      deb = setTimeout(() => {
        tab.filter = filter.value.trim();
        renderActiveResult();
        const f = $("#resultsBody .grid-filter");
        if (f) { f.focus(); f.selectionStart = f.value.length; }
      }, 220);
    };
    bar.appendChild(filter);
    bar.appendChild(el("span", "spacer"));
    const numericCols = tab.columns.filter((c, i) =>
      tab.rows.some((r) => typeof r[i] === "number"));
    if (numericCols.length)
      bar.appendChild(mkBtn("Chart", "ghost", () => chartModal(tab)));
    const exp = mkBtn(ICON("download") + "Export", "ghost", () => {});
    exp.onclick = (e) => exportMenu(e, tab, gridView(tab));
    bar.appendChild(exp);
    wrap.appendChild(bar);

    const gridWrap = el("div", "grid-wrap");
    gridWrap.appendChild(buildTable(tab, view.rows));
    wrap.appendChild(gridWrap);
    return wrap;
  }

  function buildTable(tab, rows) {
    const columns = tab.columns;
    if (tab._editAnalysis === undefined) tab._editAnalysis = analyzeEditable(tab.statement);
    const srcTable = tab._editAnalysis ? tab._editAnalysis.table : null;
    const editable = !!tab._editAnalysis && !(tab.edit && tab.edit.bad);
    const table = el("table", "grid");
    const thead = el("thead");
    const htr = el("tr");
    htr.appendChild(el("th", "rownum", "#"));
    columns.forEach((c) => {
      const th = el("th");
      th.innerHTML = esc(c.name) + (c.type ? `<span class="th-type">${esc(c.type)}</span>` : "");
      th.title = "Click to sort";
      if (tab.sort && tab.sort.col === c.name)
        th.innerHTML += tab.sort.dir === "desc" ? " ▼" : " ▲";
      th.onclick = () => {
        tab.sort = tab.sort && tab.sort.col === c.name
          ? (tab.sort.dir === "asc" ? { col: c.name, dir: "desc" } : null)
          : { col: c.name, dir: "asc" };
        renderActiveResult();
      };
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = el("tbody");
    rows.forEach((r, i) => {
      const tr = el("tr");
      tr.appendChild(el("td", "rownum", i + 1));
      const arr = Array.isArray(r) ? r : columns.map((c) => r[c.name]);
      const origIndex = editable ? tab.rows.indexOf(r) : -1;
      arr.forEach((v, ci) => {
        const td = cellTd(v);
        if (editable && !isBlob(v)) {
          td.classList.add("editable");
          td.ondblclick = () => beginEditResult(td, tab, origIndex, columns[ci].name, v);
        }
        tr.appendChild(td);
      });
      tr.onclick = () => {
        const obj = {};
        columns.forEach((c, ci) => (obj[c.name] = arr[ci]));
        showRecord(obj, tr, srcTable);
      };
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  // ---- inline-editable result grids (simple single-table SELECTs only) ----
  // returns { table, rewrite } when the statement is a single-table SELECT of
  // plain columns (no joins / aggregates / expressions), else null. The rewrite
  // adds rowid so each displayed row maps back to a real row for updates.
  function analyzeEditable(statement) {
    if (!statement) return null;
    const s = statement.trim().replace(/;+\s*$/, "");
    if (/\b(join|union|intersect|except)\b/i.test(s)) return null;
    if (/\bgroup\s+by\b/i.test(s)) return null;
    const m = /^select\s+([\s\S]+?)\s+from\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_]\w*)\s*(?:where\b[\s\S]*|order\s+by\b[\s\S]*|limit\b[\s\S]*)?$/i.exec(s);
    if (!m) return null;
    const list = m[1].trim();
    if (/^distinct\b/i.test(list)) return null;
    if (list !== "*" && !list.split(",").every((c) =>
      /^\s*("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_]\w*)\s*$/.test(c))) return null;
    const table = m[2].replace(/^["`\[]/, "").replace(/["`\]]$/, "");
    return { table, rewrite: s.replace(/^select\s+/i, (kw) => kw + "rowid AS __rowid__, ") };
  }

  // rowids aligned to tab.rows; caches { table, rowids } or { bad: true }
  async function ensureRowids(tab) {
    if (tab.edit) return tab.edit;
    const a = tab._editAnalysis;
    if (!a) return (tab.edit = { bad: true });
    let res;
    try { res = await API.query(state.db, a.rewrite, false, false); }
    catch (_) { return (tab.edit = { bad: true }); }
    const r = res && res.results && res.results[0];
    if (res.error || !r || r.kind !== "rows" || r.row_count !== tab.rows.length)
      return (tab.edit = { bad: true });
    const idx = r.columns.indexOf("__rowid__");
    if (idx < 0) return (tab.edit = { bad: true });
    return (tab.edit = { table: a.table, rowids: r.rows.map((row) => row[idx]) });
  }

  async function beginEditResult(td, tab, rowIndex, col, oldVal) {
    if (td.classList.contains("editing")) return;
    if (S.readOnly) return toast("Read-only mode is on (see Settings).", "err");
    const info = await ensureRowids(tab);
    if (info.bad || rowIndex < 0 || info.rowids[rowIndex] == null) {
      toast("This result can't be edited inline.", "err");
      renderActiveResult();
      return;
    }
    td.classList.add("editing");
    const input = el("input", "cell-edit");
    input.type = "text";
    input.value = oldVal === null || oldVal === undefined ? "" : String(oldVal);
    td.textContent = "";
    td.appendChild(input);
    input.focus(); input.select();
    let done = false;
    const commit = async () => {
      if (done) return; done = true;
      const val = input.value === "" ? null : input.value;
      const res = await API.updateRow(state.db, info.table, { __rowid__: info.rowids[rowIndex] }, { [col]: val });
      if (res.error) { toast(res.error, "err"); renderActiveResult(); return; }
      const ci = tab.columns.findIndex((c) => c.name === col);
      if (ci >= 0) tab.rows[rowIndex][ci] = val;
      toast("Saved", "ok");
      renderActiveResult();
      if (!$("#browseView").hidden && browse.table === info.table) reloadBrowse();
    };
    const cancel = () => {
      if (done) return; done = true;
      td.classList.remove("editing");
      td.textContent = oldVal === null || oldVal === undefined ? S.nullDisplay : String(oldVal);
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    };
    input.onblur = commit;
  }

  // ---- quick chart (canvas, no libs) ----
  function chartModal(tab) {
    const numeric = [], textish = [];
    tab.columns.forEach((c, i) => {
      (tab.rows.some((r) => typeof r[i] === "number") ? numeric : textish)
        .push({ name: c.name, i });
    });
    const body = el("div");
    const selRow2 = (lbl, sel) => {
      const r = el("div", "set-row");
      r.appendChild(el("span", "set-label", lbl));
      r.appendChild(sel);
      return r;
    };
    const xSel = mkSelect([...textish, ...numeric].map((c) => [c.i, c.name]),
      (textish[0] || numeric[0]).i, () => draw(), "set-select");
    const ySel = mkSelect(numeric.map((c) => [c.i, c.name]),
      numeric[0].i, () => draw(), "set-select");
    const tSel = mkSelect([["bar"], ["line"]], "bar", () => draw(), "set-select");
    body.appendChild(selRow2("X axis", xSel));
    body.appendChild(selRow2("Y axis (numeric)", ySel));
    body.appendChild(selRow2("Type", tSel));
    body.insertAdjacentHTML("beforeend",
      `<canvas id="chCanvas" width="560" height="300" class="chart-canvas"></canvas>`);
    const draw = () => {
      const xi = +xSel.getValue(), yi = +ySel.getValue(), type = tSel.getValue();
      const rows = gridView(tab).rows.slice(0, 60);
      const cv = body.querySelector("#chCanvas"), ctx = cv.getContext("2d");
      const cs = getComputedStyle(document.documentElement);
      const C = (n) => cs.getPropertyValue(n).trim();
      ctx.clearRect(0, 0, cv.width, cv.height);
      const vals = rows.map((r) => Number(r[yi]) || 0);
      const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
      const span = max - min || 1;
      const L = 44, B = 36, W = cv.width - L - 12, H = cv.height - B - 14;
      ctx.strokeStyle = C("--border-2"); ctx.lineWidth = 1;
      ctx.strokeRect(L, 10, W, H);
      ctx.fillStyle = C("--muted"); ctx.font = "10px " + C("--mono");
      ctx.textAlign = "right";
      ctx.fillText(String(max), L - 5, 18);
      ctx.fillText(String(min), L - 5, 12 + H);
      const y0 = 10 + H - ((0 - min) / span) * H;
      const n = rows.length, bw = W / Math.max(n, 1);
      ctx.fillStyle = C("--accent");
      if (type === "bar") {
        rows.forEach((r, i) => {
          const h = ((Number(r[yi]) || 0) - min) / span * H;
          ctx.fillRect(L + i * bw + bw * 0.15, 10 + H - h, bw * 0.7, h - (y0 - (10 + H)) * 0);
        });
      } else {
        ctx.strokeStyle = C("--accent"); ctx.lineWidth = 2;
        ctx.beginPath();
        rows.forEach((r, i) => {
          const x = L + i * bw + bw / 2;
          const y = 10 + H - (((Number(r[yi]) || 0) - min) / span) * H;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      // x labels (sparse)
      ctx.fillStyle = C("--faint"); ctx.textAlign = "center";
      const step = Math.ceil(n / 8);
      rows.forEach((r, i) => {
        if (i % step) return;
        const lbl = String(r[xi] ?? i + 1).slice(0, 9);
        ctx.fillText(lbl, L + i * bw + bw / 2, cv.height - 16);
      });
    };
    openModal("Chart", body, [mkBtn("Close", "primary", closeModal)]);
    draw();
  }

  const isBlob = (v) => v && typeof v === "object" && "$blob" in v;

  function cellTd(v) {
    const td = el("td");
    if (v === null || v === undefined) {
      td.className = "null";
      td.textContent = S.nullDisplay;
    } else if (isBlob(v)) {
      td.className = "blob";
      td.textContent = `BLOB · ${v.size} B`;
      td.title = "Double-click to inspect";
    } else {
      let s = String(v);
      if (S.truncate > 0 && s.length > S.truncate) {
        td.title = s.length > 2000 ? s.slice(0, 2000) + "…" : s;
        s = s.slice(0, S.truncate) + "…";
      }
      td.textContent = s;
    }
    td.ondblclick = td.ondblclick || (() => inspectCell(v));
    return td;
  }

  // ---- cell inspector (full text / blob preview) ----
  function inspectCell(v) {
    const body = el("div");
    if (isBlob(v)) {
      const bytes = atob(v.$blob);
      const sig = bytes.slice(0, 12);
      const mime =
        sig.startsWith("\x89PNG") ? "image/png" :
        sig.startsWith("\xff\xd8") ? "image/jpeg" :
        sig.startsWith("GIF8") ? "image/gif" :
        sig.includes("WEBP") ? "image/webp" : null;
      if (mime) {
        body.innerHTML =
          `<img class="blob-preview" src="data:${mime};base64,${v.$blob}" alt="BLOB image preview" />` +
          `<div class="hint" style="margin-top:8px">${mime} · ${v.size} bytes</div>`;
      } else {
        const hex = [...bytes.slice(0, 512)]
          .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
        body.innerHTML =
          `<pre class="inspect-pre">${esc(hex)}${v.size > 512 ? "\n…" : ""}</pre>` +
          `<div class="hint" style="margin-top:8px">binary · ${v.size} bytes (first 512 shown as hex)</div>`;
      }
    } else {
      const s = v === null || v === undefined ? "NULL" : String(v);
      body.innerHTML = `<pre class="inspect-pre">${esc(s)}</pre>` +
        `<div class="hint" style="margin-top:8px">${s.length} characters</div>`;
    }
    const copy = mkBtn(ICON("copy") + "Copy", "ghost", async () => {
      try {
        await navigator.clipboard.writeText(isBlob(v) ? v.$blob : String(v ?? ""));
        toast("Copied", "ok");
      } catch (_) { toast("Clipboard blocked by browser", "err"); }
    });
    openModal("Cell value", body, [copy, mkBtn("Close", "primary", closeModal)]);
  }

  function toCsv(headers, rows) {
    const d = S.csvDelimiter;
    const escCell = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /["\n]/.test(s) || s.includes(d) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = S.csvHeader ? [headers.map(escCell).join(d)] : [];
    rows.forEach((r) => {
      const arr = Array.isArray(r) ? r : headers.map((h) => r[h]);
      lines.push(arr.map(escCell).join(d));
    });
    return lines.join("\n");
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/csv" });
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ============================================================ BROWSE VIEW
  const browse = { table: null, offset: 0, limit: 100, orderBy: null, orderDir: "ASC", data: null, where: "", fks: [] };

  async function openBrowse(table, where) {
    setView("browse");
    if (table) {
      browse.table = table;
      browse.offset = 0; browse.orderBy = null; browse.orderDir = "ASC";
      browse.where = where || "";
      browse.fks = [];
      API.schema(state.db, table).then((r) => {
        browse.fks = (r && r.foreign_keys) || [];
      });
    }
    await loadBrowseTables();
    if (browse.table) await reloadBrowse();
    else renderBrowseMain();
  }

  async function loadBrowseTables() {
    const res = await API.listTables(state.db);
    const list = $("#browseTableList");
    list.innerHTML = "";
    (res.tables || []).forEach((t) => {
      const row = el("div", "browse-table-row" + (t.name === browse.table ? " active" : ""));
      row.dataset.name = t.name;
      row.innerHTML =
        `<span class="er-tr-icon" title="${t.type === "view" ? "View — a saved query (read-only)" : "Table — stores rows"}">${ICON(t.type === "view" ? "eye" : "table")}</span>` +
        `<span class="bt-name">${esc(t.name)}</span>` +
        `<span class="er-tr-count">${t.rows != null ? t.rows : ""}</span>`;
      row.onclick = () => {
        browse.table = t.name; browse.offset = 0; browse.orderBy = null; browse.orderDir = "ASC";
        browse.where = ""; browse.fks = [];
        API.schema(state.db, t.name).then((r) => { browse.fks = (r && r.foreign_keys) || []; });
        markBrowseActive();
        reloadBrowse();
      };
      list.appendChild(row);
    });
    filterBrowseTables();
  }
  function markBrowseActive() {
    $$("#browseTableList .browse-table-row").forEach((r) =>
      r.classList.toggle("active", r.dataset.name === browse.table));
  }
  function filterBrowseTables() {
    const q = ($("#browseFilter").value || "").toLowerCase();
    $$("#browseTableList .browse-table-row").forEach((r) =>
      (r.style.display = r.dataset.name.toLowerCase().includes(q) ? "" : "none"));
  }
  $("#browseFilter").addEventListener("input", filterBrowseTables);
  $("#browseRefresh").onclick = () => openBrowse();

  // ------------------------------------------------- saved filters (per db)
  function bfKey() { return "sl.bfilters." + state.db; }
  function loadBFilters() {
    try { return JSON.parse(localStorage.getItem(bfKey()) || "[]"); }
    catch (_) { return []; }
  }
  function saveBFilters(list) {
    localStorage.setItem(bfKey(), JSON.stringify(list));
    renderBrowseFilters();
  }
  function renderBrowseFilters() {
    const host = $("#browseFilterList");
    host.innerHTML = "";
    const list = loadBFilters();
    if (!list.length) {
      host.appendChild(el("div", "bf-empty",
        "No saved filters yet.<br>Browse a table with a WHERE filter, then press ＋ above to keep it."));
      return;
    }
    list.forEach((f, i) => {
      const row = el("div", "bf-row");
      row.innerHTML =
        `<span class="bf-name">${esc(f.name)}</span>` +
        `<span class="bf-meta">${esc(f.table)}${f.where ? " · " + esc(f.where) : ""}</span>`;
      row.title = `${f.table}${f.where ? " WHERE " + f.where : ""}`;
      row.onclick = () => { setBrowsePanel("tables"); openBrowse(f.table, f.where); };
      row.oncontextmenu = (e) => {
        e.preventDefault();
        showCtxMenu(e.clientX, e.clientY, [
          { icon: "play", label: "Apply", onClick: row.onclick },
          { icon: "pencil", label: "Rename", onClick: () => {
              const nn = prompt("Filter name", f.name);
              if (!nn || !nn.trim()) return;
              list[i].name = nn.trim();
              saveBFilters(list);
            } },
          { sep: true },
          { icon: "trash", label: "Delete", danger: true, onClick: () => {
              list.splice(i, 1);
              saveBFilters(list);
            } },
        ]);
      };
      host.appendChild(row);
    });
  }
  $("#bfSave").onclick = () => {
    if (!browse.table) return toast("Browse a table first", "err");
    const body = el("div");
    body.innerHTML =
      `<div class="field"><label>Filter name</label>
         <input type="text" id="bfName" value="${esc(browse.table + (browse.where ? " — " + browse.where.slice(0, 30) : ""))}" /></div>
       <div class="field"><div class="hint">Saves <b>${esc(browse.table)}</b>${browse.where ? " WHERE <code>" + esc(browse.where) + "</code>" : " (no WHERE filter)"} — stored in this browser, per database.</div></div>`;
    const go = mkBtn("Save filter", "primary", () => {
      const name = body.querySelector("#bfName").value.trim();
      if (!name) return toast("Name required", "err");
      const list = loadBFilters();
      list.push({ name, table: browse.table, where: browse.where || "" });
      saveBFilters(list);
      closeModal();
      toast("Filter saved", "ok");
    });
    openModal("Save filter", body, [mkBtn("Cancel", "ghost", closeModal), go]);
    setTimeout(() => body.querySelector("#bfName").select(), 30);
  };

  async function reloadBrowse() {
    if (!browse.table) return;
    browse.data = null;
    renderBrowseMain();
    const r = await API.browse(state.db, browse.table, {
      limit: browse.limit, offset: browse.offset,
      order_by: browse.orderBy, order_dir: browse.orderDir,
      where: browse.where || undefined,
    });
    browse.data = r;
    renderBrowseMain();
  }

  function renderBrowseMain() {
    const main = $("#browseMain");
    main.innerHTML = "";
    if (!browse.table) {
      main.appendChild(el("div", "empty-state",
        `<div class="empty-emoji">▦</div><p>Pick a table on the left to browse and edit its rows. Right-click any cell for actions.</p>`));
      return;
    }
    const r = browse.data;
    if (!r) {
      const sk = el("div", "grid-wrap");
      sk.innerHTML = Array.from({ length: 12 })
        .map(() => `<div class="skeleton" style="height:30px;margin-bottom:6px">x</div>`).join("");
      main.appendChild(sk);
      return;
    }
    if (r.error) {
      const ebar = el("div", "where-bar active");
      ebar.innerHTML =
        `<span class="where-label">WHERE</span>` +
        `<input class="mini-input where-input" value="${esc(browse.where || "")}" aria-label="WHERE filter" />`;
      ebar.querySelector("input").onkeydown = (e) => {
        if (e.key === "Enter") {
          browse.where = e.target.value.trim();
          browse.offset = 0;
          reloadBrowse();
        }
      };
      main.appendChild(ebar);
      const card = el("div", "error-card");
      card.innerHTML = `<div class="error-head">⛔ Filter failed</div><div class="error-raw">${esc(r.error)}</div>` +
        (r.explanation ? `<div class="error-explain"><span class="bulb">💡</span><span>${esc(r.explanation)}</span></div>` : "");
      main.appendChild(card);
      return;
    }
    const start = r.offset + 1;
    const end = Math.min(r.offset + r.rows.length, r.total);
    const bar = el("div", "result-bar");
    bar.innerHTML =
      `<span class="stat"><b>${esc(browse.table)}</b></span>` +
      `<span class="stat">${r.total} rows · showing ${r.rows.length ? start : 0}–${end}</span>` +
      (r.has_rowid ? "" : `<span style="color:var(--yellow)">read-only (no rowid)</span>`) +
      `<span class="spacer"></span>`;
    bar.appendChild(mkBtn(ICON("plus") + "Add row", "ghost", () => addRowDialog()));
    bar.appendChild(mkBtn(ICON("upload") + "Import CSV", "ghost", () => importDialog(browse.table)));
    bar.appendChild(mkBtn(ICON("download") + "Export CSV", "ghost", () => {
      triggerDownload(API.exportUrl(state.db, { table: browse.table, ...csvUrlOpts() }), browse.table + ".csv");
    }));
    const pager = el("span", "pager");
    const prev = mkBtn(ICON("chevron-left") + "Prev", "ghost", () => {
      browse.offset = Math.max(0, browse.offset - browse.limit); reloadBrowse();
    });
    const next = mkBtn("Next" + ICON("chevron-right"), "ghost", () => {
      if (browse.offset + browse.limit < r.total) { browse.offset += browse.limit; reloadBrowse(); }
    });
    prev.disabled = browse.offset === 0;
    next.disabled = browse.offset + browse.limit >= r.total;
    pager.appendChild(prev); pager.appendChild(next); bar.appendChild(pager);
    main.appendChild(bar);

    // WHERE filter bar
    const wbar = el("div", "where-bar");
    wbar.innerHTML =
      `<span class="where-label">WHERE</span>` +
      `<input class="mini-input where-input" placeholder="price > 100 AND category = 'Audio'   (Enter to apply, empty to clear)"
              value="${esc(browse.where || "")}" aria-label="WHERE filter" />`;
    const winput = wbar.querySelector("input");
    winput.onkeydown = (e) => {
      if (e.key === "Enter") {
        browse.where = winput.value.trim();
        browse.offset = 0;
        reloadBrowse();
      }
    };
    if (browse.where) wbar.classList.add("active");
    main.appendChild(wbar);

    const gridWrap = el("div", "grid-wrap");
    gridWrap.appendChild(buildEditableTable());
    main.appendChild(gridWrap);
  }

  function buildEditableTable() {
    const r = browse.data;
    const editable = r.has_rowid;
    const table = el("table", "grid");
    const thead = el("thead");
    const htr = el("tr");
    if (editable) htr.appendChild(el("th", "rowtools", ""));
    htr.appendChild(el("th", "rownum", "#"));
    r.columns.forEach((c) => {
      const th = el("th");
      th.innerHTML =
        esc(c.name) +
        (c.pk ? ` <span class="pk-badge">PK</span>` : "") +
        `<span class="th-type">${esc(c.type)}</span>`;
      th.title = "Click to sort";
      th.onclick = () => {
        if (browse.orderBy === c.name)
          browse.orderDir = browse.orderDir === "ASC" ? "DESC" : "ASC";
        else { browse.orderBy = c.name; browse.orderDir = "ASC"; }
        browse.offset = 0;
        reloadBrowse();
      };
      if (browse.orderBy === c.name) th.innerHTML += browse.orderDir === "ASC" ? " ▲" : " ▼";
      th.oncontextmenu = (ev) => headerContextMenu(ev, c);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = el("tbody");
    r.rows.forEach((row, i) => {
      const tr = el("tr");
      const rowid = row.__rowid__;
      if (editable) {
        const tools = el("td", "rowtools");
        const del = el("span", "row-del", ICON("trash"));
        del.title = "Delete row";
        del.onclick = () => deleteBrowseRow(rowid);
        tools.appendChild(del);
        tr.appendChild(tools);
      }
      tr.appendChild(el("td", "rownum", r.offset + i + 1));
      r.columns.forEach((c) => {
        const td = cellTd(row[c.name]);
        if (editable && !isBlob(row[c.name])) {
          td.classList.add("editable");
          td.ondblclick = () => beginEdit(td, rowid, c.name, row[c.name]);
        }
        td.oncontextmenu = (e) => cellContextMenu(e, { row, rowid, col: c.name, value: row[c.name], editable });
        tr.appendChild(td);
      });
      tr.onclick = () => {
        const obj = {};
        r.columns.forEach((c) => (obj[c.name] = row[c.name]));
        showRecord(obj, tr, browse.table);
      };
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function beginEdit(td, rowid, col, oldVal) {
    if (td.classList.contains("editing")) return;
    td.classList.add("editing");
    const input = el("input", "cell-edit");
    input.type = "text";
    input.value = oldVal === null || oldVal === undefined ? "" : String(oldVal);
    td.textContent = "";
    td.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      const changes = {};
      changes[col] = input.value === "" ? null : input.value;
      const res = await API.updateRow(state.db, browse.table, { __rowid__: rowid }, changes);
      if (res.error) toast(res.error, "err"); else toast("Saved", "ok");
      reloadBrowse();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      td.classList.remove("editing");
      td.textContent = oldVal === null ? "NULL" : String(oldVal);
      if (oldVal === null) td.className = "null editable";
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    };
    input.onblur = commit;
  }

  async function deleteBrowseRow(rowid) {
    if (!confirm("Delete this row?")) return;
    const res = await API.deleteRow(state.db, browse.table, { __rowid__: rowid });
    if (res.error) return toast(res.error, "err");
    toast("Row deleted", "ok");
    reloadBrowse();
    refreshSchema();
  }

  async function setCellValue(rowid, col, value) {
    const changes = {}; changes[col] = value;
    const res = await API.updateRow(state.db, browse.table, { __rowid__: rowid }, changes);
    if (res.error) return toast(res.error, "err");
    toast(value === null ? "Set to NULL" : "Pasted", "ok");
    reloadBrowse();
  }

  async function cloneBrowseRow(row) {
    const cols = browse.data.columns;
    const values = {};
    cols.forEach((c) => {
      if (c.pk) return;                       // let the PK regenerate
      const v = row[c.name];
      if (v !== null && v !== undefined) values[c.name] = v;
    });
    const res = await API.insertRow(state.db, browse.table, values);
    if (res.error) return toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
    toast("Row cloned", "ok");
    reloadBrowse();
    refreshSchema();
  }

  function addRowDialog() {
    const cols = browse.data.columns;
    const body = el("div");
    cols.forEach((c) => {
      const f = el("div", "field");
      f.innerHTML =
        `<label>${esc(c.name)} <span style="color:var(--text-faint)">${esc(c.type)}${c.pk ? " · PK" : ""}${c.notnull ? " · NOT NULL" : ""}</span></label>
         <input type="text" data-col="${esc(c.name)}" placeholder="${c.pk ? "auto" : "NULL"}" />`;
      body.appendChild(f);
    });
    const save = mkBtn("Insert", "primary", async () => {
      const values = {};
      $$("[data-col]", body).forEach((inp) => { if (inp.value !== "") values[inp.dataset.col] = inp.value; });
      const res = await API.insertRow(state.db, browse.table, values);
      if (res.error) return toast(res.error, "err");
      closeModal();
      toast("Row inserted", "ok");
      browse.offset = 0;
      reloadBrowse();
      refreshSchema();
    });
    openModal(`Add row to ${browse.table}`, body, [mkBtn("Cancel", "ghost", closeModal), save]);
  }

  // ---- right-click cell context menu ----
  function headerContextMenu(e, c) {
    e.preventDefault();
    const sort = (dir) => () => {
      browse.orderBy = c.name; browse.orderDir = dir; browse.offset = 0;
      reloadBrowse();
    };
    const items = [
      { icon: "arrow-up", label: "Sort ascending", onClick: sort("ASC") },
      { icon: "arrow-down", label: "Sort descending", onClick: sort("DESC") },
      { sep: true },
      { icon: "filter", label: "Filter on this column", onClick: () => {
          const inp = $("#browseMain .where-input");
          if (!inp) return;
          inp.value = (inp.value.trim() ? inp.value.trim() + " AND " : "") +
            `${quoteIfNeeded(c.name)} = `;
          inp.focus();
          inp.setSelectionRange(inp.value.length, inp.value.length);
        } },
      { icon: "copy", label: "Copy column name", onClick: async () => {
          try { await navigator.clipboard.writeText(c.name); toast("Copied", "ok"); }
          catch (_) { toast("Clipboard blocked by browser", "err"); }
        } },
    ];
    // FK column: open the referenced table (whole table, no WHERE filter)
    const fk = browse.fks.find((f) => f.from === c.name);
    if (fk) {
      items.push({ sep: true });
      items.push({ icon: "arrow-right", label: `Go to ${fk.table}`,
        onClick: () => openBrowse(fk.table) });
    }
    showCtxMenu(e.clientX, e.clientY, items);
  }

  async function cellContextMenu(e, ctx) {
    e.preventDefault();
    const items = [];
    // FK navigation: jump to the referenced row
    const fk = browse.fks.find((f) => f.from === ctx.col);
    if (fk && ctx.value !== null && !isBlob(ctx.value)) {
      const lit = typeof ctx.value === "number"
        ? String(ctx.value)
        : "'" + String(ctx.value).replace(/'/g, "''") + "'";
      items.push({
        icon: "arrow-right",
        label: `Go to ${fk.table}.${fk.to} = ${String(ctx.value).slice(0, 20)}`,
        onClick: () => openBrowse(fk.table, `${quoteIfNeeded(fk.to)} = ${lit}`),
      });
      items.push({ sep: true });
    }
    if (ctx.editable) {
      items.push({ icon: "slash", label: "Set NULL", disabled: ctx.value === null,
        onClick: () => setCellValue(ctx.rowid, ctx.col, null) });
      items.push({ sep: true });
    }
    items.push({ icon: "copy", label: "Copy", onClick: async () => {
      try { await navigator.clipboard.writeText(ctx.value === null ? "" : String(ctx.value)); toast("Copied", "ok"); }
      catch (_) { toast("Clipboard blocked by browser", "err"); }
    }});
    if (ctx.editable) {
      items.push({ icon: "paste", label: "Paste", onClick: async () => {
        try { const t = await navigator.clipboard.readText(); setCellValue(ctx.rowid, ctx.col, t); }
        catch (_) { toast("Clipboard blocked by browser", "err"); }
      }});
      items.push({ sep: true });
      items.push({ icon: "plus", label: "Add row", onClick: () => addRowDialog() });
      items.push({ icon: "clone", label: "Clone row", onClick: () => cloneBrowseRow(ctx.row) });
      items.push({ icon: "trash", label: "Delete row", danger: true, onClick: () => deleteBrowseRow(ctx.rowid) });
    }
    showCtxMenu(e.clientX, e.clientY, items);
  }

  // ============================================================ CSV IMPORT
  function importDialog(presetTable) {
    const body = el("div");
    body.innerHTML =
      `<div class="field">
         <label>Target table</label>
         <input type="text" id="impTable" value="${esc(presetTable || "")}" placeholder="table_name" />
       </div>
       <div class="checkrow"><input type="checkbox" id="impHeader" checked /> First row is a header</div>
       <div class="checkrow"><input type="checkbox" id="impCreate" /> Create table if it doesn't exist (all TEXT)</div>
       <div class="checkrow"><input type="checkbox" id="impReplace" /> Replace existing rows first</div>
       <div class="field">
         <label>Paste CSV, or choose a file</label>
         <input type="file" id="impFile" accept=".csv,text/csv" />
         <textarea id="impText" placeholder="id,name,age&#10;1,Alice,30"></textarea>
       </div>`;
    const fileInput = body.querySelector("#impFile");
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => (body.querySelector("#impText").value = reader.result);
      reader.readAsText(f);
    };
    const run = mkBtn("Import", "primary", async () => {
      const payload = {
        db: state.db,
        table: body.querySelector("#impTable").value.trim(),
        csv: body.querySelector("#impText").value,
        has_header: body.querySelector("#impHeader").checked,
        create_table: body.querySelector("#impCreate").checked,
        mode: body.querySelector("#impReplace").checked ? "replace" : "append",
      };
      if (!payload.table) return toast("Target table required", "err");
      if (!payload.csv.trim()) return toast("No CSV provided", "err");
      const res = await API.importCsv(payload);
      if (res.error) return toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      closeModal();
      toast(`Imported ${res.inserted} rows into ${res.table}`, "ok");
      await refreshSchema();
      if (!$("#browseView").hidden && browse.table === res.table) { browse.offset = 0; reloadBrowse(); }
    });
    openModal("Import CSV", body, [mkBtn("Cancel", "ghost", closeModal), run]);
  }

  // ============================================================ RAIL & SIDEBAR
  function setBrowsePanel(p) {
    state.browsePanel = p;
    $$(".browse-side .side-sub-panel").forEach((n) => (n.hidden = n.dataset.bs !== p));
    if (p === "filters") renderBrowseFilters();
    updateRail();
  }
  function railSelect(target) {
    if (target === "browse" || target === "bfilters") {
      setBrowsePanel(target === "bfilters" ? "filters" : "tables");
      if ($("#browseView").hidden) openBrowse();
      return;
    }
    if (target === "diagram" || target === "dlayouts" || target === "dnotes") {
      state.diagramPanel =
        target === "dlayouts" ? "layouts" : target === "dnotes" ? "notes" : "tables";
      setView("diagram");
      ERD.setSidePanel(state.diagramPanel);
      return;
    }
    // everything else lives in the editor view's sidebar
    const panel = target === "editor" ? "schema" : target;
    state.sidePanel = panel;
    setView("editor");
    $$(".side-panel").forEach((p) =>
      p.classList.toggle("active", p.dataset.side === panel));
    if (panel === "history") loadHistory();
    if (panel === "snippets") loadSnippets();
    if (panel === "syntax") Syntax.ensure(window.SLApp);
    if (panel === "files") loadFiles();
    updateRail();
  }
  function updateRail() {
    $$(".rail-btn[data-rail]").forEach((b) => {
      const r = b.dataset.rail;
      // the tab button stays highlighted; the active sub-button is filled (CSS)
      const active =
        state.view === "browse"
          ? r === "browse" || (r === "bfilters" && state.browsePanel === "filters")
        : state.view === "diagram"
          ? r === "diagram" ||
            (r === "dlayouts" && state.diagramPanel === "layouts") ||
            (r === "dnotes" && state.diagramPanel === "notes")
        : r === "editor" || r === state.sidePanel;
      b.classList.toggle("active", active);
    });
  }
  $$(".rail-btn[data-rail]").forEach((b) => (b.onclick = () => railSelect(b.dataset.rail)));

  // collapsible PINNED / ENTITIES sections
  $$(".side-section-head").forEach((head) => {
    head.onclick = () => head.parentElement.classList.toggle("collapsed");
  });

  // ============================================================ ACCESSIBILITY
  // toasts announce to screen readers
  $("#toast").setAttribute("role", "status");
  $("#toast").setAttribute("aria-live", "polite");
  // icon-only buttons: mirror title -> aria-label (incl. dynamically added ones)
  function labelButtons(root) {
    $$("button[title]:not([aria-label])", root).forEach((b) =>
      b.setAttribute("aria-label", b.title));
  }
  labelButtons(document);
  new MutationObserver(() => labelButtons(document))
    .observe(document.body, { childList: true, subtree: true });

  // arrow-key navigation in data grids (focus a grid area, then ↑/↓ select)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    const grid = document.activeElement.closest?.(".grid-wrap") ||
      (!$("#browseView").hidden ? $("#browseMain .grid-wrap") : $("#resultsBody .grid-wrap"));
    if (!grid) return;
    const rows = $$("tbody tr", grid);
    if (!rows.length) return;
    e.preventDefault();
    let i = rows.findIndex((r) => r.classList.contains("row-selected"));
    i = e.key === "ArrowDown" ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0);
    rows[i].click();
    rows[i].scrollIntoView({ block: "nearest" });
  });

  // ============================================================ VIEW UTILITIES
  let appZoom = parseFloat(localStorage.getItem("sl.zoom") || "1");
  function setZoom(z) {
    appZoom = Math.min(1.6, Math.max(0.6, Math.round(z * 10) / 10));
    document.body.style.zoom = appZoom;
    localStorage.setItem("sl.zoom", appZoom);
  }
  let editorFs = parseFloat(localStorage.getItem("sl.editorFs") || "13.5");
  function setEditorFs(px) {
    editorFs = Math.min(22, Math.max(10, px));
    document.documentElement.style.setProperty("--editor-fs", editorFs + "px");
    localStorage.setItem("sl.editorFs", editorFs);
    if (editor) editor.render();
  }
  function toggleSidebar() {
    const side = state.view === "browse" ? $(".browse-side")
      : state.view === "diagram" ? $(".diagram-side") : $("#sidebar");
    side.hidden = !side.hidden;
  }
  function toggleRail() {
    const rail = $(".rail");
    rail.hidden = !rail.hidden;
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }

  // ============================================================ RECORD / ROW VIEWER
  function toggleJsonPanel(force) {
    const p = $("#jsonPanel");
    p.hidden = force !== undefined ? !force : !p.hidden;
    $("#btnToggleJson").classList.toggle("active", !p.hidden);
  }
  $("#btnToggleJson").onclick = () => toggleJsonPanel();
  $("#jsonClose").onclick = () => toggleJsonPanel(false);
  $("#btnTogglePanel").onclick = toggleSidebar;
  $$("#recModes .rec-mode").forEach((b) => (b.onclick = () => {
    record.mode = b.dataset.recmode;
    localStorage.setItem("sl.recmode", record.mode);
    renderRecord();
  }));

  function jsonHtml(obj) {
    const s = esc(JSON.stringify(obj, null, 2));
    return s.replace(
      /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b)|\b(null|true|false)\b/g,
      (m, str, colon, num, kw) => {
        if (str) return colon
          ? `<span class="json-key">${str}</span>${colon}`
          : `<span class="json-str">${str}</span>`;
        if (num) return `<span class="json-num">${num}</span>`;
        return `<span class="json-null">${kw}</span>`;
      });
  }
  // the right-side panel: a clicked row as a card + its FK-related rows.
  // `table` is the row's source table (known in Browse, and in single-table
  // result grids); without it we still show the card + JSON, just no relations.
  const record = { obj: null, table: null, mode: localStorage.getItem("sl.recmode") || "card" };
  const REL_LIMIT = 6;
  const recLit = (v) => (typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");

  let relCache = { db: null, dia: null, sch: {} };
  function invalidateRelCache() { relCache = { db: null, dia: null, sch: {} }; }
  function relCacheFor() {
    if (relCache.db !== state.db) relCache = { db: state.db, dia: null, sch: {} };
    return relCache;
  }
  async function relSchema(table) {
    const c = relCacheFor();
    if (!c.sch[table]) c.sch[table] = await API.schema(state.db, table);
    return c.sch[table];
  }
  async function relDiagram() {
    const c = relCacheFor();
    if (!c.dia) c.dia = await API.diagram(state.db);
    return c.dia;
  }

  function showRecord(obj, tr, table) {
    record.obj = obj;
    record.table = table || null;
    if (tr) {
      [...tr.parentElement.children].forEach((s) => s.classList.remove("row-selected"));
      tr.classList.add("row-selected");
    }
    toggleJsonPanel(true);
    renderRecord();
  }

  function renderRecord() {
    const body = $("#recBody"), title = $("#recTitle");
    $$("#recModes .rec-mode").forEach((b) => b.classList.toggle("active", b.dataset.recmode === record.mode));
    if (!record.obj) {
      body.innerHTML = `<div class="rec-empty">Click a row in a result grid or the Browse view to inspect it and follow its foreign-key relations.</div>`;
      title.textContent = "Row";
      return;
    }
    title.textContent = record.table || "Row";
    if (record.mode === "json") {
      body.innerHTML = `<pre class="json-body">${jsonHtml(record.obj)}</pre>`;
      return;
    }
    renderRecordCard(body);
  }

  function renderRecordCard(body) {
    const obj = record.obj;
    body.innerHTML = "";
    const card = el("div", "rec-card");
    const fields = el("div", "rec-section");
    card._fieldByCol = {};
    Object.keys(obj).forEach((k) => {
      if (k === "__rowid__") return;
      const f = el("div", "rec-field");
      f.appendChild(el("span", "rec-k", esc(k)));
      const v = obj[k];
      const vEl = el("span", "rec-v");
      if (v === null || v === undefined) { vEl.className = "rec-v rec-null"; vEl.textContent = S.nullDisplay; }
      else if (isBlob(v)) vEl.textContent = `BLOB · ${v.size} B`;
      else vEl.textContent = String(v);
      f.appendChild(vEl);
      const slot = el("span", "rec-fk-slot");
      f.appendChild(slot);
      card._fieldByCol[k] = slot;
      fields.appendChild(f);
    });
    card.appendChild(fields);
    body.appendChild(card);
    if (record.table) loadRelations(card, obj);
  }

  async function loadRelations(card, obj) {
    let sch, dia;
    try { [sch, dia] = await Promise.all([relSchema(record.table), relDiagram()]); }
    catch (_) { return; }
    if (record.obj !== obj) return; // a newer row was clicked mid-fetch

    // outgoing FKs: this row -> one parent row each
    const out = (sch.foreign_keys || []).filter((fk) => obj[fk.from] != null);
    if (out.length) {
      const sec = el("div", "rec-section");
      sec.appendChild(el("div", "rec-sec-head", "References"));
      for (const fk of out) {
        let pr = null, cols = null;
        try {
          const r = await API.browse(state.db, fk.table,
            { where: `${quoteIfNeeded(fk.to)} = ${recLit(obj[fk.from])}`, limit: 1 });
          if (record.obj !== obj) return;
          pr = r && r.rows && r.rows[0]; cols = r && r.columns;
        } catch (_) {}
        const grp = el("div", "rec-rel-group");
        grp.appendChild(el("div", "rec-rel-head", `${esc(fk.from)} → ${esc(fk.table)}`));
        if (pr) {
          const row = relRow(fk.table, pr, cols);
          grp.appendChild(row);
          const slot = card._fieldByCol[fk.from];
          if (slot) {
            const go = el("span", "rec-fk-go", ICON("arrow-right"));
            go.title = `Go to ${fk.table}`;
            go.onclick = () => row.onclick();
            slot.appendChild(go);
          }
        } else {
          grp.appendChild(el("div", "rec-rel-empty", "— not found"));
        }
        sec.appendChild(grp);
      }
      card.appendChild(sec);
    }

    // incoming FKs: child rows -> this row
    const inc = [];
    (dia.tables || []).forEach((t) => (t.foreign_keys || []).forEach((fk) => {
      if (fk.table === record.table) inc.push({ child: t.name, fk });
    }));
    if (inc.length) {
      const sec = el("div", "rec-section");
      sec.appendChild(el("div", "rec-sec-head", "Related"));
      for (const { child, fk } of inc) {
        const val = obj[fk.to];
        if (val == null) continue;
        const where = `${quoteIfNeeded(fk.from)} = ${recLit(val)}`;
        let rows = [], cols = null, total = 0;
        try {
          const r = await API.browse(state.db, child, { where, limit: REL_LIMIT });
          if (record.obj !== obj) return;
          rows = (r && r.rows) || []; cols = r && r.columns; total = r ? r.total : rows.length;
        } catch (_) {}
        const grp = el("div", "rec-rel-group");
        grp.appendChild(el("div", "rec-rel-head", `${esc(child)} · ${esc(fk.from)} (${total})`));
        rows.forEach((cr) => grp.appendChild(relRow(child, cr, cols)));
        if (!rows.length) grp.appendChild(el("div", "rec-rel-empty", "— none"));
        if (total > rows.length) {
          const more = el("div", "rec-more", `+ ${total - rows.length} more — open in Browse`);
          more.onclick = () => openBrowse(child, where);
          grp.appendChild(more);
        }
        sec.appendChild(grp);
      }
      card.appendChild(sec);
    }
  }

  function relRow(table, rowObj, columns) {
    const names = (columns ? columns.map((c) => c.name) : Object.keys(rowObj))
      .filter((c) => c !== "__rowid__");
    const parts = names.slice(0, 3).map((c) => {
      const v = rowObj[c];
      return v == null ? "∅" : (isBlob(v) ? "BLOB" : String(v));
    });
    const d = el("div", "rec-rel-row");
    d.innerHTML = `<span class="rec-rel-label">${esc(parts.join("  ·  "))}</span>` + ICON("arrow-right");
    d.title = "Open this record";
    d.onclick = () => {
      const o = {};
      names.forEach((c) => (o[c] = rowObj[c]));
      showRecord(o, null, table);
    };
    return d;
  }

  // ============================================================ DB TOOLS / ATTACH / IMPORT SQL
  function importSqlDialog() {
    const body = el("div");
    body.innerHTML =
      `<div class="field">
         <label>SQL file (or paste below)</label>
         <input type="file" id="sqlFile" accept=".sql,text/plain" />
         <textarea id="sqlText" placeholder="CREATE TABLE …; INSERT INTO …;"></textarea>
         <div class="hint">Runs the whole script against <b>${esc(state.db)}</b>. Auto-backup applies if enabled.</div>
       </div>`;
    const fileInput = body.querySelector("#sqlFile");
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => (body.querySelector("#sqlText").value = reader.result);
      reader.readAsText(f);
    };
    const run = mkBtn("Import", "primary", async () => {
      const sql = body.querySelector("#sqlText").value;
      if (!sql.trim()) return toast("No SQL provided", "err");
      if (S.readOnly) return toast("Read-only mode is on (see Settings).", "err");
      const res = await API.importSql({ db: state.db, sql, backup: S.autoBackup });
      if (res.error) return toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      closeModal();
      toast("SQL imported", "ok");
      refreshSchema();
    });
    openModal("Import SQL", body, [mkBtn("Cancel", "ghost", closeModal), run]);
  }

  function importJsonDialog() {
    const body = el("div");
    body.innerHTML =
      `<div class="field">
         <label>JSON file (or paste below) — an array of objects</label>
         <input type="file" id="jsonFile" accept=".json,application/json" />
         <textarea id="jsonText" placeholder='[{"name": "Ada", "age": 36}, {"name": "Bob"}]'></textarea>
       </div>
       <div class="field"><label>Target table</label>
         <input type="text" id="jsonTable" placeholder="people" /></div>
       <label class="checkrow"><input type="checkbox" id="jsonCreate" checked /> Create the table if it doesn't exist (column types inferred)</label>
       <label class="checkrow"><input type="checkbox" id="jsonReplace" /> Replace existing rows (instead of appending)</label>
       <div class="field"><div class="hint">Nested objects/arrays are stored as JSON text. Keys that don't match a column are skipped.</div></div>`;
    const fileInput = body.querySelector("#jsonFile");
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => (body.querySelector("#jsonText").value = reader.result);
      reader.readAsText(f);
      if (!body.querySelector("#jsonTable").value)
        body.querySelector("#jsonTable").value = f.name.replace(/\.json$/i, "").replace(/[^\w]/g, "_");
    };
    const run = mkBtn("Import", "primary", async () => {
      const res = await API.importJson({
        db: state.db,
        table: body.querySelector("#jsonTable").value.trim(),
        json: body.querySelector("#jsonText").value,
        create: body.querySelector("#jsonCreate").checked,
        mode: body.querySelector("#jsonReplace").checked ? "replace" : "append",
        backup: S.autoBackup,
      });
      if (res.error) return toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      closeModal();
      toast(`Imported ${res.inserted} rows into ${res.table}`, "ok");
      await refreshSchema();
      if (!$("#browseView").hidden && browse.table === res.table) reloadBrowse();
    });
    openModal("Import JSON", body, [mkBtn("Cancel", "ghost", closeModal), run]);
  }

  // ---- Database settings (PRAGMA) ----
  async function pragmaDialog() {
    const p = await API.pragma(state.db);
    if (p.error) return toast(p.error, "err");
    const body = el("div");
    const row = (label, node, hint) => {
      const r = el("div", "set-row");
      r.appendChild(el("span", "set-label",
        esc(label) + (hint ? `<div class="set-hint">${esc(hint)}</div>` : "")));
      r.appendChild(node);
      body.appendChild(r);
    };
    // foreign_keys — per-db preference, applied on every connection
    const fkWrap = el("label", "switch",
      `<input type="checkbox" ${p.foreign_keys ? "checked" : ""} /><span class="knob"></span>`);
    fkWrap.querySelector("input").onchange = async (e) => {
      const r = await API.setPragma({ db: state.db, name: "foreign_keys", value: e.target.checked });
      if (r.error) return toast(r.error, "err");
      toast("Foreign key enforcement " + (e.target.checked ? "ON" : "OFF"), "ok");
    };
    row("Enforce foreign keys", fkWrap,
      "OFF means FK constraints are ignored — orphan rows allowed");
    row("Journal mode", mkSelect(
      [["delete", "delete (classic)"], ["wal", "wal (faster, reads during writes)"],
       ["truncate"], ["persist"], ["memory"]],
      String(p.journal_mode).toLowerCase(), async (v) => {
        const r = await API.setPragma({ db: state.db, name: "journal_mode", value: v });
        if (r.error) return toast(r.error, "err");
        toast("Journal mode: " + r.value, "ok");
      }, "set-select"), "how SQLite stays crash-safe");
    row("Auto vacuum", mkSelect(
      [[0, "none"], [1, "full"], [2, "incremental"]],
      p.auto_vacuum, async (v) => {
        const r = await API.setPragma({ db: state.db, name: "auto_vacuum", value: v });
        if (r.error) return toast(r.error, "err");
        toast("Auto vacuum set (VACUUM ran to apply it)", "ok");
      }, "set-select"), "whether the file shrinks when rows are deleted");
    const uv = el("input", "mini-input");
    uv.type = "number"; uv.value = p.user_version; uv.style.width = "120px";
    uv.onchange = async () => {
      const r = await API.setPragma({ db: state.db, name: "user_version", value: parseInt(uv.value || "0", 10) });
      if (r.error) return toast(r.error, "err");
      toast("user_version = " + r.value, "ok");
    };
    row("User version", uv, "free integer apps use to track schema migrations");
    row("Page size", el("span", "set-static", esc(String(p.page_size)) + " bytes"), "");
    row("Encoding", el("span", "set-static", esc(String(p.encoding))), "");
    body.appendChild(el("div", "hint",
      "Settings apply to <b>" + esc(state.db) + "</b>. Foreign-key enforcement is stored " +
      "as a SequenceLab preference (SQLite forgets it per connection); the rest live in the file itself."));
    openModal("Database settings", body, [mkBtn("Close", "primary", closeModal)]);
  }

  // ---- global search: every column of every table ----
  function searchDialog() {
    const body = el("div");
    body.innerHTML =
      `<div class="field">
         <input type="text" id="gsInput" class="gs-input" placeholder="Search every column of every table in ${esc(state.db)}…" />
       </div>
       <div id="gsResults" class="gs-results"><div class="hint">Type at least 2 characters, then Enter.</div></div>`;
    const input = body.querySelector("#gsInput");
    const out = body.querySelector("#gsResults");
    let timer = null;
    async function run() {
      const q = input.value.trim();
      if (q.length < 2) return;
      out.innerHTML = `<div class="hint">Searching…</div>`;
      const r = await API.search(state.db, q);
      if (r.error) { out.innerHTML = `<div class="hint">${esc(r.error)}</div>`; return; }
      out.innerHTML = "";
      if (!r.results.length) {
        out.appendChild(el("div", "hint", `No match for “${esc(q)}” anywhere in ${esc(state.db)}.`));
        return;
      }
      let lastTable = null;
      r.results.forEach((hit) => {
        if (hit.table !== lastTable) {
          out.appendChild(el("div", "gs-table", esc(hit.table)));
          lastTable = hit.table;
        }
        const rowEl = el("div", "gs-hit");
        rowEl.innerHTML =
          `<span class="gs-col">${esc(hit.column)}</span>` +
          `<span class="gs-val">${esc(hit.value)}</span>`;
        rowEl.onclick = () => {
          closeModal();
          const lit = q.replace(/'/g, "''");
          openBrowse(hit.table, `CAST(${quoteIfNeeded(hit.column)} AS TEXT) LIKE '%${lit}%'`);
        };
        out.appendChild(rowEl);
      });
      if (r.truncated)
        out.appendChild(el("div", "hint", "More matches exist — refine the search."));
    }
    input.onkeydown = (e) => { if (e.key === "Enter") run(); };
    input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 350); };
    openModal("Search database", body, [mkBtn("Close", "ghost", closeModal)]);
    setTimeout(() => input.focus(), 30);
  }

  function attachDialog() {
    const body = el("div");
    body.innerHTML =
      `<div id="attachList"></div>
       <div class="field"><label>Stored database to attach</label><span id="atPick"></span></div>
       <div class="field"><label>Alias</label>
         <input type="text" id="atAlias" placeholder="other" />
         <div class="hint">Query it as <code>alias.table</code> in the editor. Attachments apply to queries on <b>${esc(state.db)}</b>.</div>
       </div>`;
    const others = state.databases.filter((d) => d.token !== state.db);
    const atSel = mkSelect(
      others.length ? others.map((d) => [d.token]) : [["", "no other database stored"]],
      others.length ? others[0].token : "", null, "set-select");
    body.querySelector("#atPick").appendChild(atSel);
    async function refreshList() {
      const r = await API.attachments(state.db);
      const list = body.querySelector("#attachList");
      list.innerHTML = "";
      (r.attachments || []).forEach((a) => {
        const row = el("div", "set-row");
        row.innerHTML = `<span class="set-label"><b>${esc(a.alias)}</b> · <span style="color:var(--faint)">${esc(a.path)}</span></span>`;
        row.appendChild(mkBtn("Detach", "danger", async () => {
          await API.removeAttachment(state.db, a.alias);
          refreshList();
        }));
        list.appendChild(row);
      });
      if (!(r.attachments || []).length)
        list.appendChild(el("div", "hint", "No databases attached."));
    }
    refreshList();
    const add = mkBtn("Attach", "primary", async () => {
      const res = await API.addAttachment({
        db: state.db,
        path: atSel.getValue(),
        alias: body.querySelector("#atAlias").value.trim(),
      });
      if (res.error) return toast(res.error, "err");
      toast(`Attached as ${res.alias}`, "ok");
      body.querySelector("#atAlias").value = "";
      refreshList();
    });
    openModal("Attach database", body, [mkBtn("Close", "ghost", closeModal), add]);
  }

  function dbToolsDialog() {
    const body = el("div");
    body.innerHTML =
      `<div class="set-section" style="margin-top:0;border-top:none;padding-top:0">Maintenance</div>
       <div class="set-row"><span class="set-label">Rebuild the file, reclaim free space</span><button class="btn ghost" id="dtVacuum">VACUUM</button></div>
       <div class="set-row"><span class="set-label">Check database integrity</span><button class="btn ghost" id="dtCheck">Check</button></div>
       <div id="dtOut" class="hint" style="margin:4px 0 8px"></div>
       <div class="set-section">Backups</div>
       <div id="dtBackups"></div>`;
    const out = body.querySelector("#dtOut");
    body.querySelector("#dtVacuum").onclick = async () => {
      if (S.readOnly) return toast("Read-only mode is on (see Settings).", "err");
      out.textContent = "Vacuuming…";
      const r = await API.query(state.db, "VACUUM;", false);
      out.textContent = r.error ? "VACUUM failed: " + r.error : "VACUUM done.";
      loadDatabases(state.db);
    };
    body.querySelector("#dtCheck").onclick = async () => {
      out.textContent = "Checking…";
      const r = await API.query(state.db, "PRAGMA integrity_check;", false);
      const v = r.results && r.results[0] && r.results[0].rows.map((x) => x[0]).join("; ");
      out.textContent = r.error ? "Check failed: " + r.error : "integrity_check → " + v;
    };
    async function refreshBackups() {
      const r = await API.backups(state.db);
      const list = body.querySelector("#dtBackups");
      list.innerHTML = "";
      (r.backups || []).forEach((b) => {
        const row = el("div", "set-row");
        row.innerHTML =
          `<span class="set-label"><span style="font-family:var(--mono)">${esc(b.name)}</span>
           <span style="color:var(--faint)"> · ${(b.size / 1024).toFixed(1)} KB · ${esc(b.mtime.replace("T", " "))}</span></span>`;
        row.appendChild(mkBtn("Restore", "ghost", async () => {
          if (!confirm(`Replace ${state.db} with this backup?\n(The current state is backed up first.)`)) return;
          const res = await API.restoreBackup(state.db, b.name);
          if (res.error) return toast(res.error, "err");
          toast("Backup restored", "ok");
          closeModal();
          await loadDatabases(state.db);
        }));
        row.appendChild(mkBtn("Delete", "danger", async () => {
          await API.deleteBackup(state.db, b.name);
          refreshBackups();
        }));
        list.appendChild(row);
      });
      if (!(r.backups || []).length)
        list.appendChild(el("div", "hint",
          "No backups yet. Enable auto-backup in Settings, or they appear after destructive operations."));
    }
    refreshBackups();
    openModal(`Database tools — ${state.db}`, body, [mkBtn("Close", "primary", closeModal)]);
  }

  // ============================================================ COMMAND PALETTE
  function openPalette() {
    const body = el("div");
    body.innerHTML =
      `<input type="text" id="palInput" class="mini-input" placeholder="Type a table, snippet or action…"
              style="width:100%;padding:10px 12px;font-size:13.5px" autocomplete="off" />
       <div id="palList" class="pal-list"></div>`;
    const entries = [];
    state.tables.forEach((t) => entries.push({
      label: t.name, kind: "table", onClick: () => openBrowse(t.name) }));
    (state.snippetCache || []).forEach((s) => entries.push({
      label: s.title, kind: "snippet",
      onClick: () => { railSelect("editor"); editor.setValue(""); insertSnippetText(s.sql); } }));
    [["Run query", () => runQuery(false)],
     ["New query tab", addQueryTab],
     ["Format SQL", () => editor.format()],
     ["Editor view", () => railSelect("editor")],
     ["Browse view", () => railSelect("browse")],
     ["Diagram view", () => railSelect("diagram")],
     ["Settings", openSettings],
     ["Database tools", dbToolsDialog],
     ["Database settings (PRAGMA)", pragmaDialog],
     ["Search database", searchDialog],
     ["Import JSON", importJsonDialog],
     ["Explain query plan", explainPlan],
     ["Find & replace", openFindBar],
     ["Toggle privacy mode", () => document.body.classList.toggle("privacy")],
    ].forEach(([label, fn]) => entries.push({ label, kind: "action", onClick: fn }));

    let filtered = entries, active = 0;
    const list = body.querySelector("#palList");
    const input = body.querySelector("#palInput");
    function renderList() {
      list.innerHTML = "";
      filtered.slice(0, 12).forEach((it, i) => {
        const row = el("div", "pal-item" + (i === active ? " active" : ""));
        row.innerHTML = `<span>${esc(it.label)}</span><span class="ac-kind">${it.kind}</span>`;
        row.onclick = () => { closeModal(); it.onClick(); };
        list.appendChild(row);
      });
      if (!filtered.length) list.appendChild(el("div", "hint", "No match."));
    }
    input.oninput = () => {
      const q = input.value.toLowerCase();
      filtered = entries.filter((it) => it.label.toLowerCase().includes(q));
      active = 0;
      renderList();
    };
    input.onkeydown = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, Math.min(filtered.length, 12) - 1); renderList(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); renderList(); }
      else if (e.key === "Enter" && filtered[active]) { closeModal(); filtered[active].onClick(); }
    };
    renderList();
    openModal("Go to…", body, []);
    setTimeout(() => input.focus(), 30);
  }

  // ============================================================ MENU BAR
  const MENUS = {
    file: () => [
      { icon: "plus", label: "New database…", onClick: newDbDialog },
      { icon: "folder", label: "Open database file…", onClick: openDbDialog },
      { icon: "x", label: "Close database…", onClick: () => closeDbAction() },
      { icon: "reset", label: "Reset example database", onClick: resetExampleAction },
      { sep: true },
      { icon: "terminal", label: "New query tab", onClick: addQueryTab },
      { icon: "save", label: "Save as snippet…", keys: "Ctrl S", onClick: () => snippetDialog(null) },
      { sep: true },
      { icon: "upload", label: "Import CSV…", onClick: () => importDialog(browse.table || "") },
      { icon: "upload", label: "Import JSON…", onClick: importJsonDialog },
      { icon: "upload", label: "Import SQL file…", onClick: importSqlDialog },
      { icon: "download", label: "Export database as SQL", onClick: () => {
          triggerDownload(API.dumpUrl(state.db), state.db.replace(/\.db$/, "") + ".sql");
        } },
      { icon: "save", label: "Save database (file / download)", onClick: downloadDbAction },
      { sep: true },
      { icon: "link", label: "Attach database…", onClick: attachDialog },
      { icon: "database", label: "Database tools…", onClick: dbToolsDialog },
      { icon: "gear", label: "Database settings…", onClick: pragmaDialog },
    ],
    edit: () => [
      { icon: "reset", label: "Undo", keys: "Ctrl Z", onClick: () => editor.exec("undo") },
      { icon: "refresh", label: "Redo", keys: "Ctrl Y", onClick: () => editor.exec("redo") },
      { sep: true },
      { icon: "eraser", label: "Cut", keys: "Ctrl X", onClick: () => editor.exec("cut") },
      { icon: "copy", label: "Copy", keys: "Ctrl C", onClick: () => editor.exec("copy") },
      { icon: "paste", label: "Paste", keys: "Ctrl V", onClick: async () => {
          try { editor.insert(await navigator.clipboard.readText()); }
          catch (_) { toast("Clipboard blocked by browser — use Ctrl+V", "err"); }
        } },
      { icon: "maximize", label: "Select all", keys: "Ctrl A", onClick: () => editor.selectAll() },
      { icon: "format", label: "Format", keys: "Ctrl Shift F", onClick: () => editor.format() },
      { sep: true },
      { icon: "search", label: "Find & replace", keys: "Ctrl F", onClick: () => openFindBar() },
      { icon: "filter", label: "Search database…", keys: "Ctrl Shift G", onClick: searchDialog },
    ],
    view: () => [
      { label: "Reset zoom", keys: "Ctrl 0", onClick: () => setZoom(1) },
      { label: "Zoom in", keys: "Ctrl =", onClick: () => setZoom(appZoom + 0.1) },
      { label: "Zoom out", keys: "Ctrl -", onClick: () => setZoom(appZoom - 0.1) },
      { sep: true },
      { label: "Reset editor font size", onClick: () => setEditorFs(13.5) },
      { label: "Increase editor font size", keys: "Ctrl Shift .", onClick: () => setEditorFs(editorFs + 1) },
      { label: "Decrease editor font size", keys: "Ctrl Shift ,", onClick: () => setEditorFs(editorFs - 1) },
      { sep: true },
      { label: "Toggle primary sidebar", keys: "Alt S", onClick: toggleSidebar },
      { label: "Toggle secondary sidebar", onClick: toggleRail },
      { sep: true },
      { label: "Theme", sub: () => {
          const item = (t) => ({
            label: t.name, checked: state.theme === t.id, onClick: () => applyTheme(t.id),
          });
          // dark family / light family, separated
          return [
            ...THEMES.filter((t) => !LIGHT_THEMES.includes(t.id)).map(item),
            { sep: true },
            ...THEMES.filter((t) => LIGHT_THEMES.includes(t.id)).map(item),
          ];
        } },
      { label: "Reload window", keys: "Ctrl Shift R", onClick: () => location.reload() },
      { label: "Toggle full screen", keys: "F11", onClick: toggleFullscreen },
      { label: "Toggle privacy mode",
        checked: document.body.classList.contains("privacy"),
        onClick: () => document.body.classList.toggle("privacy") },
    ],
    help: () => [
      { label: "Keyboard shortcuts", onClick: shortcutsModal },
      { icon: "book", label: "SQL syntax reference", onClick: () => railSelect("syntax") },
      { sep: true },
      { label: "About SequenceLab", onClick: aboutModal },
    ],
  };
  $$(".menu-item").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      toggleCtxMenu(btn, MENUS[btn.dataset.menu]());
    };
  });

  function shortcutsModal() {
    const body = el("div");
    body.appendChild(helpPanel());
    body.firstChild.style.padding = "10px 0";
    openModal("Keyboard shortcuts", body, [mkBtn("Close", "primary", closeModal)]);
  }
  function aboutModal() {
    const body = el("div");
    body.innerHTML =
      `<p style="margin:0 0 10px;font-family:var(--display);font-size:18px">Se<span class="brand-accent">Q</span>uenceLab</p>
       <p style="margin:0 0 8px;color:var(--muted);line-height:1.6">A local SQLite workbench. Backend on 127.0.0.1, databases as real .db files, everything fully offline — no cloud, no account, no telemetry.</p>
       <p style="margin:0;color:var(--faint);font-size:12px">Frontend: vanilla HTML/CSS/JS · Backend: Flask + sqlite3</p>`;
    openModal("About", body, [mkBtn("Close", "primary", closeModal)]);
  }

  // ============================================================ HISTORY
  async function loadHistory() {
    const res = await API.history(state.db);
    const list = $("#historyList");
    list.innerHTML = "";
    (res.history || []).slice(0, S.maxHistory).forEach((h) => {
      const item = el("div", "history-item");
      item.innerHTML =
        `<div class="history-sql">${esc(h.sql)}</div>
         <div class="history-meta">
           <span class="history-status ${h.status}">${ICON(h.status === "ok" ? "check" : "x")}</span>
           <span>${esc((h.ran_at || "").replace("T", " "))}</span>
           <span>${h.duration_ms != null ? h.duration_ms + " ms" : ""}</span>
           ${h.row_count != null ? `<span>${h.row_count} rows</span>` : ""}
         </div>`;
      item.title = h.sql;
      item.onclick = () => { editor.setValue(h.sql); editor.focus(); };
      list.appendChild(item);
    });
    if (!(res.history || []).length)
      list.appendChild(el("div", "msg-block",
        `<span style="color:var(--text-faint)">No queries yet for this database.</span>`));
  }

  $("#btnClearHistory").onclick = async () => {
    if (!confirm("Clear all query history?")) return;
    await API.clearHistory();
    loadHistory();
  };

  // ============================================================ SNIPPETS
  async function loadSnippets() {
    const res = await API.snippets();
    state.snippetCache = res.snippets || [];
    const list = $("#snippetList");
    list.innerHTML = "";
    (res.snippets || []).forEach((s) => {
      const item = el("div", "snippet-item");
      item.innerHTML =
        `<div class="snippet-title"><span class="snippet-pin">${ICON("bookmark")}</span>${esc(s.title)}</div>
         <div class="snippet-sql">${esc(s.sql)}</div>
         <div class="row-actions">
           <button class="btn icon" data-act="load" title="Load into editor">${ICON("play")}</button>
           <button class="btn icon" data-act="edit" title="Rename">${ICON("pencil")}</button>
           <button class="btn icon" data-act="del" title="Delete">${ICON("trash")}</button>
         </div>`;
      item.querySelector('[data-act="load"]').onclick = () => {
        editor.setValue("");
        insertSnippetText(s.sql); // placeholder-aware
      };
      item.querySelector('[data-act="edit"]').onclick = () => snippetDialog(s);
      item.querySelector('[data-act="del"]').onclick = async () => {
        if (!confirm(`Delete snippet "${s.title}"?`)) return;
        await API.deleteSnippet(s.id);
        loadSnippets();
      };
      list.appendChild(item);
    });
    if (!(res.snippets || []).length)
      list.appendChild(el("div", "msg-block",
        `<span style="color:var(--text-faint)">No saved snippets.<br>Write SQL, then click ＋.<br><br>` +
        `Tip: <code>\${name}</code> placeholders prompt on insert, <code>\${cursor}</code> sets the caret.</span>`));
    if (editor) editor.setSnippets(state.snippetCache.map((s) => ({ name: s.title, sql: s.sql })));
  }

  $("#btnSaveSnippet").onclick = () => snippetDialog(null);

  function snippetDialog(existing) {
    const body = el("div");
    body.innerHTML =
      `<div class="field">
         <label>Title</label>
         <input type="text" id="snTitle" value="${existing ? esc(existing.title) : ""}" placeholder="Top customers" />
       </div>
       <div class="field">
         <label>SQL</label>
         <textarea id="snSql">${existing ? esc(existing.sql) : esc(editor.getValue())}</textarea>
       </div>`;
    const save = mkBtn("Save", "primary", async () => {
      const payload = {
        id: existing ? existing.id : undefined,
        title: body.querySelector("#snTitle").value.trim(),
        sql: body.querySelector("#snSql").value,
      };
      if (!payload.title) return toast("Title required", "err");
      const res = await API.saveSnippet(payload);
      if (res.error) return toast(res.error, "err");
      closeModal();
      toast("Snippet saved", "ok");
      loadSnippets();
    });
    openModal(existing ? "Edit snippet" : "Save snippet", body, [
      mkBtn("Cancel", "ghost", closeModal), save,
    ]);
    setTimeout(() => body.querySelector("#snTitle").focus(), 30);
  }

  // ============================================================ KEYBOARD
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "s") {
      e.preventDefault();
      snippetDialog(null);
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      editor.format();
    }
    // e.key (not e.code): code is the physical QWERTY position and breaks on AZERTY
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === "Period" || e.key === "." || e.key === ">")) {
      e.preventDefault();
      setEditorFs(editorFs + 1);
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === "Comma" || e.key === "," || e.key === "<")) {
      e.preventDefault();
      setEditorFs(editorFs - 1);
    }
    if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      toggleSidebar();
    }
    if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === "w") {
      e.preventDefault();
      if (state.activeTab) closeTab(state.activeTab);
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "f"
        && state.view === "editor") {
      e.preventDefault();
      openFindBar();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "g") {
      e.preventDefault();
      searchDialog();
    }
    if (e.key === "Escape" && !$("#findBar").hidden && $("#modalBackdrop").hidden) closeFindBar();
    if (e.key === "Escape" && !$("#modalBackdrop").hidden) closeModal();
    if (e.key === "Escape") hideCtxMenu();
  });

  // ============================================================ VIEW SWITCH
  function setView(view) {
    state.view = view;
    $(".layout").hidden = view !== "editor";
    $("#browseView").hidden = view !== "browse";
    $("#diagramView").hidden = view !== "diagram";
    if (view === "diagram") ERD.open(state.db);
    updateRail();
  }

  // Bridge for the diagram module (reads the active db, reuses toast + schema reload).
  window.SLApp = {
    db: () => state.db,
    toast,
    openModal, closeModal, mkBtn, mkSelect, el, esc, showCtxMenu,
    onSchemaChanged: async () => { await refreshSchema(); },
    autoBackup: () => S.autoBackup,
    runSelect: (sql) => { setView("editor"); editor.setValue(sql); runQuery(); },
    editorSet: (text) => { setView("editor"); editor.setValue(text); editor.focus(); },
    editorAppend: (text) => {
      setView("editor");
      const v = editor.getValue();
      editor.setValue(v + (v && !/\s$/.test(v) ? " " : "") + text);
      editor.focus();
    },
  };

  // ============================================================ BOOT
  async function boot() {
    applyTheme(state.theme);
    if (appZoom !== 1) document.body.style.zoom = appZoom;
    if (editorFs !== 13.5) document.documentElement.style.setProperty("--editor-fs", editorFs + "px");
    applySettings();
    initEditor();
    editor.setValue(activeQueryTab().sql || "");
    renderQueryTabs();
    renderActiveResult(); // shows the shortcuts help panel
    updateRail();
    await loadDatabases(state.db);
    await loadSnippets();
    ERD.init();
    API.health().then((h) => {
      if (h && h.sqlite)
        $("#sqliteVer").textContent = `SQLite ${h.sqlite} · in-browser (sql.js) · offline`;
    }).catch(() => {});
  }
  boot();
})();
