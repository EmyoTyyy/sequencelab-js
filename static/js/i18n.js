/* =================================================================== *
 *  SequenceLab — internationalisation (i18n).
 *
 *  Strategy: English is the source language and is used as the lookup
 *  key. A French dictionary (DICT.fr) maps the English string to its
 *  French equivalent. Anything not in the dictionary falls back to
 *  English, so the app degrades gracefully.
 *
 *  Coverage comes from two mechanisms:
 *    1. A DOM pass + MutationObserver translate static and dynamically
 *       rendered *chrome* (menus, labels, buttons, hints, modals, …)
 *       against the dictionary, without each call site being touched.
 *    2. I18N.t("… {0} …", arg) — used at the source only for strings
 *       that interpolate dynamic data (counts, names) and therefore
 *       can't be matched as a whole by the DOM pass.
 *
 *  Data zones (result/browse grids, the schema tree, the SQL editor,
 *  record values, history/snippets/file lists, the toast) are EXCLUDED
 *  from the DOM pass so user data, identifiers and SQL are never
 *  translated. Strings rendered into those zones use I18N.t() instead.
 * =================================================================== */
window.I18N = (function () {
  "use strict";

  const KEY = "sl.lang";
  const LANGS = [
    { code: "en", label: "English" },
    { code: "fr", label: "Français" },
  ];

  // English → French. Templated entries use {0}, {1} placeholders and
  // are keyed by their template (see t()). Populated in i18n.dict.js.
  const FR = (window.SL_FR_DICT && window.SL_FR_DICT) || {};

  let lang = localStorage.getItem(KEY) || "en";
  let active = null;       // active translation map (en→fr or fr→en) or null for identity
  let reverse = null;      // fr→en, lazily built

  function buildReverse() {
    reverse = {};
    for (const k in FR) if (FR[k] && reverse[FR[k]] === undefined) reverse[FR[k]] = k;
  }
  function rebuild() {
    if (lang === "fr") active = FR;
    else { if (!reverse) buildReverse(); active = reverse; }
  }
  rebuild();

  // ---- string translation (with {n} placeholder substitution) --------
  function subst(tpl, args) {
    return args.length
      ? tpl.replace(/\{(\d+)\}/g, (m, i) => (args[i] != null ? args[i] : m))
      : tpl;
  }
  function t(s, ...args) {
    if (s == null) return s;
    let tpl = s;
    if (lang === "fr") { const v = FR[s]; if (v != null) tpl = v; }
    return subst(tpl, args);
  }

  // ---- DOM pass ------------------------------------------------------
  // Anything inside one of these is left untouched (user data / code).
  const EXCL =
    "[data-noi18n],.editor-host,.cm-highlight,.cm-gutter,.ac-dropdown," +
    ".schema-tree,#pinnedList,#fileList,#snippetList,#historyList," +
    ".browse-table-list,.er-table-list,.er-cards,.er-notes,.rec-body," +
    ".bf-list,#toast,.cm-editor,.CodeMirror,.console-logs,.console-cmd-out";
  const ATTRS = ["placeholder", "title", "aria-label"];

  function excluded(node) {
    const e = node.nodeType === 3 ? node.parentElement : node;
    return !e || (e.closest && e.closest(EXCL));
  }
  function map(s) {
    if (!active) return null;
    const v = active[s];
    return v === undefined ? null : v;
  }
  function translateTextNode(node) {
    if (!active || excluded(node)) return;
    const raw = node.nodeValue;
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const v = map(trimmed);
    if (v != null && v !== trimmed) node.nodeValue = raw.replace(trimmed, v);
  }
  function translateAttrs(el) {
    if (!active || !el.getAttribute || excluded(el)) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      const trimmed = cur.trim();
      if (!trimmed) continue;
      const v = map(trimmed);
      if (v != null && v !== trimmed) el.setAttribute(a, cur.replace(trimmed, v));
    }
  }
  function apply(root) {
    if (!active || !root) return;
    if (root.nodeType === 3) return translateTextNode(root);
    if (root.nodeType !== 1) return;
    // whole subtree sits in an excluded zone (data grid, editor, …) — skip it
    if (root.closest && root.closest(EXCL)) return;
    // attributes on the root + every descendant element
    translateAttrs(root);
    const els = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (const el of els) translateAttrs(el);
    // text nodes
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const tn of nodes) translateTextNode(tn);
  }

  // ---- live observer: translate freshly rendered chrome --------------
  let observer = null;
  function startObserver() {
    if (observer || typeof MutationObserver === "undefined") return;
    observer = new MutationObserver((muts) => {
      if (!active) return;
      for (const m of muts) {
        if (m.type === "characterData") translateTextNode(m.target);
        else if (m.type === "childList") {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === 1) apply(node);
            else if (node.nodeType === 3) translateTextNode(node);
          });
        }
      }
    });
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
    });
  }

  // ---- public API ----------------------------------------------------
  // Subscribers re-render content that the DOM pass can't reach on its own:
  // strings rendered into excluded zones (source-wrapped via t()) and titles
  // stored as concrete strings. Called after the DOM pass on every switch.
  const subs = [];
  function onChange(fn) { if (typeof fn === "function") subs.push(fn); }

  function set(code) {
    if (code === lang) return;
    lang = code;
    localStorage.setItem(KEY, code);
    document.documentElement.lang = code;
    rebuild();
    apply(document.body);
    subs.forEach((fn) => { try { fn(lang); } catch (_) {} });
  }
  function init() {
    document.documentElement.lang = lang;
    if (document.body) { apply(document.body); startObserver(); }
    else document.addEventListener("DOMContentLoaded", () => { apply(document.body); startObserver(); });
  }

  init();

  return {
    t,
    set,
    apply,
    onChange,
    langs: LANGS,
    get lang() { return lang; },
  };
})();
