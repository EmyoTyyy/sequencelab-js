/* =================================================================== *
 *  SequenceLab — ER diagram view.
 *  Draggable table cards, highlighted primary keys, FK connector lines
 *  between the exact linked columns, pan/zoom, PNG/SVG export, and a
 *  left-side column editor (ALTER TABLE). Layout persists per database.
 * =================================================================== */
window.ERD = (function () {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const HDR = 30;            // approx header height (measured at draw time)
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function h(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  const st = {
    db: null,
    tables: [],
    pos: {},            // { table: {x, y} }
    zoom: 1,
    pan: { x: 0, y: 0 },
    selected: null,
    layouts: {},        // { name: { table: {x, y} } }  saved arrangements
    notes: [],          // [ {id, x, y, color, text} ]  sticky notes on the canvas
    legend: [],         // [ {color, label} ]           what each tag color means
    tags: {},           // { table: color }             color stripe on a card
  };

  // tag / note colors (theme-independent so they keep meaning across themes)
  const TAG_COLORS = ["#f5b945", "#3ecf8e", "#7aa2f7", "#ff7eb6", "#b08cff", "#f06a6a"];

  let dom = {};

  function init() {
    dom = {
      view: $("#diagramView"),
      canvas: $("#erCanvas"),
      pan: $("#erPan"),
      lines: $("#erLines"),
      cards: $("#erCards"),
      empty: $("#erEmpty"),
      list: $("#erTableList"),
      editor: $("#erEditor"),
      zoomVal: $("#erZoomVal"),
      notes: $("#erNotes"),
      layoutList: $("#erLayoutList"),
      legend: $("#erLegend"),
    };
    $("#erZoomIn").onclick = () => zoomBy(1.15);
    $("#erZoomOut").onclick = () => zoomBy(1 / 1.15);
    $("#erFit").onclick = fit;
    $("#erAutoLayout").onclick = () => { autoLayout(); render(); save(); };
    $("#erExportSvg").onclick = exportSvg;
    $("#erExportPng").onclick = exportPng;
    $("#erNewTable").onclick = newTableDialog;
    $("#erLayoutSave").onclick = saveLayoutAs;
    $("#erAutoLink").onclick = () => {
      const wasOn = SLApp.autoLink();
      SLApp.setAutoLink(!wasOn);
      if (wasOn) autoDismissed.clear();    // leaving proposal mode — forget removals
      syncAutoLinkBtn();
      if (st.db) open(st.db);              // re-fetch so inferred links appear/disappear
    };
    $("#erAutoConfirm").onclick = confirmAutoLinks;
    syncAutoLinkBtn();
    wirePanZoom();
  }
  let currentDiagramPanel = "tables";
  function pendingAutoLinks() {
    let n = 0;
    (st.tables || []).forEach((t) => (t.foreign_keys || []).forEach((fk) => {
      if (fk.auto && !autoDismissed.has(linkKey(t.name, fk))) n++;
    }));
    return n;
  }
  function syncAutoLinkBtn() {
    const on = !!SLApp.autoLink();
    const b = $("#erAutoLink");
    if (b) b.classList.toggle("active", on);
    // Confirm shows only on the diagram (Tables) view while there are proposals
    // left to commit — so it hides after confirming and on any tab change.
    const c = $("#erAutoConfirm");
    if (c) c.hidden = !(on && currentDiagramPanel === "tables" && pendingAutoLinks() > 0);
  }

  // which sub-panel of the left aside is showing: tables | layouts | notes
  function setSidePanel(p) {
    currentDiagramPanel = p;
    document.querySelectorAll(".diagram-side .side-sub-panel")
      .forEach((n) => (n.hidden = n.dataset.ds !== p));
    if (p === "layouts") renderLayoutList();
    if (p === "notes") renderLegend();
    syncAutoLinkBtn();
  }

  // ----------------------------------------------------------------- load
  async function open(db) {
    st.db = db;
    readPalette();
    const res = await API.diagram(db);
    if (res.error) {
      SLApp.toast(res.error, "err");
      return;
    }
    st.tables = res.tables || [];
    loadLayout();
    cascade = null; // note cascade restarts per database
    // place any table that has no saved position
    const missing = st.tables.filter((t) => !st.pos[t.name]);
    if (missing.length === st.tables.length) autoLayout();
    else missing.forEach((t, i) => (st.pos[t.name] = { x: 40 + i * 40, y: 40 + i * 40 }));
    renderList();
    render();
    renderNotes();
    if (st.selected && !st.tables.find((t) => t.name === st.selected)) st.selected = null;
    renderEditor();
    // refresh whichever side panel is currently visible
    const open_ = document.querySelector(".diagram-side .side-sub-panel:not([hidden])");
    if (open_ && open_.dataset.ds === "layouts") renderLayoutList();
    if (open_ && open_.dataset.ds === "notes") renderLegend();
    syncAutoLinkBtn();   // reflect proposal count (hides Confirm once none remain)
  }

  function storageKey() { return "sl.erd." + st.db; }
  function loadLayout() {
    st.pos = {};
    st.zoom = 1;
    st.pan = { x: 0, y: 0 };
    st.layouts = {}; st.notes = []; st.legend = []; st.tags = {};
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      st.pos = raw.pos || {};
      st.zoom = raw.zoom || 1;
      st.pan = raw.pan || { x: 0, y: 0 };
      st.layouts = raw.layouts || {};
      st.notes = raw.notes || [];
      st.legend = raw.legend || [];
      st.tags = raw.tags || {};
    } catch (e) {}
  }
  function save() {
    localStorage.setItem(storageKey(), JSON.stringify({
      pos: st.pos, zoom: st.zoom, pan: st.pan,
      layouts: st.layouts, notes: st.notes, legend: st.legend, tags: st.tags,
    }));
  }

  // Layered layout: group tables by their FK-connected cluster, lay each cluster
  // out left-to-right by distance from its hub, and order tables within each
  // column by the average position of their neighbors (barycenter heuristic) so
  // the links cross as little as possible. Unconnected tables pack into a grid.
  function autoLayout() {
    // generous gaps + per-table size estimates so cards never overlap and links
    // have room to breathe
    const COL_GAP = 120, ROW_GAP = 64, BAND_GAP = 110, X0 = 40, Y0 = 40;
    const HEADER_H = 36, COL_H = 28, CARD_PAD = 4; // matches the card CSS roughly
    const tables = st.tables;
    if (!tables.length) { st.pan = { x: 0, y: 0 }; st.zoom = 1; return; }
    // estimate each card's rendered size from its column count / longest label
    const size = {};
    tables.forEach((t) => {
      const cols = t.columns || [];
      let maxLen = (t.name || "").length + 4;
      cols.forEach((c) => (maxLen = Math.max(maxLen, (c.name || "").length + (c.type || "").length + 5)));
      size[t.name] = {
        w: Math.max(186, Math.min(360, 56 + maxLen * 6.8)),
        h: HEADER_H + Math.max(1, cols.length) * COL_H + CARD_PAD,
      };
    });
    const names = tables.map((t) => t.name);
    const adj = {};
    names.forEach((n) => (adj[n] = new Set()));
    tables.forEach((t) => (t.foreign_keys || []).forEach((fk) => {
      if (adj[fk.table] && fk.table !== t.name) { adj[t.name].add(fk.table); adj[fk.table].add(t.name); }
    }));
    const deg = (n) => adj[n].size;
    // connected components, most-connected first
    const seen = new Set(), comps = [];
    names.slice().sort((a, b) => deg(b) - deg(a)).forEach((n) => {
      if (seen.has(n)) return;
      const comp = [], q = [n]; seen.add(n);
      while (q.length) {
        const x = q.shift(); comp.push(x);
        [...adj[x]].forEach((m) => { if (!seen.has(m)) { seen.add(m); q.push(m); } });
      }
      comps.push(comp);
    });
    let cursorY = Y0;
    comps.filter((c) => c.length > 1).forEach((comp) => {
      // BFS layering from the most-connected node → x column = distance from hub
      const root = comp.slice().sort((a, b) => deg(b) - deg(a))[0];
      const layer = { [root]: 0 }, q = [root];
      while (q.length) {
        const x = q.shift();
        [...adj[x]].forEach((m) => {
          if (comp.indexOf(m) >= 0 && layer[m] === undefined) { layer[m] = layer[x] + 1; q.push(m); }
        });
      }
      let maxL = 0; comp.forEach((n) => { if (layer[n] === undefined) layer[n] = 0; maxL = Math.max(maxL, layer[n]); });
      const byLayer = [];
      for (let L = 0; L <= maxL; L++) byLayer[L] = [];
      comp.forEach((n) => byLayer[layer[n]].push(n));
      byLayer.forEach((arr) => arr.sort((a, b) => deg(b) - deg(a)));
      const idx = {};
      const reindex = () => byLayer.forEach((arr) => arr.forEach((n, i) => (idx[n] = i)));
      reindex();
      // barycenter sweeps (alternating direction) minimize link crossings
      for (let s = 0; s < 4; s++) {
        const fwd = s % 2 === 0;
        const seq = byLayer.map((_, i) => i);
        if (!fwd) seq.reverse();
        seq.forEach((L) => {
          const nb = fwd ? L - 1 : L + 1;
          if (nb < 0 || nb > maxL) return;
          byLayer[L] = byLayer[L]
            .map((n) => {
              const ns = [...adj[n]].filter((m) => layer[m] === nb);
              const bc = ns.length ? ns.reduce((acc, m) => acc + idx[m], 0) / ns.length : idx[n];
              return { n, bc };
            })
            .sort((a, b) => a.bc - b.bc)
            .map((o) => o.n);
          reindex();
        });
      }
      // x by cumulative real column widths; each layer's stack sized by real heights
      const layerW = byLayer.map((arr) => Math.max.apply(null, arr.map((n) => size[n].w)));
      const layerX = []; let x = X0;
      for (let L = 0; L <= maxL; L++) { layerX[L] = x; x += layerW[L] + COL_GAP; }
      const layerH = byLayer.map((arr) =>
        arr.reduce((a, n) => a + size[n].h, 0) + ROW_GAP * Math.max(0, arr.length - 1));
      const bandH = Math.max.apply(null, layerH.concat(0));
      byLayer.forEach((arr, L) => {
        let y = cursorY + (bandH - layerH[L]) / 2; // center each layer in the band
        arr.forEach((n) => { st.pos[n] = { x: layerX[L], y }; y += size[n].h + ROW_GAP; });
      });
      cursorY += bandH + BAND_GAP;
    });
    // unconnected tables → a tidy size-aware grid band at the bottom
    const singles = comps.filter((c) => c.length === 1).map((c) => c[0]);
    if (singles.length) {
      const perRow = Math.max(1, Math.round(Math.sqrt(singles.length)));
      let x = X0, y = cursorY, rowH = 0, i = 0;
      singles.forEach((n) => {
        if (i === perRow) { i = 0; x = X0; y += rowH + ROW_GAP; rowH = 0; }
        st.pos[n] = { x, y };
        x += size[n].w + COL_GAP; rowH = Math.max(rowH, size[n].h); i++;
      });
    }
    st.pan = { x: 0, y: 0 };
    st.zoom = 1;
  }

  // ----------------------------------------------------------------- render
  function render() {
    dom.cards.innerHTML = "";
    dom.empty.hidden = st.tables.length > 0;
    st.tables.forEach((t) => dom.cards.appendChild(buildCard(t)));
    applyTransform();
    requestAnimationFrame(drawLines); // measure after layout
  }

  function buildCard(t) {
    const p = st.pos[t.name] || { x: 40, y: 40 };
    const card = h("div", "er-card");
    card.dataset.table = t.name;
    card.style.left = p.x + "px";
    card.style.top = p.y + "px";
    if (st.tags[t.name]) card.style.borderTop = "3px solid " + st.tags[t.name];

    const head = h("div", "er-card-head" + (t.type === "view" ? " view" : ""));
    head.innerHTML =
      `<span class="er-card-icon" title="${t.type === "view" ? "View — a saved query (read-only)" : "Table — stores rows"}">${ICON(t.type === "view" ? "eye" : "table")}</span>` +
      `<span>${esc(t.name)}</span>`;
    card.appendChild(head);

    const fkCols = new Set((t.foreign_keys || []).map((f) => f.from));
    const isView = t.type === "view";
    t.columns.forEach((c) => {
      const row = h("div", "er-card-col" + (c.pk ? " is-pk" : ""));
      row.dataset.col = c.name;
      row.innerHTML =
        `<span class="er-key">${c.pk ? ICON("key") : ""}</span>` +
        `<span class="er-cname">${esc(c.name)}</span>` +
        (fkCols.has(c.name) ? `<span class="er-fk" title="foreign key">${ICON("link")}</span>` : "") +
        `<span class="er-ctype">${esc(c.type)}</span>` +
        (isView ? "" : `<span class="er-fk-handle" title="Drag to another column to create a foreign key"></span>`);
      const handle = row.querySelector(".er-fk-handle");
      if (handle)
        handle.addEventListener("mousedown", (e) => startFkDrag(e, t.name, c.name));
      card.appendChild(row);
    });

    // draggable from anywhere on the card, not just the header
    card.addEventListener("mousedown", (e) => {
      if (e.target.closest(".er-fk-handle")) return;
      startDrag(e, t.name, card);
    });
    head.addEventListener("click", () => selectTable(t.name));
    card.addEventListener("mouseenter", () => { if (!st.dragging) highlight(t.name); });
    card.addEventListener("mouseleave", () => { if (!st.dragging) clearHighlight(); });
    return card;
  }

  // measured geometry for both line drawing and export
  function measure() {
    const out = {};
    [...dom.cards.children].forEach((card) => {
      const name = card.dataset.table;
      const cols = {};
      [...card.querySelectorAll(".er-card-col")].forEach((r) => {
        cols[r.dataset.col] = { top: r.offsetTop, h: r.offsetHeight };
      });
      out[name] = {
        x: card.offsetLeft, y: card.offsetTop,
        w: card.offsetWidth, h: card.offsetHeight, cols,
      };
    });
    return out;
  }

  function colAnchorY(g, col) {
    const c = g.cols[col];
    return c ? g.y + c.top + c.h / 2 : g.y + HDR;
  }

  // proposed auto-links the user has dismissed (per session, before confirming)
  const autoDismissed = new Set();
  const linkKey = (tname, fk) => tname + " " + fk.from + " " + fk.table + " " + fk.to;

  function drawLines() {
    const g = measure();
    let maxX = 0, maxY = 0;
    Object.values(g).forEach((b) => { maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); });
    dom.lines.setAttribute("width", maxX + 120);
    dom.lines.setAttribute("height", maxY + 80);
    dom.lines.innerHTML = "";
    const staging = !!SLApp.autoLink();
    st.tables.forEach((t) => {
      (t.foreign_keys || []).forEach((fk) => {
        if (fk.auto && autoDismissed.has(linkKey(t.name, fk))) return; // user removed it
        const s = g[t.name], d = g[fk.table];
        if (!s || !d) return;
        const r = routeLink(g, s, fk.from, d, fk.to, t.name === fk.table);
        const grp = wrapGroup(makePath(r.d, fk.auto), r.sx, r.sy, r.dx, r.dy);
        if (fk.auto && staging) {
          // a fat invisible path makes the dashed proposal easy to click to remove
          const hit = makeHitPath(r.d);
          hit.addEventListener("click", (e) => {
            e.stopPropagation();
            autoDismissed.add(linkKey(t.name, fk));
            drawLines();
          });
          grp.appendChild(hit);
        }
        dom.lines.appendChild(grp);
      });
    });
  }
  function makeHitPath(d2) {
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", d2);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "transparent");
    p.setAttribute("stroke-width", "14");
    p.setAttribute("pointer-events", "stroke"); // re-enable clicks (the SVG is pointer-events:none)
    p.style.cursor = "pointer";
    const ttl = document.createElementNS(SVGNS, "title");
    ttl.textContent = I18N.t("Click to remove this proposed link");
    p.appendChild(ttl);
    return p;
  }
  async function confirmAutoLinks() {
    const links = [];
    st.tables.forEach((t) => (t.foreign_keys || []).forEach((fk) => {
      if (fk.auto && !autoDismissed.has(linkKey(t.name, fk)))
        links.push({ table: t.name, column: fk.from, ref_table: fk.table, ref_column: fk.to });
    }));
    if (!links.length) return SLApp.toast(I18N.t("No auto-links to confirm."), "err");
    if (!(await SLApp.askConfirm(
      I18N.t("Create {0} foreign key(s) from the proposed auto-links?", links.length),
      { title: "Confirm auto-links", confirmLabel: "Create" }))) return;
    let okN = 0, failN = 0, lastErr = "";
    for (const l of links) {
      const res = await API.addFk({
        db: st.db, table: l.table, column: l.column,
        ref_table: l.ref_table, ref_column: l.ref_column, backup: SLApp.autoBackup(),
      });
      if (res && res.error) { failN++; lastErr = res.error; } else okN++;
    }
    if (failN) SLApp.toast(I18N.t("Created {0} of {1} — {2} failed", okN, okN + failN, failN) +
      (lastErr ? " — " + lastErr : ""), failN === links.length ? "err" : "ok");
    else SLApp.toast(I18N.t("Created {0} foreign key(s)", okN), "ok");
    await open(st.db); // refresh — confirmed links are now real (solid) FKs; Confirm hides (none pending)
  }

  // how many sample points of a cubic land inside some other card
  function curveHits(g, s, d, p) {
    let hits = 0;
    for (let i = 1; i < 28; i++) {
      const t = i / 28, mt = 1 - t;
      const x = mt * mt * mt * p.sx + 3 * mt * mt * t * p.c1x + 3 * mt * t * t * p.c2x + t * t * t * p.dx;
      const y = mt * mt * mt * p.sy + 3 * mt * mt * t * p.c1y + 3 * mt * t * t * p.c2y + t * t * t * p.dy;
      for (const b of Object.values(g)) {
        if (b === s || b === d) continue;
        if (x > b.x - 2 && x < b.x + b.w + 2 && y > b.y - 2 && y < b.y + b.h + 2) { hits++; break; }
      }
    }
    return hits;
  }

  // candidate-based routing: build every sensible way the link could run —
  // classic opposite-side, classic with a vertical bulge (hops over a card
  // sitting between), and same-side loops around the corridor's outer edge —
  // sample each against all cards, and take the first clean one (or the
  // least-bad if every route collides somewhere).
  // ox/oy let the export reuse the exact same geometry, just shifted.
  function routeLink(g, s, fromCol, d, toCol, selfRef, ox = 0, oy = 0) {
    const sy = colAnchorY(s, fromCol), dy = colAnchorY(d, toCol);
    const out2 = (p) => ({
      sx: p.sx + ox, sy: sy + oy, dx: p.dx + ox, dy: dy + oy,
      d: `M ${p.sx + ox} ${sy + oy} C ${p.c1x + ox} ${p.c1y + oy} ${p.c2x + ox} ${p.c2y + oy} ${p.dx + ox} ${dy + oy}`,
    });
    if (selfRef) {
      const sx = s.x + s.w, out = sx + 36;
      return out2({ sx, dx: sx, c1x: out, c1y: sy, c2x: out, c2y: dy });
    }
    const GAP = 24;
    const cands = [];
    const add = (sx, c1x, c1y, c2x, c2y, dx) =>
      cands.push({ sx, sy, c1x, c1y, c2x, c2y, dx, dy });
    if (d.x - (s.x + s.w) >= GAP) {            // d clearly right of s
      const sx = s.x + s.w, dx = d.x;
      add(sx, sx + 50, sy, dx - 50, dy, dx);   // straight-ish
      [-90, 90, -170, 170].forEach((off) =>    // bulge over/under a blocker
        add(sx, sx + 60, sy + off, dx - 60, dy + off, dx));
    } else if (s.x - (d.x + d.w) >= GAP) {     // d clearly left of s
      const sx = s.x, dx = d.x + d.w;
      add(sx, sx - 50, sy, dx + 50, dy, dx);
      [-90, 90, -170, 170].forEach((off) =>
        add(sx, sx - 60, sy + off, dx + 60, dy + off, dx));
    }
    // same-side loops around the outer edge of every card in the y-corridor
    const yMin = Math.min(sy, dy), yMax = Math.max(sy, dy);
    let right = Math.max(s.x + s.w, d.x + d.w);
    let left = Math.min(s.x, d.x);
    Object.values(g).forEach((b) => {
      if (b.y + b.h < yMin - 14 || b.y > yMax + 14) return;
      right = Math.max(right, b.x + b.w);
      left = Math.min(left, b.x);
    });
    const costR = (right - (s.x + s.w)) + (right - (d.x + d.w));
    const costL = (s.x - left) + (d.x - left);
    const addRight = () => add(s.x + s.w, right + 38, sy, right + 38, dy, d.x + d.w);
    const addLeft = () => add(s.x, left - 38, sy, left - 38, dy, d.x);
    if (costR <= costL) { addRight(); addLeft(); } else { addLeft(); addRight(); }
    // first clean candidate wins; otherwise the one clipping the least
    let best = null;
    for (const c of cands) {
      c.hits = curveHits(g, s, d, c);
      if (c.hits === 0) { best = c; break; }
      if (!best || c.hits < best.hits) best = c;
    }
    return out2(best);
  }

  function makePath(d2, auto) {
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", d2);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", PALETTE.accent);
    p.setAttribute("stroke-width", "1.5");
    p.setAttribute("opacity", auto ? "0.5" : "0.7");
    if (auto) p.setAttribute("stroke-dasharray", "5 4"); // inferred link = dashed
    return p;
  }
  function dot(x, y, color) {
    const c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", "3.5");
    c.setAttribute("fill", color);
    return c;
  }
  function wrapGroup(path, sx, sy, dx, dy) {
    const grp = document.createElementNS(SVGNS, "g");
    grp.appendChild(path);
    grp.appendChild(dot(sx, sy, PALETTE.purple));  // FK side
    grp.appendChild(dot(dx, dy, PALETTE.warn));    // PK side
    return grp;
  }

  // ----------------------------------------------------------------- highlight
  function highlight(name) {
    const connected = new Set([name]);
    st.tables.forEach((t) => {
      (t.foreign_keys || []).forEach((fk) => {
        if (t.name === name) connected.add(fk.table);
        if (fk.table === name) connected.add(t.name);
      });
    });
    [...dom.cards.children].forEach((card) => {
      const n = card.dataset.table;
      card.classList.toggle("highlight", n === name);
      card.classList.toggle("dim", !connected.has(n));
    });
  }
  function clearHighlight() {
    [...dom.cards.children].forEach((c) => c.classList.remove("highlight", "dim"));
  }
  // drag feedback: every table except the dragged one dims
  function dimOthers(name) {
    [...dom.cards.children].forEach((card) => {
      const self = card.dataset.table === name;
      card.classList.toggle("highlight", self);
      card.classList.toggle("dim", !self);
    });
  }

  // ----------------------------------------------------------------- FK drag
  function panCoords(ev) {
    const rect = dom.canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left - st.pan.x) / st.zoom,
      y: (ev.clientY - rect.top - st.pan.y) / st.zoom,
    };
  }

  function startFkDrag(e, table, col) {
    e.preventDefault();
    e.stopPropagation();
    st.dragging = true; // suppress hover highlight churn
    const line = document.createElementNS(SVGNS, "path");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", PALETTE.warn);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-dasharray", "5 4");
    dom.lines.appendChild(line);
    const from = panCoords(e);
    let target = null;

    const move = (ev) => {
      const to = panCoords(ev);
      line.setAttribute("d",
        `M ${from.x} ${from.y} C ${from.x + 40} ${from.y} ${to.x - 40} ${to.y} ${to.x} ${to.y}`);
      document.querySelectorAll(".er-card-col.fk-target")
        .forEach((n) => n.classList.remove("fk-target"));
      const elAt = document.elementFromPoint(ev.clientX, ev.clientY);
      const colRow = elAt && elAt.closest && elAt.closest(".er-card-col");
      const tcard = colRow && colRow.closest(".er-card");
      target = null;
      if (colRow && tcard && tcard.dataset.table !== table) {
        target = { table: tcard.dataset.table, col: colRow.dataset.col };
        colRow.classList.add("fk-target");
      }
    };
    const up = async () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      st.dragging = false;
      clearHighlight(); // hover-dim was frozen during the drag — release it
      line.remove();
      document.querySelectorAll(".er-card-col.fk-target")
        .forEach((n) => n.classList.remove("fk-target"));
      if (!target) return;
      const tTbl = st.tables.find((x) => x.name === target.table);
      if (tTbl && tTbl.type === "view")
        return SLApp.toast("Can't reference a view.", "err");
      if (!(await SLApp.askConfirm(
        `Create foreign key?\n\n${table}.${col}  →  ${target.table}.${target.col}\n\n` +
        `This rebuilds ${table} (rows, keys and indexes are preserved).`, { title: "Create foreign key", confirmLabel: "Create" }))) return;
      const res = await API.addFk({
        db: st.db, table, column: col,
        ref_table: target.table, ref_column: target.col,
        backup: SLApp.autoBackup(),
      });
      if (res.error) return SLApp.toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      SLApp.toast("Foreign key created", "ok");
      afterChange(table);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  // ----------------------------------------------------------------- drag / pan / zoom
  function startDrag(e, name, card) {
    e.preventDefault();
    e.stopPropagation();
    st.dragging = true;
    dimOthers(name); // every other table dims while dragging
    const start = { x: e.clientX, y: e.clientY };
    const orig = { ...(st.pos[name] || { x: card.offsetLeft, y: card.offsetTop }) };
    const move = (ev) => {
      st.pos[name] = {
        x: orig.x + (ev.clientX - start.x) / st.zoom,
        y: orig.y + (ev.clientY - start.y) / st.zoom,
      };
      card.style.left = st.pos[name].x + "px";
      card.style.top = st.pos[name].y + "px";
      drawLines();
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      st.dragging = false;
      clearHighlight();
      save();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  function wirePanZoom() {
    dom.canvas.addEventListener("mousedown", (e) => {
      if (e.target.closest(".er-card") || e.target.closest(".er-note")) return; // dragging those instead
      e.preventDefault();
      dom.canvas.classList.add("panning");
      const start = { x: e.clientX, y: e.clientY };
      const orig = { ...st.pan };
      const move = (ev) => {
        st.pan = { x: orig.x + (ev.clientX - start.x), y: orig.y + (ev.clientY - start.y) };
        applyTransform();
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        dom.canvas.classList.remove("panning");
        save();
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });

    dom.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = dom.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(px, py, factor);
    }, { passive: false });
  }

  function zoomAt(px, py, factor) {
    const nz = clamp(st.zoom * factor, 0.25, 2.5);
    const r = nz / st.zoom;
    st.pan.x = px - (px - st.pan.x) * r;
    st.pan.y = py - (py - st.pan.y) * r;
    st.zoom = nz;
    applyTransform();
    save();
  }
  function zoomBy(factor) {
    const rect = dom.canvas.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function applyTransform() {
    dom.pan.style.transform =
      `translate(${st.pan.x}px, ${st.pan.y}px) scale(${st.zoom})`;
    dom.zoomVal.textContent = Math.round(st.zoom * 100) + "%";
  }

  function fit() {
    const g = measure();
    const boxes = Object.values(g);
    if (!boxes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    boxes.forEach((b) => {
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    });
    const rect = dom.canvas.getBoundingClientRect();
    const pad = 50;
    const z = clamp(Math.min(
      (rect.width - pad * 2) / (maxX - minX),
      (rect.height - pad * 2) / (maxY - minY)
    ), 0.25, 1.5);
    st.zoom = z;
    st.pan = {
      x: pad - minX * z + (rect.width - pad * 2 - (maxX - minX) * z) / 2,
      y: pad - minY * z + (rect.height - pad * 2 - (maxY - minY) * z) / 2,
    };
    applyTransform();
    save();
  }

  // ----------------------------------------------------------------- saved layouts
  function saveLayoutAs() {
    if (!st.tables.length) return SLApp.toast("Nothing to save", "err");
    const suggested = "Layout " + (Object.keys(st.layouts).length + 1);
    const body = SLApp.el("div");
    body.innerHTML =
      `<div class="field"><label>Layout name</label>
         <input id="layName" type="text" placeholder="${suggested}" /></div>
       <div class="hint">${esc(I18N.t("{0} tables will be saved at their current positions.", st.tables.length))}</div>`;
    const input = body.querySelector("#layName");
    input.value = suggested;
    const go = SLApp.mkBtn("Save", "primary", async () => {
      const key = input.value.trim();
      if (!key) return SLApp.toast("Layout name required", "err");
      if (st.layouts[key] && !(await SLApp.askConfirm(I18N.t("Overwrite layout \"{0}\"?", key), { title: "Overwrite layout", confirmLabel: "Overwrite" }))) return;
      st.layouts[key] = JSON.parse(JSON.stringify(st.pos));
      save();
      renderLayoutList();
      SLApp.closeModal();
      SLApp.toast("Layout saved", "ok");
    });
    SLApp.openModal("Save layout", body, [SLApp.mkBtn("Cancel", "ghost", SLApp.closeModal), go]);
    setTimeout(() => { input.focus(); input.select(); input.onkeydown = (ev) => { if (ev.key === "Enter") go.click(); }; }, 30);
  }
  function renderLayoutList() {
    dom.layoutList.innerHTML = "";
    const names = Object.keys(st.layouts);
    if (!names.length) {
      dom.layoutList.appendChild(h("div", "bf-empty",
        I18N.t("No saved layouts yet.<br>Arrange the tables, then press ＋ above to keep the arrangement under a name.")));
      return;
    }
    names.forEach((name) => {
      const row = h("div", "bf-row lay-row");
      const main = h("div", "lay-main",
        `<span class="bf-name">${esc(name)}</span>` +
        `<span class="bf-meta">${esc(I18N.t("{0} tables placed", Object.keys(st.layouts[name]).length))}</span>`);
      const apply = () => {
        st.pos = { ...st.pos, ...JSON.parse(JSON.stringify(st.layouts[name])) };
        render();
        save();
        SLApp.toast(I18N.t("Layout \"{0}\" applied", name), "ok");
      };
      main.onclick = apply;
      main.oncontextmenu = (e) => {
        e.preventDefault();
        SLApp.showCtxMenu(e.clientX, e.clientY, [
          { icon: "play", label: "Apply", onClick: apply },
          { icon: "save", label: "Overwrite with current", onClick: () => {
              st.layouts[name] = JSON.parse(JSON.stringify(st.pos));
              save(); renderLayoutList();
              SLApp.toast("Layout updated", "ok");
            } },
        ]);
      };
      const del = SLApp.mkBtn(ICON("trash"), "icon lay-del", () => {
        delete st.layouts[name];
        save(); renderLayoutList();
        SLApp.toast(I18N.t("Layout \"{0}\" deleted", name), "ok");
      });
      del.title = I18N.t("Delete this layout");
      row.appendChild(main); row.appendChild(del);
      dom.layoutList.appendChild(row);
    });
    const delAll = SLApp.mkBtn(I18N.t("Delete all ({0})", names.length), "ghost lay-delall", async () => {
      if (!(await SLApp.askConfirm(I18N.t("Delete all {0} saved layouts?", names.length),
        { title: "Delete layouts", confirmLabel: "Delete all" }))) return;
      st.layouts = {}; save(); renderLayoutList();
      SLApp.toast("All layouts deleted", "ok");
    });
    dom.layoutList.appendChild(delAll);
  }

  // ----------------------------------------------------------------- sticky notes
  // new notes cascade like OS windows: each one a step down-right from the
  // last; when the diagonal would leave the screen, a fresh diagonal starts
  // beside the first note of the current cascade.
  let cascade = null; // { ax, ay, col } — anchor of the cascade, in pan coords
  const NOTE_W = 176, NOTE_H = 84, NOTE_STEP = 26;
  function nextNotePos() {
    const rect = dom.canvas.getBoundingClientRect();
    const vp = {
      l: -st.pan.x / st.zoom, t: -st.pan.y / st.zoom,
      r: (rect.width - st.pan.x) / st.zoom, b: (rect.height - st.pan.y) / st.zoom,
    };
    const last = st.notes[st.notes.length - 1];
    if (!last || !cascade) {
      cascade = { ax: vp.l + 40, ay: vp.t + 40, col: 0 };
      return { x: cascade.ax, y: cascade.ay };
    }
    const x = last.x + NOTE_STEP, y = last.y + NOTE_STEP;
    if (x + NOTE_W <= vp.r && y + NOTE_H <= vp.b) return { x, y };
    cascade.col += 1;
    let nx = cascade.ax + cascade.col * (NOTE_W + 14), ny = cascade.ay;
    if (nx + NOTE_W > vp.r) {
      cascade = { ax: vp.l + 40, ay: vp.t + 40, col: 0 };
      nx = cascade.ax; ny = cascade.ay;
    }
    return { x: nx, y: ny };
  }
  function addNote() {
    const pos = nextNotePos();
    st.notes.push({
      id: "n" + Date.now(),
      x: pos.x, y: pos.y,
      color: TAG_COLORS[st.notes.length % TAG_COLORS.length],
      text: "",
    });
    save();
    renderNotes();
    refreshNotesPanel();
    const last = dom.notes.lastElementChild;
    if (last) last.querySelector(".er-note-text").focus();
  }
  // keep the panel's delete controls in sync with what's on the canvas
  function refreshNotesPanel() {
    const p = document.querySelector('.diagram-side .side-sub-panel[data-ds="notes"]');
    if (p && !p.hidden) renderLegend();
  }
  function renderNotes() {
    dom.notes.innerHTML = "";
    st.notes.forEach((note) => {
      const n = h("div", "er-note");
      n.style.left = note.x + "px";
      n.style.top = note.y + "px";
      n.style.borderTop = "3px solid " + note.color;
      const bar = h("div", "er-note-bar");
      const swatch = h("span", "er-note-color");
      swatch.style.background = note.color;
      swatch.title = "Click to cycle the tag color";
      swatch.onclick = (e) => {
        e.stopPropagation();
        note.color = TAG_COLORS[(TAG_COLORS.indexOf(note.color) + 1) % TAG_COLORS.length];
        n.style.borderTop = "3px solid " + note.color;
        swatch.style.background = note.color;
        save();
        refreshNotesPanel();
      };
      const x = h("span", "er-note-x", ICON("x"));
      x.title = "Delete note";
      x.onclick = (e) => {
        e.stopPropagation();
        st.notes = st.notes.filter((k) => k.id !== note.id);
        save();
        renderNotes();
        refreshNotesPanel();
      };
      bar.appendChild(swatch);
      bar.appendChild(x);
      const text = h("div", "er-note-text");
      text.contentEditable = "true";
      text.spellcheck = false;
      text.textContent = note.text;
      text.setAttribute("data-ph", I18N.t("Write a note…"));
      text.oninput = () => { note.text = text.textContent; save(); };
      text.onmousedown = (e) => e.stopPropagation(); // select text, don't drag
      n.appendChild(bar);
      n.appendChild(text);
      // drag from the bar (or the body outside the text)
      n.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const start = { x: e.clientX, y: e.clientY };
        const orig = { x: note.x, y: note.y };
        const move = (ev) => {
          note.x = orig.x + (ev.clientX - start.x) / st.zoom;
          note.y = orig.y + (ev.clientY - start.y) / st.zoom;
          n.style.left = note.x + "px";
          n.style.top = note.y + "px";
        };
        const up = () => {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          save();
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
      dom.notes.appendChild(n);
    });
  }

  // ----------------------------------------------------------------- legend
  function renderLegend() {
    dom.legend.innerHTML = "";
    dom.legend.appendChild(h("div", "er-ed-section", "Notes"));
    const addBtn = SLApp.mkBtn(ICON("note") + "Add sticky note", "primary er-note-add", addNote);
    addBtn.title = "Drops an editable sticky note onto the diagram canvas";
    dom.legend.appendChild(addBtn);
    if (st.notes.length) {
      const delRow = h("div", "note-del-row");
      delRow.appendChild(h("span", "er-ed-taglabel", "Delete"));
      const all = SLApp.mkBtn("All", "danger", async () => {
        if (!(await SLApp.askConfirm(I18N.t("Delete all {0} sticky notes?", st.notes.length), { title: "Delete notes", confirmLabel: "Delete all" }))) return;
        st.notes = [];
        save(); renderNotes(); renderLegend();
      });
      all.title = "Delete every sticky note";
      delRow.appendChild(all);
      // one swatch per color currently in use: deletes that color's notes
      [...new Set(st.notes.map((n) => n.color))].forEach((color) => {
        const count = st.notes.filter((n) => n.color === color).length;
        const sw = h("span", "er-tagdot");
        sw.style.background = color;
        sw.title = `Delete the ${count} note${count > 1 ? "s" : ""} of this color`;
        sw.onclick = async () => {
          if (!(await SLApp.askConfirm(I18N.t("Delete {0} notes of this color?", count), { title: "Delete notes", confirmLabel: "Delete" }))) return;
          st.notes = st.notes.filter((n) => n.color !== color);
          save(); renderNotes(); renderLegend();
        };
        delRow.appendChild(sw);
      });
      dom.legend.appendChild(delRow);
    }
    dom.legend.appendChild(h("div", "er-ed-section", "Legend"));
    if (!st.legend.length)
      dom.legend.appendChild(h("div", "bf-empty",
        "Name what each color means, then tag tables with a color from their editor (Tables panel)."));
    st.legend.forEach((entry, i) => {
      const row = h("div", "legend-row");
      const swatch = h("span", "legend-swatch");
      swatch.style.background = entry.color;
      swatch.title = "Click to cycle the color";
      swatch.onclick = () => {
        entry.color = TAG_COLORS[(TAG_COLORS.indexOf(entry.color) + 1) % TAG_COLORS.length];
        save(); renderLegend();
      };
      const inp = h("input", "mini-input");
      inp.value = entry.label;
      inp.placeholder = "what this color means";
      inp.oninput = () => { entry.label = inp.value; save(); };
      const del = SLApp.mkBtn(ICON("trash"), "icon", () => {
        st.legend.splice(i, 1);
        save(); renderLegend();
      });
      del.title = "Remove legend entry";
      row.appendChild(swatch); row.appendChild(inp); row.appendChild(del);
      dom.legend.appendChild(row);
    });
    const add = h("div", "er-ed-add");
    add.appendChild(SLApp.mkBtn(ICON("plus") + "Legend entry", "ghost", () => {
      st.legend.push({
        color: TAG_COLORS[st.legend.length % TAG_COLORS.length],
        label: "",
      });
      save(); renderLegend();
      const inputs = dom.legend.querySelectorAll(".legend-row input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    }));
    dom.legend.appendChild(add);

    dom.legend.appendChild(h("div", "er-ed-section", "Tagged tables"));
    const tagged = Object.entries(st.tags).filter(([t]) => st.tables.find((x) => x.name === t));
    if (!tagged.length)
      dom.legend.appendChild(h("div", "bf-empty", "No tables tagged yet."));
    tagged.forEach(([table, color]) => {
      const row = h("div", "legend-row");
      const swatch = h("span", "legend-swatch");
      swatch.style.background = color;
      row.appendChild(swatch);
      row.appendChild(h("span", "legend-table", esc(table)));
      const del = SLApp.mkBtn(ICON("x"), "icon", () => {
        delete st.tags[table];
        save(); renderLegend(); render();
      });
      del.title = "Untag";
      row.appendChild(del);
      dom.legend.appendChild(row);
    });
  }

  // ----------------------------------------------------------------- left list + editor
  function renderList() {
    dom.list.innerHTML = "";
    st.tables.forEach((t) => {
      const row = h("div", "er-table-row" + (t.name === st.selected ? " active" : ""));
      row.innerHTML =
        `<span class="er-tr-icon" title="${t.type === "view" ? "View — a saved query (read-only)" : "Table — stores rows"}">${ICON(t.type === "view" ? "eye" : "table")}</span>` +
        `<span>${esc(t.name)}</span>` +
        `<span class="er-tr-count">${t.columns.length} cols</span>`;
      row.onclick = () => { selectTable(t.name); focusCard(t.name); };
      dom.list.appendChild(row);
    });
  }

  function selectTable(name) {
    st.selected = name;
    renderList();
    renderEditor();
  }
  function focusCard(name) {
    const card = [...dom.cards.children].find((c) => c.dataset.table === name);
    if (!card) return;
    const rect = dom.canvas.getBoundingClientRect();
    st.pan = {
      x: rect.width / 2 - (card.offsetLeft + card.offsetWidth / 2) * st.zoom,
      y: rect.height / 2 - (card.offsetTop + card.offsetHeight / 2) * st.zoom,
    };
    applyTransform();
    highlight(name);
    setTimeout(clearHighlight, 900);
    save();
  }

  function renderEditor() {
    const t = st.tables.find((x) => x.name === st.selected);
    dom.editor.innerHTML = "";
    if (!t) {
      dom.editor.appendChild(h("div", "er-editor-empty",
        I18N.t("Select a table to edit its columns,<br>rename it, or drop it.")));
      return;
    }
    const isView = t.type === "view";
    const head = h("div", "er-ed-head");
    head.innerHTML = `<span class="er-ed-title">${esc(t.name)}</span>`;
    if (!isView) {
      const ren = SLApp.mkBtn("Rename", "ghost", () => renameTableDialog(t.name));
      head.appendChild(ren);
    }
    const drop = SLApp.mkBtn("Drop", "danger", () => dropTableConfirm(t.name));
    head.appendChild(drop);
    dom.editor.appendChild(head);

    // tag color: paints a stripe on the card; named in the Notes panel's legend
    const tagRow = h("div", "er-ed-tagrow");
    tagRow.appendChild(h("span", "er-ed-taglabel", "Tag"));
    const none = h("span", "er-tagdot none" + (st.tags[t.name] ? "" : " sel"));
    none.title = "No tag";
    none.onclick = () => { delete st.tags[t.name]; save(); render(); renderEditor(); };
    tagRow.appendChild(none);
    TAG_COLORS.forEach((color) => {
      const d = h("span", "er-tagdot" + (st.tags[t.name] === color ? " sel" : ""));
      d.style.background = color;
      const lg = st.legend.find((e) => e.color === color);
      d.title = lg && lg.label ? lg.label : "Tag this table " + color;
      d.onclick = () => { st.tags[t.name] = color; save(); render(); renderEditor(); };
      tagRow.appendChild(d);
    });
    dom.editor.appendChild(tagRow);

    dom.editor.appendChild(h("div", "er-ed-section", "Columns"));
    t.columns.forEach((c) => {
      const fk = (t.foreign_keys || []).find((f) => f.from === c.name);
      const row = h("div", "er-ed-col");
      row.innerHTML =
        `<span class="er-key" style="width:14px">${c.pk ? ICON("key") : ""}</span>` +
        `<span class="ec-name">${esc(c.name)}</span>` +
        `<span class="ec-type">${esc(c.type)}</span>` +
        (fk ? `<span class="er-fk${fk.auto ? " auto" : ""}" title="→ ${esc(fk.table)}.${esc(fk.to)}${fk.auto ? " — " + esc(I18N.t("auto-link")) : ""}">${ICON("link")}</span>` : "");
      if (!isView) {
        const acts = h("span", "ec-actions");
        const ren = SLApp.mkBtn(ICON("pencil"), "icon", () => renameColumnDialog(t.name, c.name));
        ren.title = "Rename column";
        const typ = SLApp.mkBtn(ICON("format"), "icon", () => changeTypeDialog(t.name, c.name, c.type));
        typ.title = "Change type (rebuilds table)";
        const del = SLApp.mkBtn(ICON("trash"), "icon", () => dropColumnConfirm(t.name, c.name));
        del.title = "Drop column";
        acts.appendChild(ren); acts.appendChild(typ); acts.appendChild(del);
        row.appendChild(acts);
      }
      dom.editor.appendChild(row);
    });

    if (!isView) {
      const add = h("div", "er-ed-add");
      add.appendChild(SLApp.mkBtn(ICON("plus") + "Add column", "ghost", () => addColumnDialog(t.name)));
      dom.editor.appendChild(add);

      // indexes
      dom.editor.appendChild(h("div", "er-ed-section", "Indexes"));
      const ixHost = h("div");
      dom.editor.appendChild(ixHost);
      const ixAdd = h("div", "er-ed-add");
      ixAdd.appendChild(SLApp.mkBtn(ICON("plus") + "Add index", "ghost", () => createIndexDialog(t)));
      dom.editor.appendChild(ixAdd);
      API.indexes(st.db, t.name).then((r) => {
        (r.indexes || []).forEach((ix) => {
          const row = h("div", "er-ed-col");
          row.innerHTML =
            `<span class="ec-name" title="${esc(ix.name)}">${esc(ix.name)}</span>` +
            `<span class="ec-type">${ix.unique ? "UNIQUE " : ""}(${esc(ix.columns.join(", "))})</span>`;
          const acts = h("span", "ec-actions");
          const del = SLApp.mkBtn(ICON("trash"), "icon", async () => {
            if (!(await SLApp.askConfirm(I18N.t("Drop index \"{0}\"?", ix.name), { title: "Drop index", confirmLabel: "Drop" }))) return;
            const res = await API.dropIndex({ db: st.db, name: ix.name });
            if (res.error) return SLApp.toast(res.error, "err");
            SLApp.toast("Index dropped", "ok");
            renderEditor();
          });
          del.title = "Drop index";
          acts.appendChild(del);
          row.appendChild(acts);
          ixHost.appendChild(row);
        });
        if (!(r.indexes || []).length)
          ixHost.appendChild(h("div", "er-editor-empty", "No indexes on this table."));
      });

      // triggers
      dom.editor.appendChild(h("div", "er-ed-section", "Triggers"));
      const trHost = h("div");
      dom.editor.appendChild(trHost);
      const trAdd = h("div", "er-ed-add");
      trAdd.appendChild(SLApp.mkBtn(ICON("plus") + "Add trigger", "ghost", () => createTriggerDialog(t)));
      dom.editor.appendChild(trAdd);
      API.triggers(st.db, t.name).then((r) => {
        (r.triggers || []).forEach((tg) => {
          const row = h("div", "er-ed-col");
          const evt = (tg.sql.match(/\b(BEFORE|AFTER|INSTEAD OF)\s+(INSERT|UPDATE|DELETE)\b/i) || [, "", ""]);
          row.innerHTML =
            `<span class="ec-name" title="${esc(tg.name)}">${esc(tg.name)}</span>` +
            `<span class="ec-type">${esc((evt[1] + " " + evt[2]).trim())}</span>`;
          const acts = h("span", "ec-actions");
          const view = SLApp.mkBtn(ICON("eye"), "icon", () => {
            const body = SLApp.el("div");
            body.innerHTML = `<pre class="inspect-pre">${esc(tg.sql)}</pre>`;
            SLApp.openModal(I18N.t("Trigger: {0}", tg.name), body,
              [SLApp.mkBtn("Close", "primary", SLApp.closeModal)]);
          });
          view.title = "View trigger SQL";
          const del = SLApp.mkBtn(ICON("trash"), "icon", async () => {
            if (!(await SLApp.askConfirm(I18N.t("Drop trigger \"{0}\"?", tg.name), { title: "Drop trigger", confirmLabel: "Drop" }))) return;
            const res = await API.dropTrigger(st.db, tg.name);
            if (res.error) return SLApp.toast(res.error, "err");
            SLApp.toast("Trigger dropped", "ok");
            renderEditor();
          });
          del.title = "Drop trigger";
          acts.appendChild(view); acts.appendChild(del);
          row.appendChild(acts);
          trHost.appendChild(row);
        });
        if (!(r.triggers || []).length)
          trHost.appendChild(h("div", "er-editor-empty",
            "No triggers — SQL that runs automatically when rows change."));
      });
    }
  }

  function createTriggerDialog(t) {
    const body = SLApp.el("div");
    body.innerHTML =
      `<div class="field"><label>Trigger name</label>
         <input type="text" id="tgName" value="trg_${esc(t.name)}_" /></div>
       <div class="set-row"><span class="set-label">When</span><span id="tgTiming"></span></div>
       <div class="set-row"><span class="set-label">On event</span><span id="tgEvent"></span></div>
       <div class="field"><label>Body — statements to run (use NEW.col / OLD.col)</label>
         <textarea id="tgBody" rows="5" placeholder="UPDATE ${esc(t.name)} SET updated_at = datetime('now') WHERE id = NEW.id"></textarea>
         <div class="hint">Runs automatically on every matching change, no matter where
         the change comes from. NEW.* is the incoming row, OLD.* the previous one
         (INSERT has only NEW, DELETE only OLD).</div></div>`;
    const timing = SLApp.mkSelect([["AFTER"], ["BEFORE"]], "AFTER", null, "set-select");
    const event = SLApp.mkSelect([["INSERT"], ["UPDATE"], ["DELETE"]], "INSERT", null, "set-select");
    body.querySelector("#tgTiming").appendChild(timing);
    body.querySelector("#tgEvent").appendChild(event);
    const go = SLApp.mkBtn("Create trigger", "primary", async () => {
      const res = await API.createTrigger({
        db: st.db, table: t.name,
        name: body.querySelector("#tgName").value.trim(),
        timing: timing.getValue(), event: event.getValue(),
        body: body.querySelector("#tgBody").value.trim(),
      });
      if (res.error) return SLApp.toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      SLApp.closeModal();
      SLApp.toast("Trigger created", "ok");
      renderEditor();
    });
    SLApp.openModal(I18N.t("Add trigger on {0}", t.name), body,
      [SLApp.mkBtn("Cancel", "ghost", SLApp.closeModal), go]);
    setTimeout(() => body.querySelector("#tgName").focus(), 30);
  }

  function changeTypeDialog(table, col, curType) {
    const body = SLApp.el("div");
    body.innerHTML =
      `<div class="field"><label>New type for "${esc(col)}"</label>
         <input type="text" id="ctType" value="${esc(curType || "TEXT")}" list="ctTypes" />
         <datalist id="ctTypes"><option>TEXT</option><option>INTEGER</option><option>REAL</option><option>NUMERIC</option><option>BLOB</option></datalist>
         <div class="hint">SQLite can't change a type in place — the table is rebuilt
         (rows, primary key, foreign keys and indexes are preserved). Existing values
         are kept as-is; SQLite coerces on read per its affinity rules.</div>
       </div>`;
    const go = SLApp.mkBtn("Change type", "primary", async () => {
      const res = await API.changeColumn({
        db: st.db, table, column: col,
        type: body.querySelector("#ctType").value.trim(),
        backup: SLApp.autoBackup(),
      });
      if (res.error) return SLApp.toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      SLApp.closeModal();
      SLApp.toast("Column type changed", "ok");
      afterChange(table);
    });
    SLApp.openModal("Change column type", body, [SLApp.mkBtn("Cancel", "ghost", SLApp.closeModal), go]);
  }

  function createIndexDialog(t) {
    const body = SLApp.el("div");
    body.innerHTML =
      `<div class="field"><label>Index name</label>
         <input type="text" id="ixName" value="idx_${esc(t.name)}_" /></div>
       <div class="field"><label>Columns</label><div id="ixCols"></div></div>
       <div class="checkrow"><input type="checkbox" id="ixUnique" /> UNIQUE</div>`;
    const colHost = body.querySelector("#ixCols");
    t.columns.forEach((c) => {
      const row = SLApp.el("label", "checkrow");
      row.innerHTML = `<input type="checkbox" value="${esc(c.name)}" /> ${esc(c.name)}
        <span style="color:var(--faint);font-size:11px">${esc(c.type)}</span>`;
      colHost.appendChild(row);
    });
    const go = SLApp.mkBtn("Create index", "primary", async () => {
      const columns = [...colHost.querySelectorAll("input:checked")].map((i) => i.value);
      const res = await API.createIndex({
        db: st.db, table: t.name,
        name: body.querySelector("#ixName").value.trim(),
        columns, unique: body.querySelector("#ixUnique").checked,
      });
      if (res.error) return SLApp.toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      SLApp.closeModal();
      SLApp.toast("Index created", "ok");
      renderEditor();
    });
    SLApp.openModal(I18N.t("Add index on {0}", t.name), body, [SLApp.mkBtn("Cancel", "ghost", SLApp.closeModal), go]);
  }

  // ----------------------------------------------------------------- mutations
  async function afterChange(reselect) {
    await open(st.db);            // reload diagram data + redraw
    if (reselect) selectTable(reselect);
    SLApp.onSchemaChanged();      // keep the editor view's sidebar in sync
  }

  function addColumnDialog(table) {
    const body = SLApp.el("div");
    body.innerHTML =
      `<div class="field"><label>Column name</label><input type="text" id="acName" placeholder="created_at" /></div>
       <div class="field"><label>Type</label>
         <input type="text" id="acType" placeholder="TEXT" list="acTypes" />
         <datalist id="acTypes"><option>TEXT</option><option>INTEGER</option><option>REAL</option><option>NUMERIC</option><option>BLOB</option></datalist>
       </div>
       <div class="checkrow"><input type="checkbox" id="acNotNull" /> NOT NULL</div>
       <div class="field"><label>Default value (optional)</label><input type="text" id="acDefault" placeholder="leave blank for none" /></div>
       <div class="field"><div class="hint">SQLite note: adding a NOT NULL column to a table that already has rows requires a default value.</div></div>`;
    const go = SLApp.mkBtn("Add column", "primary", async () => {
      const name = body.querySelector("#acName").value.trim();
      if (!name) return SLApp.toast("Column name required", "err");
      const res = await API.addColumn({
        db: st.db, table, name,
        type: body.querySelector("#acType").value.trim(),
        notnull: body.querySelector("#acNotNull").checked,
        default: body.querySelector("#acDefault").value,
      });
      if (res.error) return SLApp.toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      SLApp.closeModal();
      SLApp.toast("Column added", "ok");
      afterChange(table);
    });
    SLApp.openModal(I18N.t("Add column to {0}", table), body, [SLApp.mkBtn("Cancel", "ghost", SLApp.closeModal), go]);
    setTimeout(() => body.querySelector("#acName").focus(), 30);
  }

  function renameColumnDialog(table, col) {
    const body = SLApp.el("div");
    body.innerHTML = `<div class="field"><label>Rename "${esc(col)}" to</label><input type="text" id="rcNew" value="${esc(col)}" /></div>`;
    const go = SLApp.mkBtn("Rename", "primary", async () => {
      const nn = body.querySelector("#rcNew").value.trim();
      if (!nn) return SLApp.toast("Name required", "err");
      const res = await API.renameColumn({ db: st.db, table, old: col, new: nn });
      if (res.error) return SLApp.toast(res.error, "err");
      SLApp.closeModal(); SLApp.toast("Column renamed", "ok"); afterChange(table);
    });
    SLApp.openModal("Rename column", body, [SLApp.mkBtn("Cancel", "ghost", SLApp.closeModal), go]);
    setTimeout(() => body.querySelector("#rcNew").select(), 30);
  }

  async function dropColumnConfirm(table, col) {
    if (!(await SLApp.askConfirm(I18N.t("Drop column \"{0}\" from {1}? This deletes its data.", col, table), { title: "Drop column", confirmLabel: "Drop" }))) return;
    const res = await API.dropColumn({ db: st.db, table, column: col, backup: SLApp.autoBackup() });
    if (res.error) return SLApp.toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
    SLApp.toast("Column dropped", "ok"); afterChange(table);
  }

  function renameTableDialog(table) {
    const body = SLApp.el("div");
    body.innerHTML = `<div class="field"><label>Rename table to</label><input type="text" id="rtNew" value="${esc(table)}" /></div>`;
    const go = SLApp.mkBtn("Rename", "primary", async () => {
      const nn = body.querySelector("#rtNew").value.trim();
      if (!nn) return SLApp.toast("Name required", "err");
      const res = await API.renameTable({ db: st.db, table, new: nn });
      if (res.error) return SLApp.toast(res.error, "err");
      if (st.pos[table]) { st.pos[nn] = st.pos[table]; delete st.pos[table]; }
      if (st.tags[table]) { st.tags[nn] = st.tags[table]; delete st.tags[table]; }
      save();
      SLApp.closeModal(); SLApp.toast("Table renamed", "ok"); st.selected = nn; afterChange(nn);
    });
    SLApp.openModal("Rename table", body, [SLApp.mkBtn("Cancel", "ghost", SLApp.closeModal), go]);
    setTimeout(() => body.querySelector("#rtNew").select(), 30);
  }

  async function dropTableConfirm(table) {
    const isView = (st.tables.find((x) => x.name === table) || {}).type === "view";
    if (!(await SLApp.askConfirm(isView
      ? `Drop view "${table}"? It's only a saved query — the underlying tables and their data are not touched.`
      : `Drop table "${table}"? This permanently deletes the table and all its rows.`, { title: isView ? "Drop view" : "Drop table", confirmLabel: "Drop" }))) return;
    const res = await API.dropTable({ db: st.db, table, backup: SLApp.autoBackup() });
    if (res.error) return SLApp.toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
    delete st.pos[table]; delete st.tags[table]; save();
    st.selected = null;
    SLApp.toast("Table dropped", "ok"); afterChange(null);
  }

  function newTableDialog() {
    const body = SLApp.el("div");
    body.innerHTML =
      `<div class="field"><label>Table name</label><input type="text" id="ntName" placeholder="customers" /></div>
       <div class="field"><label>First column</label><input type="text" id="ntCol" value="id" /></div>
       <div class="field"><label>Type</label><input type="text" id="ntType" value="INTEGER" /></div>
       <div class="checkrow"><input type="checkbox" id="ntPk" checked /> Primary key (INTEGER → autoincrement rowid)</div>`;
    const go = SLApp.mkBtn("Create table", "primary", async () => {
      const name = body.querySelector("#ntName").value.trim();
      const col = body.querySelector("#ntCol").value.trim() || "id";
      const type = body.querySelector("#ntType").value.trim() || "INTEGER";
      const pk = body.querySelector("#ntPk").checked;
      if (!name) return SLApp.toast("Table name required", "err");
      const q = (s) => '"' + s.replace(/"/g, '""') + '"';
      const sql = `CREATE TABLE ${q(name)} (${q(col)} ${type}${pk ? " PRIMARY KEY" : ""});`;
      const res = await API.query(st.db, sql);
      if (res.error) return SLApp.toast(res.error + (res.explanation ? " — " + res.explanation : ""), "err");
      SLApp.closeModal(); SLApp.toast("Table created", "ok");
      st.selected = name; await afterChange(name); focusCard(name);
    });
    SLApp.openModal("New table", body, [SLApp.mkBtn("Cancel", "ghost", SLApp.closeModal), go]);
    setTimeout(() => body.querySelector("#ntName").focus(), 30);
  }

  // ----------------------------------------------------------------- export
  // Populated from the active theme's CSS variables so lines + exports match.
  const PALETTE = {
    bg: "#131320", surface: "#1b1b2c", surface2: "#232338",
    border: "#2e2e48", border2: "#3d3d5c", text: "#e9e9f6",
    faint: "#66668a", accent: "#7b6cf6", warn: "#f5b945", purple: "#b08cff",
  };
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
    PALETTE.bg = g("--bg", PALETTE.bg);
    PALETTE.surface = g("--surface", PALETTE.surface);
    PALETTE.surface2 = g("--surface-2", PALETTE.surface2);
    PALETTE.border = g("--border", PALETTE.border);
    PALETTE.border2 = g("--border-2", PALETTE.border2);
    PALETTE.text = g("--text", PALETTE.text);
    PALETTE.faint = g("--faint", PALETTE.faint);
    PALETTE.accent = g("--accent", PALETTE.accent);
    PALETTE.warn = g("--warn", PALETTE.warn);
    PALETTE.purple = g("--purple", PALETTE.purple);
  }
  function refreshTheme() {
    readPalette();
    if (st.tables.length) drawLines();
  }

  function buildExportSvg() {
    const g = measure();
    const boxes = Object.entries(g);
    if (!boxes.length) return null;
    // sticky notes: measured from the DOM so the export matches the screen
    const noteBoxes = [...dom.notes.children].map((n, i) => ({
      x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight,
      note: st.notes[i],
    }));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    boxes.forEach(([, b]) => {
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    });
    noteBoxes.forEach((b) => {
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    });
    const pad = 40;
    const W = maxX - minX + pad * 2, H = maxY - minY + pad * 2;
    const ox = -minX + pad, oy = -minY + pad;

    let lines = "", cards = "";
    // FK lines — exact same routing as on screen, shifted by the export offset
    st.tables.forEach((t) => {
      (t.foreign_keys || []).forEach((fk) => {
        const s = g[t.name], d = g[fk.table];
        if (!s || !d) return;
        const r = routeLink(g, s, fk.from, d, fk.to, t.name === fk.table, ox, oy);
        lines += `<path d="${r.d}" fill="none" stroke="${PALETTE.accent}" stroke-width="1.5" opacity="${fk.auto ? 0.5 : 0.7}"${fk.auto ? ' stroke-dasharray="5 4"' : ""}/>`;
        lines += `<circle cx="${r.sx}" cy="${r.sy}" r="3.5" fill="${PALETTE.purple}"/>`;
        lines += `<circle cx="${r.dx}" cy="${r.dy}" r="3.5" fill="${PALETTE.warn}"/>`;
      });
    });
    // cards — rounded to match the on-screen radius (--r). Fills are clipped to
    // a rounded rect so the header/tag don't poke past the corners; a rounded
    // stroke is drawn on top as the border.
    const RX = 13;
    st.tables.forEach((t, ti) => {
      const b = g[t.name];
      const x = b.x + ox, y = b.y + oy;
      const clip = `erc${ti}`;
      const hh = (Object.values(b.cols)[0] ? Object.values(b.cols)[0].top : 30);
      cards += `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${b.w}" height="${b.h}" rx="${RX}"/></clipPath>`;
      cards += `<g clip-path="url(#${clip})">`;
      cards += `<rect x="${x}" y="${y}" width="${b.w}" height="${b.h}" fill="${PALETTE.surface}"/>`;
      if (st.tags[t.name])
        cards += `<rect x="${x}" y="${y}" width="${b.w}" height="3" fill="${st.tags[t.name]}"/>`;
      cards += `<rect x="${x}" y="${y}" width="${b.w}" height="${hh}" fill="${PALETTE.surface2}"/>`;
      cards += `<text x="${x + 11}" y="${y + hh / 2 + 4}" fill="${PALETTE.accent}" font-family="'IBM Plex Mono', monospace" font-size="12" font-weight="700">${esc(t.name.toUpperCase())}</text>`;
      t.columns.forEach((c) => {
        const cg = b.cols[c.name];
        if (!cg) return;
        const cy = y + cg.top, cmid = cy + cg.h / 2 + 4;
        if (c.pk) cards += `<rect x="${x}" y="${cy}" width="${b.w}" height="${cg.h}" fill="${PALETTE.warn}" opacity="0.09"/>`;
        const label = (c.pk ? "• " : "  ") + c.name;
        cards += `<text x="${x + 10}" y="${cmid}" fill="${c.pk ? PALETTE.warn : PALETTE.text}" font-family="'IBM Plex Mono', monospace" font-size="11"${c.pk ? ' font-weight="700"' : ""}>${esc(label)}</text>`;
        cards += `<text x="${x + b.w - 8}" y="${cmid}" text-anchor="end" fill="${PALETTE.faint}" font-family="'IBM Plex Mono', monospace" font-size="10">${esc(c.type)}</text>`;
      });
      cards += `</g>`;
      cards += `<rect x="${x}" y="${y}" width="${b.w}" height="${b.h}" rx="${RX}" fill="none" stroke="${PALETTE.border2}"/>`;
    });

    // sticky notes (drawn on top, like on screen)
    let notes = "";
    noteBoxes.forEach((b) => {
      if (!b.note) return;
      const x = b.x + ox, y = b.y + oy;
      notes += `<g>`;
      notes += `<rect x="${x}" y="${y}" width="${b.w}" height="${b.h}" rx="8" fill="${PALETTE.surface2}" stroke="${PALETTE.border2}"/>`;
      notes += `<path d="M ${x + 2} ${y + 3} h ${b.w - 4}" stroke="${b.note.color}" stroke-width="3"/>`;
      // wrap the text roughly the way the 176px-wide note does on screen
      const wrapped = [];
      String(b.note.text || "").split("\n").forEach((line) => {
        if (line === "") { wrapped.push(""); return; }
        for (let i = 0; i < line.length; i += 24) wrapped.push(line.slice(i, i + 24));
      });
      wrapped.forEach((line, li) => {
        notes += `<text x="${x + 10}" y="${y + 34 + li * 16}" fill="${PALETTE.text}" font-family="'IBM Plex Mono', monospace" font-size="11">${esc(line)}</text>`;
      });
      notes += `</g>`;
    });

    return `<svg xmlns="${SVGNS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      `<rect width="${W}" height="${H}" fill="${PALETTE.bg}"/>` + lines + cards + notes + `</svg>`;
  }

  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function exportSvg() {
    const svg = buildExportSvg();
    if (!svg) return SLApp.toast("Nothing to export", "err");
    download(`${st.db.replace(/[^\w.-]/g, "_")}_diagram.svg`,
      new Blob([svg], { type: "image/svg+xml" }));
  }

  function exportPng() {
    const svg = buildExportSvg();
    if (!svg) return SLApp.toast("Nothing to export", "err");
    const wm = svg.match(/width="(\d+(?:\.\d+)?)"/);
    const hm = svg.match(/height="(\d+(?:\.\d+)?)"/);
    const W = Math.ceil(parseFloat(wm[1])), H = Math.ceil(parseFloat(hm[1]));
    const scale = 2;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * scale; canvas.height = H * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        download(`${st.db.replace(/[^\w.-]/g, "_")}_diagram.png`, blob);
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); SLApp.toast("PNG export failed", "err"); };
    img.src = url;
  }

  // re-render the diagram's source-wrapped chrome after a language switch
  function relocalize() {
    try { renderEditor(); } catch (_) {}
    try { renderLayoutList(); } catch (_) {}
    try { renderLegend(); } catch (_) {}
    try { renderNotes(); } catch (_) {}
  }

  return { init, open, refreshTheme, setSidePanel, relocalize };
})();
