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
    theme: localStorage.getItem("sl.theme") || "system",
    view: "editor",
    sidePanel: "schema",
    browsePanel: "tables",    // browse-side: "tables" | "filters"
    diagramPanel: "tables",   // diagram-side: "tables" | "layouts" | "notes"
  };

  // ----------------------------------------------------------------- settings
  const SETTINGS_DEFAULTS = {
    tabWidth: 2, wordWrap: false, acEnabled: true, acMinChars: 1, autoFormat: false,
    pageSize: 100, maxRows: 500, confirmDestructive: true, readOnly: false, previewWrites: false,
    recordHistory: true, maxHistory: 200,
    nullDisplay: "NULL", truncate: 0, showStatusbar: true, density: "comfortable",
    csvDelimiter: ",", csvHeader: true, autoBackup: false,
    rangeSep: "tab",
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
  // "system" follows the OS: dark → Nocturne, light → Paper.
  function resolveTheme(pref) {
    return pref === "system" ? (darkTab.matches ? "nocturne" : "paper") : pref;
  }
  function applyTheme(pref) {
    state.theme = pref;                  // remembered preference (may be "system")
    localStorage.setItem("sl.theme", pref);
    const id = resolveTheme(pref);       // concrete theme actually applied
    document.documentElement.setAttribute("data-theme", id);
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
  darkTab.addEventListener("change", () => {
    applyFavicon();
    if (state.theme === "system") applyTheme("system"); // re-resolve on OS flip
  });
  applyFavicon();

  let editor;

  // ----------------------------------------------------------------- toast
  let toastTimer;
  function toast(msg, kind = "") {
    const t = $("#toast");
    t.textContent = window.I18N ? I18N.t(msg) : msg;
    t.className = "toast " + kind;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  // ----------------------------------------------------------------- modal
  let modalReturnFocus = null;
  let modalOnClose = null;
  function openModal(title, bodyNode, footNodes) {
    modalOnClose = null;
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
    const cb = modalOnClose; modalOnClose = null;
    if (cb) cb();
  }
  // in-app replacement for window.confirm — resolves false on any dismissal
  function askConfirm(message, opts = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      const body = el("div");
      body.innerHTML = `<p class="confirm-msg">${esc(message).replace(/\n/g, "<br>")}</p>`;
      const yes = mkBtn(opts.confirmLabel || "Confirm", opts.tone === "primary" ? "primary" : "danger",
        () => { finish(true); closeModal(); });
      openModal(opts.title || "Confirm", body,
        [mkBtn(opts.cancelLabel || "Cancel", "ghost", () => { finish(false); closeModal(); }), yes]);
      modalOnClose = () => finish(false);
    });
  }
  // keep Tab cycling inside the open modal; Esc dismisses it
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modalBackdrop").hidden) { e.preventDefault(); closeModal(); return; }
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
    const hintLink = fsOk
      ? `<b>${esc(I18N.t("Open with live link"))}</b> ` +
        esc(I18N.t("instead keeps a connection to the real file: every change is saved straight back into it (you'll be asked for permission once)."))
      : esc(I18N.t("Live file links (saving straight back into the real file) need Chrome or Edge."));
    body.appendChild(
      el("div", "field",
        `<label>${esc(I18N.t("Pick a .db file to import (copy)"))}</label>
         <input type="file" id="openDbFile" accept=".db,.sqlite,.sqlite3,.db3" />
         <div class="hint">${esc(I18N.t("Import copies the file into the browser's storage — the original on disk is never touched; get the edited copy back with File → Save database."))}<br><br>${hintLink}</div>`)
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
    if (!opts.silent && !(await askConfirm(msg, { title: "Close database", confirmLabel: "Close" }))) return;
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
    if (!(await askConfirm("Reset the example database to its original seeded state?", { title: "Reset example", confirmLabel: "Reset" }))) return;
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
        `<span style="color:var(--text-faint);font-size:11px">${esc(I18N.t("Nothing pinned. Hover a table and click the pin."))}</span>`));
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
      { icon: "download", label: "Export", sub: () => exportItems(t.name) },
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
    openModal(I18N.t("Schema — {0}", table), body, [mkBtn("Close", "primary", closeModal)]);
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
    toast(I18N.t("Replaced {0} occurrences", n), "ok");
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
  $("#sqlInput").addEventListener("input", schedulePreview); // live write-preview as you type
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
  let wiping = false; // set during a debug reset so beforeunload doesn't re-save
  function persistQueryTabs() {
    if (wiping) return;
    const cur = activeQueryTab();
    if (cur && editor) cur.sql = editor.getValue();
    localStorage.setItem("sl.qtabs", JSON.stringify(qtabs));
  }
  window.addEventListener("beforeunload", persistQueryTabs);

  // pointer-based tab reordering: the dragged tab follows the cursor on the X
  // axis only (fixed Y) while the other tabs slide in real time to make room.
  function makeTabDraggable(tab, id, list, onReorder) {
    tab.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".tab-close")) return;
      const bar = tab.parentElement;
      const sibs = [...bar.children].filter((x) =>
        x.classList.contains("query-tab") || x.classList.contains("result-tab"));
      const rects = sibs.map((t) => t.getBoundingClientRect());
      const fromIdx = sibs.indexOf(tab);
      const tabW = rects[fromIdx].width;
      const startX = e.clientX;
      let curIdx = fromIdx, dragging = false;

      const move = (ev) => {
        const dx = ev.clientX - startX;
        if (!dragging) {
          if (Math.abs(dx) < 4) return;
          dragging = true;
          tab.classList.add("tab-dragging");
          bar.classList.add("tabs-sorting");
          tab.style.transition = "none";
          sibs.forEach((t) => { if (t !== tab) t.style.transition = "transform .16s ease"; });
        }
        tab.style.transform = `translateX(${dx}px)`;
        const center = rects[fromIdx].left + tabW / 2 + dx;
        let ni = fromIdx;
        for (let i = 0; i < sibs.length; i++) {
          if (i === fromIdx) continue;
          const c = rects[i].left + rects[i].width / 2;
          if (i > fromIdx && center > c) ni = Math.max(ni, i);
          else if (i < fromIdx && center < c) ni = Math.min(ni, i);
        }
        if (ni !== curIdx) {
          curIdx = ni;
          sibs.forEach((t, i) => {
            if (t === tab) return;
            const s = (fromIdx < curIdx && i > fromIdx && i <= curIdx) ? -tabW
              : (fromIdx > curIdx && i < fromIdx && i >= curIdx) ? tabW : 0;
            t.style.transform = s ? `translateX(${s}px)` : "";
          });
        }
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        if (!dragging) return;
        sibs.forEach((t) => { t.style.transform = ""; t.style.transition = ""; t.classList.remove("tab-dragging"); });
        bar.classList.remove("tabs-sorting");
        if (curIdx !== fromIdx) {
          const [item] = list.splice(fromIdx, 1);
          list.splice(curIdx, 0, item);
          onReorder();
        }
        const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        document.addEventListener("click", swallow, true);
        setTimeout(() => document.removeEventListener("click", swallow, true), 0);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
  }

  function renderQueryTabs() {
    const bar = $("#queryTabs");
    bar.innerHTML = "";
    qtabs.list.forEach((t) => {
      const tab = el("div", "query-tab" + (t.id === qtabs.active ? " active" : ""));
      tab.innerHTML = `<span>${esc(localizeTitle(t.title))}</span>` +
        (qtabs.list.length > 1 ? `<span class="tab-close">${ICON("x")}</span>` : "");
      tab.onclick = (e) => {
        if (e.target.closest(".tab-close")) closeQueryTab(t.id);
        else switchQueryTab(t.id);
      };
      makeTabDraggable(tab, t.id, qtabs.list, () => { renderQueryTabs(); persistQueryTabs(); });
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
    schedulePreview();            // reflect the switched-to tab's query
  }

  function addQueryTab() {
    persistQueryTabs();
    qtabs.seq += 1;
    // number = biggest existing number + 1 (stable under drag-reordering; ids stay unique via seq)
    const n = qtabs.list.reduce((mx, t) => {
      const m = /#(\d+)\s*$/.exec(t.title);
      return Math.max(mx, m ? parseInt(m[1], 10) : 0);
    }, 0) + 1;
    const t = { id: qtabs.seq, title: "Query #" + n, sql: "" };  // canonical EN; localized at render
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

    // language — lives in its own store (sl.lang), switches the UI live
    section("Language");
    const langRow = el("div", "set-row");
    langRow.appendChild(el("span", "set-label", "Language"));
    langRow.appendChild(mkSelect(
      I18N.langs.map((l) => [l.code, l.label]),
      I18N.lang, (v) => I18N.set(v), "set-select"));
    add(langRow);

    // theme — dark and light families get their own subtitle
    const themeField = el("div", "field", `<label>Theme</label>`);
    body.appendChild(themeField);
    // "System" follows the OS (dark → Nocturne, light → Paper)
    themeField.appendChild(el("div", "theme-mode-head", "Auto"));
    const sysGrid = el("div", "theme-grid");
    const sysCard = el("button", "theme-card" + (state.theme === "system" ? " active" : ""));
    sysCard.innerHTML =
      `<span class="theme-dot" style="background:linear-gradient(135deg,#7b6cf6 0 50%,#5b4ee0 50% 100%)"></span>` +
      `<span class="theme-name">System</span><span class="theme-sub">follows your OS</span>`;
    sysCard.onclick = () => {
      applyTheme("system");
      $$(".theme-card", themeField).forEach((c) => c.classList.remove("active"));
      sysCard.classList.add("active");
    };
    sysGrid.appendChild(sysCard);
    themeField.appendChild(sysGrid);
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
    add(swRow("Preview writes before applying", "previewWrites", schedulePreview));
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
      if (!(await askConfirm("Clear all query history?", { title: "Clear history", confirmLabel: "Clear all" }))) return;
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
    add(selRow("Range-copy separator", "rangeSep",
      [["tab", "Tab"], ["comma", "Comma"], ["semicolon", "Semicolon"], ["pipe", "Pipe"]]));
    add(swRow("Auto-backup before destructive SQL (keeps last 5)", "autoBackup"));

    section("Debug");
    add(btnRow("Replay the welcome tour", "Replay", "ghost", () => { closeModal(); startWizard(); }));
    add(btnRow("Service worker & caches", "Clear & reload", "ghost", async () => {
      await wipeCachesAndSW();
      location.reload();
    }));
    add(btnRow("Reset everything (databases, settings, tutorial)", "Clear everything", "danger", async () => {
      if (!(await askConfirm(
        "Delete ALL databases, settings and cached data, then reload? This cannot be undone.",
        { title: "Clear everything", confirmLabel: "Clear everything" }))) return;
      wiping = true;              // stop beforeunload from re-saving query tabs
      wipeLocalState();
      await API.wipeStorage();
      await wipeCachesAndSW();
      location.reload();
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
      if (risky.length && !(await askConfirm(
        I18N.t("About to run {0} destructive statement(s):\n\n{1}\n\nContinue?",
          risky.length, risky.map((s) => s.text.slice(0, 80)).join("\n")),
        { title: "Run destructive SQL", confirmLabel: "Run" }))) return;
    }
    await runSqlNow(sql);
  }

  async function runSqlNow(sql) {
    const hasWrite = splitWithOffsets(sql).some((s) => WRITE_STMT.test(s.text));
    persistQueryTabs();
    setStatus("Running…");
    runningQid = "q" + Date.now() + Math.random().toString(36).slice(2, 7);
    setRunState(true);
    const t0 = performance.now();
    const res = await API.query(state.db, sql, S.recordHistory, S.autoBackup && hasWrite, runningQid);
    runningQid = null;
    setRunState(false);
    const ms = (performance.now() - t0).toFixed(0);
    setStatus(I18N.t("Done in {0} ms", res.duration_ms ?? ms));

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
    schedulePreview(); // the data changed — refresh the live write preview
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

  // tab titles are stored as canonical English; localize them at render time so
  // they follow live language switches (and reverse cleanly back to English).
  function localizeTitle(title) {
    let m;
    if ((m = /^(#\d+ )?Result \((\d+)\)$/.exec(title))) return (m[1] || "") + I18N.t("Result ({0})", m[2]);
    if ((m = /^Preview \((\d+)\)$/.exec(title))) return I18N.t("Preview ({0})", m[2]);
    if ((m = /^Query #(\d+)$/.exec(title))) return I18N.t("Query #{0}", m[1]);
    return I18N.t(title); // plain keys (OK, Error); identifiers pass through unchanged
  }

  function renderTabs() {
    const bar = $("#resultsTabs");
    bar.innerHTML = "";
    state.tabs.forEach((t) => {
      const dot =
        t.kind === "error" ? "err" : t.kind === "browse" ? "tbl" : "ok";
      const tab = el("div", "result-tab" + (t.id === state.activeTab ? " active" : ""));
      tab.innerHTML =
        `<span class="dot ${dot}"></span><span>${esc(localizeTitle(t.title))}</span>` +
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
      makeTabDraggable(tab, t.id, state.tabs, renderTabs);
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
    if (tab.kind === "preview") return body.appendChild(renderWritePreview(tab));
    if (tab.kind === "grid") return body.appendChild(renderGrid(tab));
  }

  // ============================================================ PREVIEW-BEFORE-WRITE
  // With "Preview writes" on, running a write query first does a transactional
  // dry-run (API.previewWrite runs it in a savepoint, diffs every table, then
  // rolls back) and shows the resulting changes in a tab — + insert / − delete /
  // ~ edit. Apply re-runs the query for real; Discard just closes the tab.
  // With "Preview writes" on, the preview tab auto-opens and live-shows what the
  // write query in the editor would do: the affected table(s) rendered with rows
  // flickering — green = added, red = deleted, white = edited. Run executes for real.
  const previewOn = () => !!S.previewWrites;
  const PV_ID = "tpreview";
  let previewTimer = null;
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(updateWritePreview, 350); }
  async function updateWritePreview() {
    const drop = () => { if (state.tabs.find((t) => t.id === PV_ID)) closeTab(PV_ID); };
    if (!previewOn() || !editor) return drop();
    const sql = (editor.getValue() || "").trim();
    const hasWrite = sql && splitWithOffsets(sql).some((s) => WRITE_STMT.test(s.text));
    if (!hasWrite) return drop();
    const pv = await API.previewWrite(state.db, sql);
    if (pv.error || !pv.tables) return; // invalid/incomplete while typing → keep the last preview
    let tab = state.tabs.find((t) => t.id === PV_ID);
    const firstOpen = !tab;
    if (!tab) { tab = { id: PV_ID, kind: "preview" }; state.tabs.push(tab); }
    tab.tables = pv.tables;
    const changes = pv.tables.reduce((s, t) => s + t.adds + t.dels + t.edits, 0);
    tab.title = `Preview (${changes})`;
    if (firstOpen) state.activeTab = PV_ID;
    renderTabs();
    if (state.activeTab === PV_ID) renderActiveResult();
  }
  function renderWritePreview(tab) {
    const wrap = el("div", "result-content");
    const tables = tab.tables || [];
    const changes = tables.reduce((s, t) => s + t.adds + t.dels + t.edits, 0);
    const bar = el("div", "result-bar");
    bar.innerHTML = `<span class="stat"><b>${changes}</b> change${changes !== 1 ? "s" : ""} this query would make · run to apply</span>`;
    wrap.appendChild(bar);
    const body = el("div", "pv-grids");
    if (!changes) body.appendChild(el("div", "pv-empty", "This query changes no rows."));
    tables.forEach((t) => {
      body.appendChild(el("div", "pv-tablehead",
        `${esc(t.table)} — ${esc(I18N.t("{0} added · {1} deleted · {2} edited", t.adds, t.dels, t.edits))}`));
      const table = el("table", "grid pv-grid");
      table.setAttribute("data-noi18n", ""); // cell data — never translate
      const thead = el("thead"), htr = el("tr");
      htr.appendChild(el("th", "rownum", "#"));
      t.columns.forEach((c) => { const th = el("th"); th.textContent = c; htr.appendChild(th); });
      thead.appendChild(htr); table.appendChild(thead);
      const tb = el("tbody");
      t.rows.forEach((r, i) => {
        const tr = el("tr", r.status ? "pvg-" + r.status : "");
        tr.appendChild(el("td", "rownum", i + 1));
        r.cells.forEach((v) => tr.appendChild(cellTd(v)));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      const gw = el("div", "grid-wrap"); gw.appendChild(table); body.appendChild(gw);
      if (t.truncated) body.appendChild(el("div", "pv-empty", I18N.t("Showing first {0} rows.", t.rows.length)));
    });
    wrap.appendChild(body);
    return wrap;
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
    const cf = tab.colFilters && Object.entries(tab.colFilters).filter(([, v]) => v);
    if (cf && cf.length) {
      const ix = {}; tab.columns.forEach((c, i) => (ix[c.name] = i));
      rows = rows.filter((r) => cf.every(([col, sub]) => {
        const v = r[ix[col]];
        return v != null && !isBlob(v) && String(v).toLowerCase().includes(sub.toLowerCase());
      }));
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
        downloadText("query_result.json", JSON.stringify(objs, null, 2), "application/json");
      } },
      { label: "Download Excel", onClick: () =>
        downloadBlob("query_result.xlsx", XLSXMini.build(headers, view.rows.map((row) => row.map(plain)))) },
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

  // whole-table export (Browse + entity menu): CSV streams via the API, JSON
  // and Excel are built from a full SELECT.
  async function tableExportData(table, fmt) {
    if (fmt === "csv")
      return triggerDownload(API.exportUrl(state.db, { table, ...csvUrlOpts() }), table + ".csv");
    const res = await API.query(state.db, `SELECT * FROM ${quoteIfNeeded(table)}`, false, false);
    const r0 = res && res.results && res.results[0];
    if (res.error || !r0 || r0.kind !== "rows") return toast(res.error || "Nothing to export", "err");
    const headers = r0.columns, plain = (v) => (isBlob(v) ? "<blob>" : v);
    if (fmt === "json") {
      const objs = r0.rows.map((row) => { const o = {}; headers.forEach((h, i) => (o[h] = plain(row[i]))); return o; });
      downloadText(table + ".json", JSON.stringify(objs, null, 2), "application/json");
    } else {
      downloadBlob(table + ".xlsx", XLSXMini.build(headers, r0.rows.map((row) => row.map(plain)), table));
    }
  }
  const exportItems = (table) => [
    { label: "CSV", onClick: () => tableExportData(table, "csv") },
    { label: "JSON", onClick: () => tableExportData(table, "json") },
    { label: "Excel", onClick: () => tableExportData(table, "xlsx") },
  ];

  function renderGrid(tab) {
    const wrap = el("div", "result-content");
    const view = gridView(tab);
    const bar = el("div", "result-bar");
    bar.innerHTML =
      `<span class="stat"><b>${view.total}</b>${tab.filter ? ` / ${tab.rows.length}` : ""} ${esc(I18N.t("rows"))}</span>` +
      (view.capped ? `<span class="stat" style="color:var(--warn)">${esc(I18N.t("showing first {0}", S.maxRows))}</span>` : "");
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
    bar.appendChild(mkBtn(ICON("save") + "Save as table", "ghost", () => saveResultAsTable(tab)));
    const exp = mkBtn(ICON("download") + "Export", "ghost", () => {});
    exp.onclick = (e) => exportMenu(e, tab, gridView(tab));
    bar.appendChild(exp);
    wrap.appendChild(bar);

    const gridWrap = el("div", "grid-wrap");
    gridWrap.appendChild(buildTable(tab, view.rows));
    wrap.appendChild(gridWrap);
    return wrap;
  }

  // ---- rectangular cell selection + copy (result grids & Browse) ----
  // Tables expose _cells (2D raw values aligned to displayed columns); data
  // cells carry data-r/data-c. Drag or shift-click selects a rectangle;
  // Ctrl/Cmd+C copies it as TSV. A plain click is untouched (opens the record).
  let gridSel = null;
  function paintGridSel() {
    const { table, r0, c0, r1, c1 } = gridSel;
    const lr = Math.min(r0, r1), hr = Math.max(r0, r1), lc = Math.min(c0, c1), hc = Math.max(c0, c1);
    table.querySelectorAll("td[data-c]").forEach((td) => {
      const r = +td.dataset.r, c = +td.dataset.c;
      td.classList.toggle("cell-sel", r >= lr && r <= hr && c >= lc && c <= hc);
    });
  }
  function clearGridSel() {
    if (gridSel) gridSel.table.querySelectorAll("td.cell-sel").forEach((td) => td.classList.remove("cell-sel"));
    gridSel = null;
  }
  // when the record panel is open, mirror the selection's anchor row into it
  // (no auto-open — opening is manual via the panel toggle)
  function recordFromGridSel() {
    if (!gridSel || $("#jsonPanel").hidden) return;
    const t = gridSel.table;
    if (!t._cells || !t._cells[gridSel.r0]) return;
    const obj = {};
    (t._cols || []).forEach((name, i) => (obj[name] = t._cells[gridSel.r0][i]));
    showRecord(obj, t._srcTable || null);
  }
  function enableRangeSelect(table) {
    let anchor = null, dragging = false, moved = false, rowDrag = false;
    const lastCol = () => ((table._cols && table._cols.length) || 1) - 1;
    table.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("input, textarea, .cell-edit")) return; // don't hijack an open editor
      // clicking the # cell selects the whole row (shift-click / drag extends)
      const rn = e.target.closest("td.rownum");
      if (rn && rn.dataset.r !== undefined) {
        const r = +rn.dataset.r;
        if (e.shiftKey && gridSel && gridSel.table === table) { gridSel.r1 = r; }
        else { clearGridSel(); gridSel = { table, r0: r, c0: 0, r1: r, c1: lastCol() }; }
        gridSel.c0 = 0; gridSel.c1 = lastCol();
        anchor = { r, c: 0 }; dragging = true; moved = true; rowDrag = true;
        table.classList.add("range-dragging"); paintGridSel(); recordFromGridSel(); e.preventDefault();
        return;
      }
      const td = e.target.closest("td[data-c]");
      if (!td) return;
      const r = +td.dataset.r, c = +td.dataset.c;
      if (e.shiftKey && gridSel && gridSel.table === table) {
        gridSel.r1 = r; gridSel.c1 = c; moved = true; rowDrag = false; paintGridSel(); recordFromGridSel(); e.preventDefault(); return;
      }
      // a plain click selects that single cell (drag extends the rectangle)
      clearGridSel();
      gridSel = { table, r0: r, c0: c, r1: r, c1: c };
      anchor = { r, c }; dragging = true; moved = false; rowDrag = false;
      table.classList.add("range-dragging");
      paintGridSel(); recordFromGridSel();
    });
    table.addEventListener("mouseover", (e) => {
      if (!dragging) return;
      if (rowDrag) {
        const cell = e.target.closest("td[data-c], td.rownum");
        if (!cell || cell.dataset.r === undefined) return;
        gridSel.r1 = +cell.dataset.r; gridSel.c0 = 0; gridSel.c1 = lastCol();
        paintGridSel(); return;
      }
      const td = e.target.closest("td[data-c]");
      if (!td) return;
      gridSel.r1 = +td.dataset.r; gridSel.c1 = +td.dataset.c; moved = true;
      paintGridSel();
    });
    table.addEventListener("mouseup", () => {
      const wasDrag = dragging && moved;   // only a real drag/selection swallows the trailing click
      dragging = false; rowDrag = false; table.classList.remove("range-dragging");
      table._selDrag = wasDrag; setTimeout(() => (table._selDrag = false), 0);
    });
    // a drag (or shift-click) must not also fire the row's record-open click
    table.addEventListener("click", (e) => {
      if (table._selDrag || e.shiftKey) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    // right-click inside an active selection → range menu (separators + create table)
    table.addEventListener("contextmenu", (e) => {
      if (!gridSel || gridSel.table !== table) return;
      const td = e.target.closest("td[data-c]");
      if (!td) return;
      const r = +td.dataset.r, c = +td.dataset.c, { lr, hr, lc, hc } = selRect();
      if (r < lr || r > hr || c < lc || c > hc) return;   // outside selection → default cell menu
      if (lr === hr && lc === hc) return;                  // single cell → keep its normal cell menu
      e.preventDefault(); e.stopPropagation();
      rangeContextMenu(e);
    }, true);
  }
  const RANGE_SEPS = { tab: "\t", comma: ",", semicolon: ";", pipe: "|" };
  const RANGE_SEP_LABELS = { tab: "Tab", comma: "Comma", semicolon: "Semicolon", pipe: "Pipe" };
  function selRect() {
    const { r0, c0, r1, c1 } = gridSel;
    return { lr: Math.min(r0, r1), hr: Math.max(r0, r1), lc: Math.min(c0, c1), hc: Math.max(c0, c1) };
  }
  function copyGridSel(sepKey) {
    if (!gridSel || !gridSel.table._cells) return;
    sepKey = sepKey || S.rangeSep || "tab";
    const sep = RANGE_SEPS[sepKey] || "\t";
    const quote = (s) => sepKey === "tab" ? s
      : (/["\n\r]/.test(s) || s.includes(sep)) ? '"' + s.replace(/"/g, '""') + '"' : s;
    const { table } = gridSel, { lr, hr, lc, hc } = selRect();
    const lines = [];
    for (let r = lr; r <= hr; r++) {
      const row = table._cells[r] || [], out = [];
      for (let c = lc; c <= hc; c++) {
        const v = row[c];
        out.push(quote(v == null ? "" : isBlob(v) ? "<blob>" : String(v)));
      }
      lines.push(out.join(sep));
    }
    const n = (hr - lr + 1) * (hc - lc + 1);
    navigator.clipboard.writeText(lines.join("\n"))
      .then(() => toast(I18N.t("Copied {0} cells ({1})", n, RANGE_SEP_LABELS[sepKey]), "ok"))
      .catch(() => toast("Clipboard blocked by browser", "err"));
  }
  function rangeContextMenu(e) {
    const sepItem = (key) => ({ label: RANGE_SEP_LABELS[key] + "-separated", onClick: () => copyGridSel(key) });
    showCtxMenu(e.clientX, e.clientY, [
      { icon: "copy", label: `Copy (${RANGE_SEP_LABELS[S.rangeSep] || "Tab"})`, onClick: () => copyGridSel() },
      { icon: "copy", label: "Copy as", sub: () => [sepItem("tab"), sepItem("comma"), sepItem("semicolon"), sepItem("pipe")] },
      { sep: true },
      { icon: "table", label: "Create table from selection", onClick: () => createTableFromSelection() },
    ]);
  }
  function createTableFromSelection() {
    if (!gridSel || !gridSel.table._cells || !gridSel.table._cols) return;
    const { table } = gridSel, { lr, hr, lc, hc } = selRect();
    const cols = [];
    for (let c = lc; c <= hc; c++) cols.push(table._cols[c]);
    const rows = [];
    for (let r = lr; r <= hr; r++) {
      const o = {};
      for (let c = lc; c <= hc; c++) {
        const v = table._cells[r][c];
        o[table._cols[c]] = isBlob(v) || v === undefined ? null : v;
      }
      rows.push(o);
    }
    const body = el("div");
    body.innerHTML =
      `<div class="field"><label>New table name</label>
         <input id="ctsName" type="text" placeholder="my_table" /></div>
       <div class="hint">${rows.length} row${rows.length > 1 ? "s" : ""} × ${cols.length} column${cols.length > 1 ? "s" : ""}; types inferred. Stored in <b>${esc(state.db)}</b>.</div>`;
    const go = mkBtn("Create", "primary", async () => {
      const name = body.querySelector("#ctsName").value.trim();
      if (!name) return toast("Table name required", "err");
      if (S.readOnly) return toast("Read-only mode is on (see Settings).", "err");
      const res = await API.importJson({ db: state.db, table: name, json: JSON.stringify(rows), create: true, backup: S.autoBackup });
      if (res.error) return toast(res.error, "err");
      closeModal();
      toast(I18N.t("Created {0} ({1} rows)", name, res.inserted ?? rows.length), "ok");
      await refreshSchema();
    });
    openModal("Create table from selection", body, [mkBtn("Cancel", "ghost", closeModal), go]);
    setTimeout(() => { const i = body.querySelector("#ctsName"); i.focus(); i.onkeydown = (ev) => { if (ev.key === "Enter") go.click(); }; }, 30);
  }
  document.addEventListener("keydown", (e) => {
    if (!gridSel) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
    if ((e.key === "c" || e.key === "C") && (e.ctrlKey || e.metaKey)) {
      if (window.getSelection && String(window.getSelection())) return; // honor a real text selection
      e.preventDefault(); copyGridSel();
    } else if (e.key === "Delete") {
      e.preventDefault(); deleteSelectedRows();
    } else if (e.key === "Backspace") {
      e.preventDefault(); nullSelectedCells();
    }
  });

  // Delete key → drop the selected rows (Browse only — needs rowids)
  async function deleteSelectedRows() {
    if (!gridSel || state.view !== "browse" || !browse.data)
      return toast("Select rows in Browse to delete them.", "err");
    if (!browse.data.has_rowid)
      return toast("This is a view (or a table without a rowid) — its rows can't be deleted.", "err");
    if (S.readOnly) return toast("Read-only mode is on (see Settings).", "err");
    const { lr, hr } = selRect();
    const ids = [];
    for (let i = lr; i <= hr; i++) { const row = browse.data.rows[i]; if (row && row.__rowid__ != null) ids.push(row.__rowid__); }
    if (!ids.length) return;
    if (!(await askConfirm(I18N.t("Delete {0} selected rows?", ids.length),
      { title: "Delete rows", confirmLabel: "Delete" }))) return;
    let failed = 0, lastErr = "";
    for (const id of ids) { const res = await API.deleteRow(state.db, browse.table, { __rowid__: id }); if (res.error) { failed++; lastErr = res.error; } }
    clearGridSel();
    toast(failed ? `Deleted ${ids.length - failed}, ${failed} failed — ${lastErr}` : `Deleted ${ids.length} row${ids.length > 1 ? "s" : ""}`, failed ? "err" : "ok");
    reloadBrowse(); refreshSchema();
  }

  // Backspace key → set the selected cells to NULL (Browse + editable result grids)
  async function nullSelectedCells() {
    if (!gridSel) return;
    if (S.readOnly) return toast("Read-only mode is on (see Settings).", "err");
    const { lr, hr, lc, hc } = selRect();
    if (state.view === "browse" && browse.data) {
      if (!browse.data.has_rowid) return toast("This is a view (or a table without a rowid) — its cells can't be edited.", "err");
      const cols = browse.data.columns;
      let count = 0, failed = 0, lastErr = "";
      for (let i = lr; i <= hr; i++) {
        const row = browse.data.rows[i]; if (!row) continue;
        const changes = {};
        for (let c = lc; c <= hc; c++) if (cols[c]) changes[cols[c].name] = null;
        if (!Object.keys(changes).length) continue;
        const res = await API.updateRow(state.db, browse.table, { __rowid__: row.__rowid__ }, changes);
        if (res.error) { failed++; lastErr = res.error; } else count += Object.keys(changes).length;
      }
      clearGridSel();
      toast(failed ? `${failed} cell update(s) failed — ${lastErr}` : `Set ${count} cell${count > 1 ? "s" : ""} to NULL`, failed ? "err" : "ok");
      reloadBrowse();
      return;
    }
    const tab = state.tabs.find((t) => t.id === state.activeTab);
    if (!tab || tab.kind !== "grid") return;
    const info = await ensureRowids(tab);
    if (info.bad) return toast("This result can't be edited inline.", "err");
    let failed = 0, lastErr = "";
    for (let i = lr; i <= hr; i++) {
      if (info.rowids[i] == null) continue;
      const changes = {};
      for (let c = lc; c <= hc; c++) changes[tab.columns[c].name] = null;
      const res = await API.updateRow(state.db, info.table, { __rowid__: info.rowids[i] }, changes);
      if (res.error) { failed++; lastErr = res.error; continue; }
      for (let c = lc; c <= hc; c++) tab.rows[i][c] = null;
    }
    clearGridSel(); renderActiveResult();
    toast(failed ? `${failed} cell update(s) failed — ${lastErr}` : "Cleared selected cells", failed ? "err" : "ok");
  }
  // clicking anywhere outside the grid (and not on the range menu) clears the selection
  document.addEventListener("mousedown", (e) => {
    if (!gridSel) return;
    if (e.target.closest("table.grid") || e.target.closest(".ctx-menu") ||
        e.target.closest("#jsonPanel") || e.target.closest("#btnToggleJson")) return;
    clearGridSel();
  });

  function buildTable(tab, rows) {
    gridSel = null;
    const columns = tab.columns;
    if (tab._editAnalysis === undefined) tab._editAnalysis = analyzeEditable(tab.statement);
    const srcTable = tab._editAnalysis ? tab._editAnalysis.table : null;
    const editable = !!tab._editAnalysis && !(tab.edit && tab.edit.bad);
    const table = el("table", "grid");
    table.setAttribute("data-noi18n", ""); // cell data — never translate
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
      th.oncontextmenu = (e) => resultHeaderMenu(e, tab, c);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = el("tbody");
    rows.forEach((r, i) => {
      const tr = el("tr");
      const rnTd = el("td", "rownum", i + 1); rnTd.dataset.r = i; tr.appendChild(rnTd);
      const arr = Array.isArray(r) ? r : columns.map((c) => r[c.name]);
      const origIndex = editable ? tab.rows.indexOf(r) : -1;
      arr.forEach((v, ci) => {
        const td = cellTd(v);
        td.dataset.r = i; td.dataset.c = ci;
        if (editable && !isBlob(v)) {
          td.classList.add("editable");
          td.ondblclick = () => beginEditResult(td, tab, origIndex, columns[ci].name, v);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    table._cells = rows.map((r) => Array.isArray(r) ? r : columns.map((c) => r[c.name]));
    table._cols = columns.map((c) => c.name);
    table._srcTable = srcTable;
    enableRangeSelect(table);
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
    const ed = makeCellInput(colEditorKind(null, oldVal), oldVal);
    td.textContent = "";
    td.appendChild(ed.root);
    ed.focus();
    let done = false;
    const commit = async () => {
      if (done) return; done = true;
      const val = ed.read();
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
    ed.root.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    };
    if (ed.live) { ed.root.onchange = commit; ed.root.onblur = cancel; }
    else ed.root.onblur = commit;
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
    const tSel = mkSelect([["bar"], ["line"], ["area"], ["scatter"], ["pie"], ["histogram"]],
      "bar", () => draw(), "set-select");
    const tRow = selRow2("Type", tSel), xRow = selRow2("X axis", xSel), yRow = selRow2("Y axis", ySel);
    body.appendChild(tRow); body.appendChild(xRow); body.appendChild(yRow);
    body.insertAdjacentHTML("beforeend",
      `<canvas id="chCanvas" width="560" height="300" class="chart-canvas"></canvas>`);

    const PIE_VARS = ["--accent", "--blue", "--ok", "--warn", "--purple", "--danger", "--accent-strong"];
    const fmtNum = (v) => Number.isInteger(v) ? String(v) : (+v.toPrecision(4)).toString();

    const draw = () => {
      const xi = +xSel.getValue(), yi = +ySel.getValue(), type = tSel.getValue();
      xRow.style.display = type === "histogram" ? "none" : "";
      xRow.querySelector(".set-label").textContent = type === "pie" ? "Category" : "X axis";
      yRow.querySelector(".set-label").textContent =
        type === "pie" ? "Value" : type === "histogram" ? "Values" : "Y axis";
      const cv = body.querySelector("#chCanvas"), ctx = cv.getContext("2d");
      const cs = getComputedStyle(document.documentElement);
      const C = (n) => cs.getPropertyValue(n).trim();
      ctx.clearRect(0, 0, cv.width, cv.height);
      const rows = gridView(tab).rows.slice(0, type === "scatter" ? 2000 : type === "pie" ? 500 : 200);
      if (!rows.length) { ctx.fillStyle = C("--faint"); ctx.font = "12px " + C("--sans"); ctx.fillText("No rows to chart", 20, 30); return; }

      if (type === "pie") return drawPie(ctx, cv, C, rows, xi, yi);

      const L = 44, B = 36, W = cv.width - L - 12, H = cv.height - B - 14;
      ctx.strokeStyle = C("--border-2"); ctx.lineWidth = 1;
      ctx.strokeRect(L, 10, W, H);

      if (type === "histogram") {
        const vals = rows.map((r) => Number(r[yi])).filter((v) => !isNaN(v));
        const lo = Math.min(...vals), hi = Math.max(...vals);
        const bins = Math.min(12, Math.max(4, Math.round(Math.sqrt(vals.length))));
        const step0 = (hi - lo) / bins || 1;
        const counts = new Array(bins).fill(0);
        vals.forEach((v) => { let k = Math.floor((v - lo) / step0); if (k >= bins) k = bins - 1; if (k < 0) k = 0; counts[k]++; });
        const cmax = Math.max(...counts, 1), bw = W / bins;
        ctx.fillStyle = C("--muted"); ctx.font = "10px " + C("--mono"); ctx.textAlign = "right";
        ctx.fillText(String(cmax), L - 5, 18); ctx.fillText("0", L - 5, 12 + H);
        ctx.fillStyle = C("--accent");
        counts.forEach((cnt, i) => ctx.fillRect(L + i * bw + bw * 0.08, 10 + H - cnt / cmax * H, bw * 0.84, cnt / cmax * H));
        ctx.fillStyle = C("--faint"); ctx.textAlign = "center";
        for (let i = 0; i <= bins; i += Math.ceil(bins / 6)) ctx.fillText(fmtNum(lo + i * step0), L + i * bw, cv.height - 16);
        return;
      }

      // bar / line / area / scatter
      const xNumeric = type === "scatter";
      const n = rows.length;
      const ys = rows.map((r) => Number(r[yi]) || 0);
      const ymax = Math.max(...ys, 0), ymin = Math.min(...ys, 0), yspan = ymax - ymin || 1;
      let xmin = 0, xspan = 1;
      if (xNumeric) { const xs = rows.map((r) => Number(r[xi]) || 0); xmin = Math.min(...xs); xspan = (Math.max(...xs) - xmin) || 1; }
      const unit = W / Math.max(n, 1);
      const px = (i, r) => xNumeric ? L + ((Number(r[xi]) || 0) - xmin) / xspan * W : L + i * unit + unit / 2;
      const py = (v) => 10 + H - ((v - ymin) / yspan) * H;
      ctx.fillStyle = C("--muted"); ctx.font = "10px " + C("--mono"); ctx.textAlign = "right";
      ctx.fillText(fmtNum(ymax), L - 5, 18); ctx.fillText(fmtNum(ymin), L - 5, 12 + H);

      if (type === "bar") {
        ctx.fillStyle = C("--accent");
        rows.forEach((r, i) => { const h = ((Number(r[yi]) || 0) - ymin) / yspan * H; ctx.fillRect(L + i * unit + unit * 0.15, 10 + H - h, unit * 0.7, h); });
      } else if (type === "scatter") {
        ctx.fillStyle = C("--accent");
        rows.forEach((r) => { ctx.beginPath(); ctx.arc(px(0, r), py(Number(r[yi]) || 0), 2.5, 0, Math.PI * 2); ctx.fill(); });
      } else { // line / area
        ctx.strokeStyle = C("--accent"); ctx.lineWidth = 2; ctx.beginPath();
        rows.forEach((r, i) => { const x = px(i, r), y = py(Number(r[yi]) || 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
        if (type === "area") {
          ctx.lineTo(px(n - 1, rows[n - 1]), 10 + H); ctx.lineTo(px(0, rows[0]), 10 + H); ctx.closePath();
          ctx.globalAlpha = 0.18; ctx.fillStyle = C("--accent"); ctx.fill(); ctx.globalAlpha = 1;
        }
      }
      ctx.fillStyle = C("--faint"); ctx.textAlign = "center";
      const lstep = Math.ceil(n / 8);
      rows.forEach((r, i) => {
        if (i % lstep) return;
        ctx.fillText(String(xNumeric ? fmtNum(Number(r[xi]) || 0) : (r[xi] ?? i + 1)).slice(0, 9), px(i, r), cv.height - 16);
      });
    };

    function drawPie(ctx, cv, C, rows, xi, yi) {
      const agg = new Map();
      rows.forEach((r) => { const k = r[xi] == null ? "∅" : String(r[xi]); agg.set(k, (agg.get(k) || 0) + (Number(r[yi]) || 0)); });
      let entries = [...agg.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      if (entries.length > 8) {
        const rest = entries.slice(7).reduce((s, [, v]) => s + v, 0);
        entries = [...entries.slice(0, 7), ["Other", rest]];
      }
      const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
      const cx = 150, cy = cv.height / 2, rad = 110;
      let a0 = -Math.PI / 2;
      entries.forEach(([, v], i) => {
        const a1 = a0 + (v / total) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rad, a0, a1); ctx.closePath();
        ctx.fillStyle = C(PIE_VARS[i % PIE_VARS.length]); ctx.fill();
        a0 = a1;
      });
      ctx.textAlign = "left"; ctx.font = "11px " + C("--mono");
      entries.forEach(([k, v], i) => {
        const ly = 28 + i * 20;
        ctx.fillStyle = C(PIE_VARS[i % PIE_VARS.length]); ctx.fillRect(300, ly - 9, 11, 11);
        ctx.fillStyle = C("--text");
        ctx.fillText(`${String(k).slice(0, 16)}  ${(v / total * 100).toFixed(1)}%`, 318, ly);
      });
    }

    const exportPng = () => body.querySelector("#chCanvas").toBlob((b) => downloadBlob(`chart_${tSel.getValue()}.png`, b), "image/png");
    const copyPng = () => body.querySelector("#chCanvas").toBlob(async (b) => {
      try { await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); toast("Chart copied", "ok"); }
      catch (_) { toast("Clipboard blocked by browser", "err"); }
    }, "image/png");

    openModal("Chart", body, [
      mkBtn(ICON("copy") + "Copy", "ghost", copyPng),
      mkBtn(ICON("download") + "PNG", "ghost", exportPng),
      mkBtn("Close", "primary", closeModal),
    ]);
    draw();
  }

  // ---- column right-click menu (result grids) ----
  function resultHeaderMenu(e, tab, c) {
    e.preventDefault();
    const items = [
      { icon: "arrow-up", label: "Sort ascending", onClick: () => { tab.sort = { col: c.name, dir: "asc" }; renderActiveResult(); } },
      { icon: "arrow-down", label: "Sort descending", onClick: () => { tab.sort = { col: c.name, dir: "desc" }; renderActiveResult(); } },
      { sep: true },
      { icon: "filter", label: "Filter this column…", onClick: () => filterResultColumn(tab, c.name) },
    ];
    if (tab.colFilters && Object.keys(tab.colFilters).some((k) => tab.colFilters[k]))
      items.push({ icon: "x", label: "Clear column filters", onClick: () => { tab.colFilters = {}; renderActiveResult(); } });
    items.push({ sep: true });
    items.push({ icon: "chart", label: "Column stats", onClick: () => columnStatsResult(tab, c.name) });
    items.push({ icon: "copy", label: "Copy column name", onClick: async () => {
      try { await navigator.clipboard.writeText(c.name); toast("Copied", "ok"); }
      catch (_) { toast("Clipboard blocked by browser", "err"); }
    } });
    showCtxMenu(e.clientX, e.clientY, items);
  }

  function filterResultColumn(tab, col) {
    const body = el("div");
    body.innerHTML =
      `<div class="field"><label>Show rows where <b>${esc(col)}</b> contains</label>
         <input id="rcf" type="text" value="${esc((tab.colFilters && tab.colFilters[col]) || "")}" placeholder="substring (empty = clear)" /></div>`;
    const go = mkBtn("Apply", "primary", () => {
      tab.colFilters = tab.colFilters || {};
      const v = body.querySelector("#rcf").value;
      if (v) tab.colFilters[col] = v; else delete tab.colFilters[col];
      closeModal(); renderActiveResult();
    });
    openModal("Filter column", body, [mkBtn("Cancel", "ghost", closeModal), go]);
    setTimeout(() => { const i = body.querySelector("#rcf"); i.focus(); i.onkeydown = (ev) => { if (ev.key === "Enter") go.click(); }; }, 30);
  }

  // ---- column stats popup (shared by Browse + result grids) ----
  const fmtStat = (v) => v == null ? "—"
    : (typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(+v.toPrecision(6))) : String(v));

  function statCmp(a, b) {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  function statsFromValues(values) {
    let nonNull = 0, min = null, max = null, sum = 0, nums = 0;
    const freq = new Map();
    for (const v of values) {
      const key = v == null ? null : (isBlob(v) ? "‹blob›" : v);
      freq.set(key, (freq.get(key) || 0) + 1);
      if (v == null) continue;
      nonNull++;
      if (typeof v === "number") { sum += v; nums++; }
      if (!isBlob(v)) {
        if (min === null || statCmp(v, min) < 0) min = v;
        if (max === null || statCmp(v, max) > 0) max = v;
      }
    }
    const numeric = nonNull > 0 && nums === nonNull;
    return {
      count: values.length, nonNull, nulls: values.length - nonNull,
      distinct: [...freq.keys()].filter((k) => k !== null).length,
      min, max, numeric, sum: numeric ? sum : null, avg: numeric && nonNull ? sum / nonNull : null,
      top: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }
  function openStatsModal(title, s) {
    const body = el("div", "stats-body");
    const rows = [["Rows", s.count], ["Non-null", s.nonNull], ["Nulls", s.nulls],
      ["Distinct", s.distinct], ["Min", fmtStat(s.min)], ["Max", fmtStat(s.max)]];
    if (s.numeric) rows.push(["Sum", fmtStat(s.sum)], ["Average", fmtStat(s.avg)]);
    body.innerHTML = `<div class="stats-grid">` +
      rows.map(([k, v]) => `<div class="stats-row"><span class="stats-k">${esc(k)}</span><span class="stats-v">${esc(String(v))}</span></div>`).join("") +
      `</div>`;
    if (s.top && s.top.length) {
      const sec = el("div");
      sec.innerHTML = `<div class="stats-sec-head">Top values</div>`;
      s.top.forEach(([v, n]) => {
        const r = el("div", "stats-top-row");
        r.innerHTML = `<span class="stats-top-v">${esc(v === null ? S.nullDisplay : String(v))}</span><span class="stats-top-n">${n}</span>`;
        sec.appendChild(r);
      });
      body.appendChild(sec);
    }
    openModal(I18N.t("Stats · {0}", title), body, [mkBtn("Close", "primary", closeModal)]);
  }
  function columnStatsResult(tab, col) {
    const ci = tab.columns.findIndex((c) => c.name === col);
    openStatsModal(col, statsFromValues(tab.rows.map((r) => Array.isArray(r) ? r[ci] : r[col])));
  }
  async function columnStatsBrowse(col) {
    const t = quoteIfNeeded(browse.table), q = quoteIfNeeded(col);
    const w = browse.where ? ` WHERE ${browse.where}` : "";
    const aggSql =
      `SELECT COUNT(*) c, COUNT(${q}) nn, COUNT(DISTINCT ${q}) d, MIN(${q}) mn, MAX(${q}) mx, ` +
      `SUM(CASE WHEN typeof(${q}) IN ('integer','real') THEN ${q} END) sm, ` +
      `AVG(CASE WHEN typeof(${q}) IN ('integer','real') THEN ${q} END) av, ` +
      `SUM(CASE WHEN ${q} IS NOT NULL AND typeof(${q}) NOT IN ('integer','real') THEN 1 ELSE 0 END) nonnum FROM ${t}${w}`;
    const aggRes = await API.query(state.db, aggSql, false, false);
    if (aggRes.error) return toast(aggRes.error, "err");
    const ar = aggRes.results[0], g = (n) => ar.rows[0][ar.columns.indexOf(n)];
    const count = g("c"), nn = g("nn"), numeric = nn > 0 && g("nonnum") === 0;
    const topRes = await API.query(state.db,
      `SELECT ${q} v, COUNT(*) n FROM ${t}${w} GROUP BY ${q} ORDER BY n DESC LIMIT 8`, false, false);
    const top = topRes.error ? [] : topRes.results[0].rows.map((r) => [r[0], r[1]]);
    openStatsModal(col, {
      count, nonNull: nn, nulls: count - nn, distinct: g("d"),
      min: g("mn"), max: g("mx"), numeric, sum: numeric ? g("sm") : null, avg: numeric ? g("av") : null, top,
    });
  }

  // ---- save a result grid as a new table ----
  function saveResultAsTable(tab) {
    const stmt = (tab.statement || "").trim().replace(/;+\s*$/, "");
    if (!/^(select|with)\b/i.test(stmt))
      return toast("Only query (SELECT) results can be saved as a table.", "err");
    const body = el("div");
    body.innerHTML =
      `<div class="field"><label>New table name</label>
         <input id="satName" type="text" placeholder="my_table" /></div>
       <div class="hint">Runs <code>CREATE TABLE … AS</code> against <b>${esc(state.db)}</b>.</div>`;
    const go = mkBtn("Create", "primary", async () => {
      const name = body.querySelector("#satName").value.trim();
      if (!name) return toast("Table name required", "err");
      if (S.readOnly) return toast("Read-only mode is on (see Settings).", "err");
      const res = await API.query(state.db, `CREATE TABLE ${quoteIfNeeded(name)} AS ${stmt}`, false, S.autoBackup);
      if (res.error) return toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      closeModal();
      toast(I18N.t("Created {0}", name), "ok");
      await refreshSchema();
    });
    openModal("Save result as table", body, [mkBtn("Cancel", "ghost", closeModal), go]);
    setTimeout(() => { const i = body.querySelector("#satName"); i.focus(); i.onkeydown = (ev) => { if (ev.key === "Enter") go.click(); }; }, 30);
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

  function downloadBlob(filename, blob) {
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function downloadText(filename, text, type = "text/csv") {
    downloadBlob(filename, new Blob([text], { type }));
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
        I18N.t("No saved filters yet.<br>Browse a table with a WHERE filter, then press ＋ above to keep it.")));
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
              const body = el("div");
              body.innerHTML = `<div class="field"><label>Filter name</label>
                <input id="bfRenameName" type="text" /></div>`;
              const input = body.querySelector("#bfRenameName");
              input.value = f.name;
              const go = mkBtn("Rename", "primary", () => {
                const nn = input.value.trim();
                if (!nn) return toast("Filter name required", "err");
                list[i].name = nn;
                saveBFilters(list);
                closeModal();
              });
              openModal("Rename filter", body, [mkBtn("Cancel", "ghost", closeModal), go]);
              setTimeout(() => { input.focus(); input.select(); input.onkeydown = (ev) => { if (ev.key === "Enter") go.click(); }; }, 30);
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
         <input type="text" id="bfName" placeholder="e.g. Active users" /></div>
       <div class="field"><label>WHERE filter for <b>${esc(browse.table)}</b></label>
         <input type="text" id="bfWhere" value="${esc(browse.where || "")}" placeholder="price > 100 AND category = 'Audio'" /></div>
       <div class="field"><div class="hint">Stored in this browser, per database.</div></div>`;
    const nameI = body.querySelector("#bfName");
    const whereI = body.querySelector("#bfWhere");
    const go = mkBtn("Save filter", "primary", () => {
      const name = nameI.value.trim(), where = whereI.value.trim();
      if (!name || !where) return;
      const list = loadBFilters();
      list.push({ name, table: browse.table, where });
      saveBFilters(list);
      closeModal();
      toast("Filter saved", "ok");
    });
    const validate = () => { go.disabled = !(nameI.value.trim() && whereI.value.trim()); };
    nameI.oninput = validate; whereI.oninput = validate; validate();
    openModal("Save filter", body, [mkBtn("Cancel", "ghost", closeModal), go]);
    setTimeout(() => nameI.focus(), 30);
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
      `<span class="stat">${esc(I18N.t("{0} rows · showing {1}–{2}", r.total, r.rows.length ? start : 0, end))}</span>` +
      (r.has_rowid ? "" : `<span style="color:var(--yellow)">read-only (no rowid)</span>`) +
      `<span class="spacer"></span>`;
    bar.appendChild(mkBtn(ICON("plus") + "Add row", "ghost", () => addRowDialog()));
    bar.appendChild(mkBtn(ICON("upload") + "Import", "ghost", () => importDialog(browse.table)));
    const bExp = mkBtn(ICON("download") + "Export", "ghost", () => {});
    bExp.onclick = (e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      showCtxMenu(r.left, r.bottom + 4, exportItems(browse.table));
    };
    bar.appendChild(bExp);
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
    gridSel = null;
    const r = browse.data;
    const editable = r.has_rowid;
    const table = el("table", "grid");
    table.setAttribute("data-noi18n", ""); // cell data — never translate
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
      const rnTd = el("td", "rownum", r.offset + i + 1); rnTd.dataset.r = i; tr.appendChild(rnTd);
      r.columns.forEach((c, ci) => {
        const td = cellTd(row[c.name]);
        td.dataset.r = i; td.dataset.c = ci;
        if (editable && !isBlob(row[c.name])) {
          td.classList.add("editable");
          td.ondblclick = () => beginEdit(td, rowid, c.name, row[c.name], c.type);
        }
        td.oncontextmenu = (e) => cellContextMenu(e, { row, rowid, col: c.name, value: row[c.name], editable });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    table._cells = r.rows.map((row) => r.columns.map((c) => row[c.name]));
    table._cols = r.columns.map((c) => c.name);
    table._srcTable = browse.table;
    enableRangeSelect(table);
    return table;
  }

  // ---- typed cell editors (text / number / date / datetime / time / bool) ----
  function colEditorKind(type, oldVal) {
    const t = String(type || "").toUpperCase();
    if (t) {
      if (/BOOL/.test(t)) return "bool";
      if (/DATETIME|TIMESTAMP/.test(t)) return "datetime";
      if (/DATE/.test(t)) return "date";
      if (/TIME/.test(t)) return "time";
      if (/INT|REAL|FLOA|DOUB|NUM|DEC/.test(t)) return "number";
      return "text";
    }
    return typeof oldVal === "number" ? "number" : "text";
  }
  const toDateVal = (v) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(v == null ? "" : String(v)); return m ? m[1] : ""; };
  const toDateTimeVal = (v) => {
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(v == null ? "" : String(v));
    return m ? `${m[1]}T${m[2]}` : (toDateVal(v) ? toDateVal(v) + "T00:00" : "");
  };
  // returns { root, read(), focus(), live } — `live` editors (checkbox) commit
  // on change and cancel on blur instead of committing on blur.
  function makeCellInput(kind, oldVal) {
    if (kind === "bool") {
      const cb = el("input", "cell-edit cell-bool"); cb.type = "checkbox";
      cb.checked = oldVal === 1 || oldVal === "1" || oldVal === true || String(oldVal).toLowerCase() === "true";
      return { root: cb, read: () => (cb.checked ? "1" : "0"), focus: () => cb.focus(), live: true };
    }
    const input = el("input", "cell-edit");
    if (kind === "number") { input.type = "text"; input.inputMode = "decimal"; input.value = oldVal == null ? "" : String(oldVal); }
    else if (kind === "date") { input.type = "date"; input.value = toDateVal(oldVal); }
    else if (kind === "datetime") { input.type = "datetime-local"; input.value = toDateTimeVal(oldVal); }
    else if (kind === "time") { input.type = "time"; input.value = oldVal == null ? "" : String(oldVal).slice(0, 8); }
    else { input.type = "text"; input.value = oldVal == null ? "" : String(oldVal); }
    return {
      root: input,
      read: () => input.value === "" ? null : (kind === "datetime" ? input.value.replace("T", " ") : input.value),
      focus: () => { input.focus(); try { input.select(); } catch (_) {} },
      live: false,
    };
  }

  function beginEdit(td, rowid, col, oldVal, type) {
    if (td.classList.contains("editing")) return;
    td.classList.add("editing");
    const ed = makeCellInput(colEditorKind(type, oldVal), oldVal);
    td.textContent = "";
    td.appendChild(ed.root);
    ed.focus();
    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      const newVal = ed.read();
      const res = await API.updateRow(state.db, browse.table, { __rowid__: rowid }, { [col]: newVal });
      if (res.error) toast(res.error, "err"); else toast("Saved", "ok");
      reloadBrowse();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      td.classList.remove("editing");
      td.textContent = oldVal === null ? S.nullDisplay : String(oldVal);
      if (oldVal === null) td.className = "null editable";
    };
    ed.root.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    };
    if (ed.live) { ed.root.onchange = commit; ed.root.onblur = cancel; }
    else ed.root.onblur = commit;
  }

  async function deleteBrowseRow(rowid) {
    if (!(await askConfirm("Delete this row?", { title: "Delete row", confirmLabel: "Delete" }))) return;
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
    openModal(I18N.t("Add row to {0}", browse.table), body, [mkBtn("Cancel", "ghost", closeModal), save]);
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
      { icon: "chart", label: "Column stats", onClick: () => columnStatsBrowse(c.name) },
      { icon: "copy", label: "Copy column name", onClick: async () => {
          try { await navigator.clipboard.writeText(c.name); toast("Copied", "ok"); }
          catch (_) { toast("Clipboard blocked by browser", "err"); }
        } },
    ];
    // FK column: open the referenced table (whole table, no WHERE filter)
    const fk = browse.fks.find((f) => f.from === c.name);
    if (fk) {
      items.push({ sep: true });
      items.push({ icon: "arrow-right", label: I18N.t("Go to {0}", fk.table),
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
        label: I18N.t("Go to {0}.{1} = {2}", fk.table, fk.to, String(ctx.value).slice(0, 20)),
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
       <div class="checkrow"><input type="checkbox" id="impHeader" checked /> First row is a header (CSV / Excel)</div>
       <div class="checkrow"><input type="checkbox" id="impCreate" /> Create table if it doesn't exist</div>
       <div class="checkrow"><input type="checkbox" id="impReplace" /> Replace rows with a matching primary key (otherwise duplicates are rejected)</div>
       <div class="field">
         <label>Choose a CSV / JSON / Excel file, or paste CSV / JSON below</label>
         <input type="file" id="impFile" accept=".csv,.tsv,.json,.xlsx,text/csv,application/json" />
         <textarea id="impText" placeholder="id,name,age&#10;1,Alice,30&#10;&#10;— or —&#10;[{&quot;id&quot;: 1, &quot;name&quot;: &quot;Alice&quot;}]"></textarea>
         <div class="hint" id="impNote"></div>
       </div>`;
    const fileInput = body.querySelector("#impFile");
    const textArea = body.querySelector("#impText");
    const note = body.querySelector("#impNote");
    let loaded = { fmt: "csv", rows: null };
    fileInput.onchange = async () => {
      const f = fileInput.files[0];
      if (!f) return;
      note.textContent = "";
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (ext === "xlsx") {
        try {
          const parsed = await XLSXMini.parse(await f.arrayBuffer());
          const sh = parsed.sheets[0];
          if (!sh || !sh.rows.length) return toast("No rows found in the spreadsheet", "err");
          loaded = { fmt: "xlsx", rows: sh.rows };
          textArea.value = ""; textArea.disabled = true;
          note.textContent = `Excel loaded — sheet “${sh.name}”, ${sh.rows.length} row(s) × ${sh.rows[0].length} column(s).`;
        } catch (err) { toast("Couldn't read .xlsx: " + err.message, "err"); }
        return;
      }
      textArea.disabled = false;
      loaded = { fmt: ext === "json" ? "json" : "csv", rows: null };
      const reader = new FileReader();
      reader.onload = () => { textArea.value = reader.result; };
      reader.readAsText(f);
    };
    const run = mkBtn("Import", "primary", async () => {
      const table = body.querySelector("#impTable").value.trim();
      if (!table) return toast("Target table required", "err");
      if (S.readOnly) return toast("Read-only mode is on (see Settings).", "err");
      const header = body.querySelector("#impHeader").checked;
      const create = body.querySelector("#impCreate").checked;
      const mode = body.querySelector("#impReplace").checked ? "upsert" : "append";
      let res;
      if (loaded.fmt === "xlsx") {
        const rows = loaded.rows;
        const keys = (header ? rows[0] : rows[0].map(() => null))
          .map((h, i) => (h == null || h === "" ? `col${i + 1}` : String(h)));
        const data = (header ? rows.slice(1) : rows).map((r) => {
          const o = {}; keys.forEach((k, i) => (o[k] = r[i] === undefined ? null : r[i])); return o;
        });
        res = await API.importJson({ db: state.db, table, json: JSON.stringify(data), create, mode, backup: S.autoBackup });
      } else {
        const text = textArea.value;
        if (!text.trim()) return toast("Nothing to import", "err");
        res = (loaded.fmt === "json" || /^\s*[[{]/.test(text))
          ? await API.importJson({ db: state.db, table, json: text, create, mode, backup: S.autoBackup })
          : await API.importCsv({ db: state.db, table, csv: text, has_header: header, create_table: create, mode });
      }
      if (res.error) return toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      closeModal();
      toast(I18N.t("Imported {0} row(s) into {1}", res.inserted, res.table), "ok");
      await refreshSchema();
      if (!$("#browseView").hidden && browse.table === res.table) { browse.offset = 0; reloadBrowse(); }
    });
    openModal("Import data", body, [mkBtn("Cancel", "ghost", closeModal), run]);
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

  // arrow-key navigation in data grids: ↑/↓ moves the selection's anchor row
  document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    if (!gridSel || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    const t = gridSel.table, maxR = (t._cells ? t._cells.length : 0) - 1;
    if (maxR < 0) return;
    e.preventDefault();
    const nr = e.key === "ArrowDown" ? Math.min(gridSel.r0 + 1, maxR) : Math.max(gridSel.r0 - 1, 0);
    gridSel.r0 = nr; gridSel.r1 = nr;
    paintGridSel(); recordFromGridSel();
    const cell = t.querySelector(`td[data-r="${nr}"]`);
    if (cell) cell.scrollIntoView({ block: "nearest" });
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
    if (!p.hidden) recordFromGridSel(); // populate from the current selection when opened
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

  function showRecord(obj, table) {
    record.obj = obj;
    record.table = table || null;
    renderRecord();
  }

  function renderRecord() {
    const body = $("#recBody"), title = $("#recTitle");
    $$("#recModes .rec-mode").forEach((b) => b.classList.toggle("active", b.dataset.recmode === record.mode));
    if (!record.obj) {
      body.innerHTML = `<div class="rec-empty">${esc(I18N.t("Click a row in a result grid or the Browse view to inspect it and follow its foreign-key relations."))}</div>`;
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
      showRecord(o, table);
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
      toast(I18N.t("Attached as {0}", res.alias), "ok");
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
          if (!(await askConfirm(I18N.t("Replace {0} with this backup?\n(The current state is backed up first.)", state.db), { title: "Restore backup", confirmLabel: "Restore" }))) return;
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
    openModal(I18N.t("Database tools — {0}", state.db), body, [mkBtn("Close", "primary", closeModal)]);
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
     ["Import data (CSV / JSON / Excel)", () => importDialog(browse.table || "")],
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
      { icon: "upload", label: "Import data (CSV / JSON / Excel)…", onClick: () => importDialog(browse.table || "") },
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
          // System (follows the OS), then dark family / light family, separated
          return [
            { label: "System", checked: state.theme === "system", onClick: () => applyTheme("system") },
            { sep: true },
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
      { icon: "play", label: "Take the tour", onClick: startTour },
      { icon: "keyboard", label: "Keyboard shortcuts", onClick: shortcutsModal },
      { icon: "book", label: "SQL syntax reference", onClick: () => railSelect("syntax") },
      { sep: true },
      { icon: "info", label: "About SequenceLab", onClick: aboutModal },
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
       <p style="margin:0 0 8px;color:var(--muted);line-height:1.6">A local SQLite workbench. Databases as real .db files, everything fully offline — no cloud, no account, no telemetry.</p>
       <p style="margin:0;color:var(--faint);font-size:12px">Frontend: vanilla HTML/CSS/JS · Backend: sql.js + sqlite3</p>`;
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
           ${h.row_count != null ? `<span>${esc(I18N.t("{0} rows", h.row_count))}</span>` : ""}
         </div>`;
      item.title = h.sql;
      item.onclick = () => { editor.setValue(h.sql); editor.focus(); };
      list.appendChild(item);
    });
    if (!(res.history || []).length)
      list.appendChild(el("div", "msg-block",
        `<span style="color:var(--text-faint)">${esc(I18N.t("No queries yet for this database."))}</span>`));
  }

  $("#btnClearHistory").onclick = async () => {
    if (!(await askConfirm("Clear all query history?", { title: "Clear history", confirmLabel: "Clear all" }))) return;
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
        if (!(await askConfirm(I18N.t("Delete snippet \"{0}\"?", s.title), { title: "Delete snippet", confirmLabel: "Delete" }))) return;
        await API.deleteSnippet(s.id);
        loadSnippets();
      };
      list.appendChild(item);
    });
    if (!(res.snippets || []).length)
      list.appendChild(el("div", "msg-block",
        `<span style="color:var(--text-faint)">${I18N.t("No saved snippets.<br>Write SQL, then click ＋.<br><br>Tip: <code>${name}</code> placeholders prompt on insert, <code>${cursor}</code> sets the caret.")}</span>`));
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
    openModal, closeModal, mkBtn, mkSelect, el, esc, showCtxMenu, askConfirm,
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

  // ============================================================ ONBOARDING
  // First-run: a 3-page wizard (language → theme → tutorial), then an optional
  // guided spotlight tour through the side rail's tabs and sub-tabs.
  const ONBOARD_KEY = "sl.onboarded";

  function backArrow(onClick) {
    const b = el("button", "btn icon ob-back", ICON("arrow-left") || ICON("chevron-left"));
    b.title = I18N.t("Back");
    b.onclick = onClick;
    return b;
  }

  // --- the wizard --------------------------------------------------------
  function startWizard() {
    finishOnboarding();   // one-time auto-show; replay later via Help → Take the tour
    wizardLang();
  }

  function wizardLang() {
    const body = el("div", "ob-page");
    body.innerHTML =
      `<div class="ob-welcome">
         <div class="ob-logo">Se<span class="brand-accent">Q</span>uenceLab</div>
         <p class="ob-lead">Welcome! Choose your language to begin.</p>
         <p class="ob-lead ob-lead-alt">Bienvenue ! Choisissez votre langue pour commencer.</p>
       </div>`;
    const row = el("div", "ob-langrow");
    row.appendChild(mkSelect(
      I18N.langs.map((l) => [l.code, l.label]), I18N.lang,
      (v) => I18N.set(v), "set-select ob-langsel"));
    body.appendChild(row);
    const next = mkBtn(I18N.t("Next") + (ICON("arrow-right") || ""), "primary", wizardTheme);
    openModal("SequenceLab", body, [next]);
  }

  function wizardTheme() {
    const body = el("div", "ob-page");
    const head = el("div", "ob-pagehead");
    head.appendChild(backArrow(wizardLang));
    head.appendChild(el("div", "ob-pagetitle", I18N.t("Pick a theme")));
    body.appendChild(head);
    body.appendChild(el("p", "ob-lead", I18N.t("You can change this any time in Settings.")));
    body.appendChild(themePickerNode());
    const next = mkBtn(I18N.t("Next") + (ICON("arrow-right") || ""), "primary", wizardTutorial);
    openModal("SequenceLab", body, [next]);
  }

  function wizardTutorial() {
    const body = el("div", "ob-page");
    const head = el("div", "ob-pagehead");
    head.appendChild(backArrow(wizardTheme));
    head.appendChild(el("div", "ob-pagetitle", I18N.t("Have a look around")));
    body.appendChild(head);
    body.appendChild(el("p", "ob-lead",
      I18N.t("Take a quick guided tour of every panel, or jump straight in — you can replay the tour any time from the Help menu.")));
    const skip = mkBtn(I18N.t("Skip"), "ghost", () => { finishOnboarding(); closeModal(); });
    const go = mkBtn(I18N.t("Take the tour"), "primary", () => { finishOnboarding(); closeModal(); startTour(); });
    openModal("SequenceLab", body, [skip, go]);
  }

  // a compact theme picker (System + dark + light) for the wizard
  function themePickerNode() {
    const wrap = el("div", "ob-themes");
    const card = (id, name, sub, dot) => {
      const c = el("button", "theme-card" + (state.theme === id ? " active" : ""));
      c.innerHTML =
        `<span class="theme-dot" style="background:${dot}"></span>` +
        `<span class="theme-name">${esc(I18N.t(name))}</span><span class="theme-sub">${esc(I18N.t(sub))}</span>`;
      c.onclick = () => {
        applyTheme(id);
        $$(".theme-card", wrap).forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
      };
      return c;
    };
    const grid = el("div", "theme-grid");
    grid.appendChild(card("system", "System", "follows your OS",
      "linear-gradient(135deg,#7b6cf6 0 50%,#5b4ee0 50% 100%)"));
    THEMES.forEach((t) => grid.appendChild(card(t.id, t.name, t.sub, t.dot)));
    wrap.appendChild(grid);
    return wrap;
  }

  function finishOnboarding() { localStorage.setItem(ONBOARD_KEY, "1"); }

  // --- debug / reset helpers --------------------------------------------
  function wipeLocalState() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sl."))
      .forEach((k) => localStorage.removeItem(k));
  }
  async function wipeCachesAndSW() {
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (_) {}
    try {
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (_) {}
  }

  // --- the spotlight tour ------------------------------------------------
  // each step highlights a target and explains it; `before` puts the app in
  // the right state (switches rail tab) so the panel is actually visible.
  function tourSteps() {
    return [
      { sel: ".rail", before: () => railSelect("editor"),
        title: "The side rail",
        body: "These icons switch between the three workspaces — Editor, Browse and Diagram — and their sub-panels. Let's walk through each." },
      { sel: '.rail-btn[data-rail="editor"]', before: () => railSelect("editor"),
        title: "Editor",
        body: "Write and run SQL. You get syntax highlighting, autocomplete, keyword auto-capitalize, one-click formatting, and multiple draggable query tabs." },
      { sel: "#btnRun", before: () => railSelect("editor"),
        title: "Run",
        body: "Run everything, just the selection, or only the statement under the caret — the ▾ menu also explains the query plan. Shortcut: Ctrl+Enter." },
      { sel: '.rail-btn[data-rail="files"]', before: () => railSelect("files"),
        title: "Files",
        body: "Your databases, stored as real .db files in the browser. Create, open/import a .db, or live-link a file on disk so edits save straight back." },
      { sel: '.rail-btn[data-rail="snippets"]', before: () => railSelect("snippets"),
        title: "Snippets",
        body: "Save reusable SQL. Use ${name} placeholders that prompt on insert and ${cursor} to drop the caret where you need it." },
      { sel: '.rail-btn[data-rail="history"]', before: () => railSelect("history"),
        title: "History",
        body: "Every query you run is logged with its status and timing — click one to load it back into the editor." },
      { sel: '.rail-btn[data-rail="syntax"]', before: () => railSelect("syntax"),
        title: "Syntax reference",
        body: "A clickable cheat-sheet for every SQL statement plus a grouped function reference. Click an example to drop it into the editor." },
      { sel: '.rail-btn[data-rail="browse"]', before: () => railSelect("browse"),
        title: "Browse",
        body: "A spreadsheet-style view of any table: edit cells inline, sort, per-column filters, range-select & copy, add/clone/delete rows, and export." },
      { sel: '.rail-btn[data-rail="bfilters"]', before: () => railSelect("bfilters"),
        title: "Saved filters",
        body: "Keep table + WHERE filters you use often and reapply them in one click." },
      { sel: '.rail-btn[data-rail="diagram"]', before: () => railSelect("diagram"),
        title: "Diagram",
        body: "An ER diagram of your schema: drag the cards, draw a foreign key by dragging one column onto another, auto-layout, and export to PNG or SVG." },
      { sel: '.rail-btn[data-rail="dlayouts"]', before: () => railSelect("dlayouts"),
        title: "Layouts",
        body: "Save several named arrangements of the diagram and switch between them." },
      { sel: '.rail-btn[data-rail="dnotes"]', before: () => railSelect("dnotes"),
        title: "Legend & notes",
        body: "Drop sticky notes on the canvas and tag tables with colors, with a legend explaining what each color means." },
      { sel: "#btnSettings", before: () => {},
        title: "Settings",
        body: "Language, theme, editor behavior, safety (read-only, confirm destructive, preview writes), display and data options all live here." },
    ];
  }

  let tour = null;
  function startTour() {
    const steps = tourSteps();
    const overlay = el("div", "tour-overlay");
    const spot = el("div", "tour-spot");
    const pop = el("div", "tour-pop");
    overlay.appendChild(spot);
    overlay.appendChild(pop);
    document.body.appendChild(overlay);
    tour = { steps, i: 0, overlay, spot, pop };
    const onResize = () => positionTour();
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); endTour(); } };
    tour.onResize = onResize;
    tour.onKey = onKey;
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey, true);
    showStep(0);
  }

  function endTour() {
    if (!tour) return;
    window.removeEventListener("resize", tour.onResize);
    document.removeEventListener("keydown", tour.onKey, true);
    tour.overlay.remove();
    tour = null;
  }

  function showStep(i) {
    if (!tour) return;
    if (i < 0 || i >= tour.steps.length) return endTour();
    tour.i = i;
    const step = tour.steps[i];
    try { step.before && step.before(); } catch (_) {}
    // let the view settle (rail switch may change layout) before measuring
    requestAnimationFrame(() => requestAnimationFrame(() => renderStep()));
  }

  function renderStep() {
    if (!tour) return;
    const step = tour.steps[tour.i];
    const { pop } = tour;
    pop.innerHTML =
      `<div class="tour-step">${tour.i + 1} / ${tour.steps.length}</div>` +
      `<div class="tour-title">${esc(I18N.t(step.title))}</div>` +
      `<div class="tour-body">${esc(I18N.t(step.body))}</div>`;
    const foot = el("div", "tour-foot");
    foot.appendChild(mkBtn(I18N.t("Skip tour"), "ghost tour-skip", endTour));
    const spacer = el("span", "tour-spacer"); foot.appendChild(spacer);
    if (tour.i > 0) foot.appendChild(mkBtn(I18N.t("Back"), "ghost", () => showStep(tour.i - 1)));
    const last = tour.i === tour.steps.length - 1;
    foot.appendChild(mkBtn(last ? I18N.t("Done") : I18N.t("Next"), "primary",
      () => (last ? endTour() : showStep(tour.i + 1))));
    pop.appendChild(foot);
    positionTour();
  }

  function positionTour() {
    if (!tour) return;
    const step = tour.steps[tour.i];
    const target = $(step.sel);
    const { spot, pop } = tour;
    if (!target) { spot.style.display = "none"; }
    else {
      spot.style.display = "";
      const r = target.getBoundingClientRect();
      const pad = 6;
      spot.style.left = (r.left - pad) + "px";
      spot.style.top = (r.top - pad) + "px";
      spot.style.width = (r.width + pad * 2) + "px";
      spot.style.height = (r.height + pad * 2) + "px";
    }
    // place the callout: prefer to the right of the target, else below, else centered
    const pr = pop.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left, top;
    if (target) {
      const r = target.getBoundingClientRect();
      if (r.right + 16 + pr.width <= vw) {            // right
        left = r.right + 16; top = Math.min(Math.max(8, r.top), vh - pr.height - 8);
      } else if (r.bottom + 16 + pr.height <= vh) {   // below
        top = r.bottom + 16; left = Math.min(Math.max(8, r.left), vw - pr.width - 8);
      } else {                                        // left of target
        left = Math.max(8, r.left - 16 - pr.width); top = Math.min(Math.max(8, r.top), vh - pr.height - 8);
      }
    } else {
      left = (vw - pr.width) / 2; top = (vh - pr.height) / 2;
    }
    pop.style.left = Math.round(left) + "px";
    pop.style.top = Math.round(top) + "px";
  }

  // ============================================================ BOOT
  async function boot() {
    applyTheme(state.theme);
    if (appZoom !== 1) document.body.style.zoom = appZoom;
    if (editorFs !== 13.5) document.documentElement.style.setProperty("--editor-fs", editorFs + "px");
    applySettings();
    initEditor();
    // editor lives in an i18n-excluded zone, so set its placeholder explicitly
    $("#sqlInput").placeholder = I18N.t("-- Write SQL here.  Ctrl+Enter to run.");
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
    // first run: show the welcome wizard once
    if (!localStorage.getItem(ONBOARD_KEY)) setTimeout(startWizard, 400);
  }
  // re-render content the DOM pass can't reach (source-wrapped strings in
  // excluded zones + tab titles stored as concrete strings) on a live switch.
  I18N.onChange(() => {
    const sqlInput = $("#sqlInput");
    if (sqlInput) sqlInput.placeholder = I18N.t("-- Write SQL here.  Ctrl+Enter to run.");
    renderQueryTabs();
    renderTabs();
    renderActiveResult();
    renderBrowseFilters();
    if (!$("#browseView").hidden && browse.table) renderBrowseMain();
    renderRecord();
    if (state.tables) renderSchemaTree(state.tables);
    loadSnippets();
    loadHistory();
    if (window.ERD && ERD.relocalize) ERD.relocalize();
  });

  boot();
})();
