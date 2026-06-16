/* =================================================================== *
 *  SequenceLab SQL editor
 *  A self-contained syntax-highlighting editor (no CodeMirror / no CDN).
 *  Technique: a transparent <textarea> layered over a highlighted <pre>.
 *  Adds keyword/identifier autocomplete and optional auto-capitalization.
 * =================================================================== */
const SQLEditor = (() => {
  const KEYWORDS = [
    "SELECT","FROM","WHERE","INSERT","INTO","VALUES","UPDATE","SET","DELETE",
    "CREATE","TABLE","VIEW","INDEX","TRIGGER","DROP","ALTER","ADD","COLUMN",
    "RENAME","JOIN","INNER","LEFT","RIGHT","FULL","OUTER","CROSS","ON","USING",
    "GROUP","BY","ORDER","HAVING","LIMIT","OFFSET","DISTINCT","AS","AND","OR",
    "NOT","NULL","IS","IN","LIKE","GLOB","BETWEEN","EXISTS","CASE","WHEN","THEN",
    "ELSE","END","UNION","ALL","EXCEPT","INTERSECT","PRIMARY","KEY","FOREIGN",
    "REFERENCES","UNIQUE","CHECK","DEFAULT","AUTOINCREMENT","CONSTRAINT","WITH",
    "RECURSIVE","PRAGMA","EXPLAIN","ANALYZE","VACUUM","ATTACH","DETACH","BEGIN",
    "COMMIT","ROLLBACK","TRANSACTION","SAVEPOINT","RELEASE","REPLACE","CONFLICT",
    "IGNORE","ABORT","FAIL","COLLATE","CAST","ASC","DESC","IF","TEMP","TEMPORARY",
    "VIRTUAL","WITHOUT","ROWID","GENERATED","ALWAYS","STORED","RETURNING","NULLS",
    "FIRST","LAST","FILTER","OVER","PARTITION","WINDOW","CURRENT","ROW","RANGE",
    "GROUPS","UNBOUNDED","PRECEDING","FOLLOWING","TIES","DO","NOTHING","EACH",
    "INSTEAD","OF","BEFORE","AFTER","FOR",
  ];
  const FUNCTIONS = [
    "COUNT","SUM","AVG","MIN","MAX","TOTAL","GROUP_CONCAT","ABS","ROUND","LENGTH",
    "LOWER","UPPER","TRIM","LTRIM","RTRIM","SUBSTR","SUBSTRING","REPLACE","INSTR",
    "COALESCE","IFNULL","NULLIF","TYPEOF","HEX","RANDOM","DATE","TIME","DATETIME",
    "JULIANDAY","STRFTIME","UNIXEPOCH","PRINTF","FORMAT","CHAR","UNICODE","QUOTE",
    "ROW_NUMBER","RANK","DENSE_RANK","NTILE","LAG","LEAD","FIRST_VALUE","LAST_VALUE",
    "JSON","JSON_EXTRACT","JSON_ARRAY","JSON_OBJECT","JSON_GROUP_ARRAY",
    "CONCAT","SIGN","CEIL","FLOOR","POWER","SQRT","MOD","EXP","LOG","MAX","MIN",
  ];
  const KW_SET = new Set(KEYWORDS);
  const FN_SET = new Set(FUNCTIONS);

  // --- tokenizer (returns HTML) ---------------------------------------
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function highlight(code, schemaNames) {
    // schemaNames: Set of known table/column names (lowercased) for the .tok-tbl tint
    let out = "";
    const re =
      /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`)|(\b\d+\.?\d*\b)|([A-Za-z_][A-Za-z0-9_$]*)|([(),;.*=<>!+\-/%|]+)|(\s+)/g;
    let m;
    let last = 0;
    while ((m = re.exec(code)) !== null) {
      if (m.index > last) out += escapeHtml(code.slice(last, m.index));
      last = re.lastIndex;
      if (m[1]) out += `<span class="tok-com">${escapeHtml(m[1])}</span>`;
      else if (m[2]) out += `<span class="tok-str">${escapeHtml(m[2])}</span>`;
      else if (m[3]) out += `<span class="tok-num">${escapeHtml(m[3])}</span>`;
      else if (m[4]) {
        const w = m[4];
        const up = w.toUpperCase();
        if (KW_SET.has(up)) out += `<span class="tok-kw">${escapeHtml(w)}</span>`;
        else if (FN_SET.has(up)) out += `<span class="tok-fn">${escapeHtml(w)}</span>`;
        else if (schemaNames && schemaNames.has(w.toLowerCase()))
          out += `<span class="tok-tbl">${escapeHtml(w)}</span>`;
        else out += escapeHtml(w);
      } else if (m[5]) out += `<span class="tok-punc">${escapeHtml(m[5])}</span>`;
      else out += escapeHtml(m[6] || "");
    }
    if (last < code.length) out += escapeHtml(code.slice(last));
    return out + "\n"; // trailing newline keeps caret room visible
  }

  // --------------------------------------------------------------------
  function create(opts) {
    const host = opts.host;
    const ta = opts.textarea;
    const hl = opts.highlight; // <pre><code>
    const code = hl.querySelector("code");
    const dropdown = opts.dropdown;
    const gutter = opts.gutter || null; // inner element holding line numbers
    let schema = {}; // { table: [cols] }
    let schemaNames = new Set();
    let autoCaps = true;
    let tabW = 2;
    let wrapOn = false;
    let acOn = true;
    let acMin = 1;
    let onRun = opts.onRun || (() => {});
    const onSnippet = opts.onSnippet || null;
    let snips = []; // [{name, sql}] — suggested by name, insert the whole SQL

    function setSnippets(list) { snips = list || []; }

    function setSchema(s) {
      schema = s || {};
      schemaNames = new Set();
      Object.keys(schema).forEach((t) => {
        schemaNames.add(t.toLowerCase());
        (schema[t] || []).forEach((c) => schemaNames.add(c.toLowerCase()));
      });
      render();
    }

    function render() {
      code.innerHTML = highlight(ta.value, schemaNames);
      updateGutter();
      syncScroll();
    }
    let lastLines = 0;
    function updateGutter() {
      if (!gutter) return;
      const lines = ta.value.split("\n").length;
      if (lines === lastLines) return;
      lastLines = lines;
      let out = "";
      for (let i = 1; i <= lines; i++) out += i + "\n";
      gutter.textContent = out;
    }
    function syncScroll() {
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
      if (gutter) gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
    }

    // ---- autocomplete --------------------------------------------------
    let acItems = [];
    let acActive = -1;
    let acOpen = false;

    function currentWord() {
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const match = /[A-Za-z0-9_$]+$/.exec(before);
      return match ? { word: match[0], start: pos - match[0].length, pos } : null;
    }

    // map "FROM users u" / "JOIN orders AS o" aliases back to their tables
    function aliasMap() {
      const map = {};
      const re = /\b(?:from|join)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:as\s+)?(?!on\b|where\b|join\b|inner\b|left\b|right\b|cross\b|group\b|order\b|limit\b|set\b)([A-Za-z_][A-Za-z0-9_]*))?/gi;
      let m;
      while ((m = re.exec(ta.value)) !== null) {
        map[m[1].toLowerCase()] = m[1];
        if (m[2]) map[m[2].toLowerCase()] = m[1];
      }
      return map;
    }
    function tableForName(name) {
      const direct = Object.keys(schema).find((t) => t.toLowerCase() === name.toLowerCase());
      if (direct) return direct;
      const mapped = aliasMap()[name.toLowerCase()];
      if (!mapped) return null;
      return Object.keys(schema).find((t) => t.toLowerCase() === mapped.toLowerCase()) || null;
    }

    function buildSuggestions(word, before) {
      const lw = word.toLowerCase();
      const items = [];
      // "table." or "alias." -> only that table's columns
      const dot = /([A-Za-z_][A-Za-z0-9_]*)\.$/.exec(before);
      if (dot) {
        const t = tableForName(dot[1]);
        if (t) {
          (schema[t] || []).forEach((c) => {
            if (c.toLowerCase().startsWith(lw)) items.push({ text: c, kind: "col" });
          });
          return items.slice(0, 40);
        }
      }
      // after FROM/JOIN/INTO/UPDATE/TABLE -> tables only
      if (/\b(from|join|into|update|table)\s+$/i.test(before)) {
        Object.keys(schema).forEach((t) => {
          if (t.toLowerCase().startsWith(lw)) items.push({ text: t, kind: "tbl" });
        });
        return items.slice(0, 40);
      }
      // snippets first: typing a saved snippet's name offers its whole SQL
      snips.forEach((s) => {
        if (s.name.toLowerCase().startsWith(lw))
          items.push({ text: s.name, kind: "snip", sql: s.sql });
      });
      // tables
      Object.keys(schema).forEach((t) => {
        if (t.toLowerCase().startsWith(lw)) items.push({ text: t, kind: "tbl" });
      });
      // columns
      const seen = new Set();
      Object.values(schema).forEach((cols) =>
        cols.forEach((c) => {
          if (c.toLowerCase().startsWith(lw) && !seen.has(c.toLowerCase())) {
            seen.add(c.toLowerCase());
            items.push({ text: c, kind: "col" });
          }
        })
      );
      // keywords + functions
      KEYWORDS.forEach((k) => {
        if (k.toLowerCase().startsWith(lw)) items.push({ text: k, kind: "kw" });
      });
      FUNCTIONS.forEach((f) => {
        if (f.toLowerCase().startsWith(lw)) items.push({ text: f, kind: "fn" });
      });
      return items.slice(0, 40);
    }

    function showAutocomplete(force) {
      if (!acOn && !force) return hideAutocomplete();
      let cw = currentWord();
      const pos = ta.selectionStart;
      const beforeAll = ta.value.slice(0, pos);
      // popup right after "table." even with nothing typed yet
      if (!cw && /[A-Za-z_][A-Za-z0-9_]*\.$/.test(beforeAll))
        cw = { word: "", start: pos, pos };
      if (!cw) return hideAutocomplete();
      const before = ta.value.slice(0, cw.start);
      const isDot = /\.$/.test(before);
      if (!isDot && cw.word.length < (force ? 1 : acMin)) return hideAutocomplete();
      acItems = buildSuggestions(cw.word, before);
      if (!acItems.length) return hideAutocomplete();
      // exact single keyword already typed -> no need
      if (acItems.length === 1 &&
          acItems[0].text.toLowerCase() === cw.word.toLowerCase())
        return hideAutocomplete();
      acActive = 0;
      renderDropdown();
      positionDropdown(cw);
      acOpen = true;
    }

    function renderDropdown() {
      dropdown.innerHTML = acItems
        .map(
          (it, i) =>
            `<div class="ac-item ${i === acActive ? "active" : ""}" data-i="${i}">` +
            `<span>${it.text}</span>` +
            `<span class="ac-kind ${it.kind}">${it.kind}</span></div>`
        )
        .join("");
      dropdown.hidden = false;
    }

    function positionDropdown(cw) {
      // approximate caret position using a mirror measurement
      const coords = caretCoords(cw.start);
      dropdown.style.left = Math.min(coords.left, host.clientWidth - 200) + "px";
      dropdown.style.top = coords.top + "px";
    }

    function hideAutocomplete() {
      dropdown.hidden = true;
      acOpen = false;
      acActive = -1;
    }

    function acceptAutocomplete() {
      if (!acOpen || acActive < 0) return false;
      let cw = currentWord();
      // right after "table." the typed word is empty, but we still want Tab/Enter
      // to insert the chosen column — synthesize a zero-length word at the caret
      if (!cw) {
        const pos = ta.selectionStart;
        if (/[A-Za-z_][A-Za-z0-9_]*\.$/.test(ta.value.slice(0, pos)))
          cw = { word: "", start: pos, pos };
      }
      if (!cw) return false;
      const it = acItems[acActive];
      if (it.kind === "snip") {
        // remove the typed prefix, then hand the snippet SQL to the app
        // (placeholder prompts live there) or insert it raw
        const v = ta.value;
        ta.value = v.slice(0, cw.start) + v.slice(cw.pos);
        ta.selectionStart = ta.selectionEnd = cw.start;
        hideAutocomplete();
        render();
        if (onSnippet) onSnippet(it.sql);
        else insert(it.sql);
        return true;
      }
      let chosen = acItems[acActive].text;
      // honor auto-caps preference for keyword/function insertions
      if ((acItems[acActive].kind === "kw" || acItems[acActive].kind === "fn") && !autoCaps)
        chosen = chosen; // keep as-is (already uppercase in list)
      const v = ta.value;
      ta.value = v.slice(0, cw.start) + chosen + v.slice(cw.pos);
      const np = cw.start + chosen.length;
      ta.selectionStart = ta.selectionEnd = np;
      hideAutocomplete();
      render();
      return true;
    }

    // mirror element to compute caret pixel coords
    let mirror = null;
    function caretCoords(index) {
      if (!mirror) {
        mirror = document.createElement("div");
        const cs = getComputedStyle(ta);
        [
          "fontFamily","fontSize","fontWeight","lineHeight","letterSpacing",
          "paddingTop","paddingRight","paddingBottom","paddingLeft",
          "borderWidth","whiteSpace","wordBreak","tabSize",
        ].forEach((p) => (mirror.style[p] = cs[p]));
        mirror.style.position = "absolute";
        mirror.style.visibility = "hidden";
        host.appendChild(mirror);
      }
      mirror.style.whiteSpace = wrapOn ? "pre-wrap" : "pre";
      mirror.style.wordBreak = wrapOn ? "break-word" : "normal";
      mirror.style.width = wrapOn ? ta.clientWidth + "px" : "auto";
      const before = ta.value.slice(0, index);
      mirror.textContent = before;
      const marker = document.createElement("span");
      marker.textContent = "​";
      mirror.appendChild(marker);
      const top = marker.offsetTop - ta.scrollTop + 22;
      const left = marker.offsetLeft - ta.scrollLeft;
      return { top, left };
    }

    // ---- key handling --------------------------------------------------
    ta.addEventListener("input", (e) => {
      render();
      // auto-capitalize the just-completed keyword when a boundary lands after it:
      // a space/paren/comma/semicolon, OR a newline (Enter → inputType insertLineBreak)
      if (autoCaps && ((e.data && /[\s(,;]/.test(e.data)) || e.inputType === "insertLineBreak"))
        capitalizeWordBefore(ta.selectionStart - 1); // the boundary/newline sits at pos-1
      showAutocomplete();
    });

    // uppercase the SQL keyword that ends right before index `pos`. Length is
    // unchanged (same word, upper-cased), so the caret/selection is preserved.
    function capitalizeWordBefore(pos) {
      if (pos <= 0) return;
      const before = ta.value.slice(0, pos);
      const m = /[A-Za-z_][A-Za-z0-9_$]*$/.exec(before);
      if (!m) return;
      const word = m[0];
      if (KW_SET.has(word.toUpperCase()) && word !== word.toUpperCase()) {
        const start = pos - word.length;
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, start) + word.toUpperCase() + ta.value.slice(pos);
        ta.selectionStart = s; ta.selectionEnd = en;
        render();
      }
    }

    ta.addEventListener("scroll", syncScroll);

    ta.addEventListener("keydown", (e) => {
      // autocomplete navigation
      if (acOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          acActive = (acActive + 1) % acItems.length;
          renderDropdown();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          acActive = (acActive - 1 + acItems.length) % acItems.length;
          renderDropdown();
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          if (acceptAutocomplete()) {
            e.preventDefault();
            return;
          }
        }
        if (e.key === "Escape") {
          hideAutocomplete();
          e.preventDefault();
          return;
        }
      }

      // comment toggle
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        toggleComment();
        return;
      }
      // duplicate line(s)
      if (e.altKey && e.shiftKey && e.key === "ArrowDown") {
        e.preventDefault();
        duplicateLines();
        return;
      }
      // auto-pairing (plain typing only)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const PAIRS = { "(": ")", "[": "]", "'": "'", '"': '"', "`": "`" };
        const s = ta.selectionStart, en = ta.selectionEnd;
        const next = ta.value[en] || "";
        // skip over an already-present closing char
        if ((e.key === ")" || e.key === "]" ||
             ((e.key === "'" || e.key === '"' || e.key === "`") && next === e.key)) &&
            s === en && next === e.key) {
          e.preventDefault();
          ta.selectionStart = ta.selectionEnd = s + 1;
          return;
        }
        if (PAIRS[e.key] && s === en &&
            (next === "" || /[\s),;\]]/.test(next))) {
          e.preventDefault();
          ta.value = ta.value.slice(0, s) + e.key + PAIRS[e.key] + ta.value.slice(en);
          ta.selectionStart = ta.selectionEnd = s + 1;
          render();
          return;
        }
      }
      // run (plain = run, shift = run current statement)
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        hideAutocomplete();
        onRun(e.shiftKey);
        return;
      }
      // manual trigger (works even when auto-popup is disabled)
      if ((e.ctrlKey || e.metaKey) && e.key === " ") {
        e.preventDefault();
        showAutocomplete(true);
        return;
      }
      // tab indents (when AC closed) — capitalize the keyword before the caret first
      if (e.key === "Tab" && !acOpen) {
        e.preventDefault();
        if (autoCaps) capitalizeWordBefore(ta.selectionStart);
        insertAtCursor(" ".repeat(tabW));
      }
    });

    // hovering an item makes it the active one (so it highlights and Enter/Tab pick it)
    dropdown.addEventListener("mousemove", (e) => {
      const item = e.target.closest(".ac-item");
      if (!item) return;
      const i = parseInt(item.dataset.i, 10);
      if (i === acActive || Number.isNaN(i)) return;
      acActive = i;
      dropdown.querySelectorAll(".ac-item").forEach((n, idx) =>
        n.classList.toggle("active", idx === acActive));
    });
    dropdown.addEventListener("mousedown", (e) => {
      const item = e.target.closest(".ac-item");
      if (!item) return;
      e.preventDefault();
      acActive = parseInt(item.dataset.i, 10);
      acceptAutocomplete();
      ta.focus();
    });

    ta.addEventListener("blur", () => setTimeout(hideAutocomplete, 120));
    // clicking anywhere outside the list dismisses it — including clicks
    // inside the editor itself (they move the caret, so the suggestions
    // no longer apply) and clicks on elements that don't steal focus
    document.addEventListener("mousedown", (e) => {
      if (acOpen && !dropdown.contains(e.target)) hideAutocomplete();
    });

    function insertAtCursor(text) {
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = s + text.length;
      render();
    }

    // full-line range covering the selection
    function lineRange() {
      const v = ta.value;
      let a = ta.selectionStart, b = ta.selectionEnd;
      while (a > 0 && v[a - 1] !== "\n") a--;
      while (b < v.length && v[b] !== "\n") b++;
      return { a, b };
    }

    function toggleComment() {
      const { a, b } = lineRange();
      const block = ta.value.slice(a, b);
      const lines = block.split("\n");
      const allCommented = lines
        .filter((l) => l.trim())
        .every((l) => /^\s*--/.test(l));
      const out = lines.map((l) => {
        if (!l.trim()) return l;
        return allCommented
          ? l.replace(/^(\s*)--\s?/, "$1")
          : l.replace(/^(\s*)/, "$1-- ");
      }).join("\n");
      ta.value = ta.value.slice(0, a) + out + ta.value.slice(b);
      ta.selectionStart = a;
      ta.selectionEnd = a + out.length;
      render();
    }

    function duplicateLines() {
      const { a, b } = lineRange();
      const block = ta.value.slice(a, b);
      const pos = ta.selectionStart;
      ta.value = ta.value.slice(0, b) + "\n" + block + ta.value.slice(b);
      const np = pos + block.length + 1;
      ta.selectionStart = ta.selectionEnd = np;
      render();
    }

    // ---- public API ----------------------------------------------------
    function getValue() {
      return ta.value;
    }
    function getSelection() {
      return ta.value.slice(ta.selectionStart, ta.selectionEnd);
    }
    function getCursor() {
      return ta.selectionStart;
    }
    function selectAll() {
      ta.focus();
      ta.select();
    }
    // native edit commands (undo/redo/cut/copy) on the focused textarea
    function exec(cmd) {
      ta.focus();
      document.execCommand(cmd);
      render();
    }
    function insert(text) {
      ta.focus();
      insertAtCursor(text);
    }
    function setValue(v) {
      ta.value = v || "";
      render();
      ta.focus();
    }
    function focus() { ta.focus(); }
    function setAutoCaps(v) { autoCaps = !!v; }
    function setTabWidth(n) { tabW = n === 4 ? 4 : 2; }
    function setWrap(v) {
      wrapOn = !!v;
      ta.wrap = wrapOn ? "soft" : "off"; // the attribute, not just CSS — Firefox honors it
      host.classList.toggle("wrap", wrapOn);
      render();
    }
    function setAutocomplete(enabled, minChars) {
      acOn = !!enabled;
      acMin = Math.max(1, Math.min(3, minChars || 1));
      if (!acOn) hideAutocomplete();
    }

    function format() {
      // lightweight pretty-printer: newline before major clauses, uppercase kw
      let sql = ta.value.replace(/\s+/g, " ").trim();
      const clauses = [
        "SELECT","FROM","WHERE","GROUP BY","HAVING","ORDER BY","LIMIT",
        "INNER JOIN","LEFT JOIN","RIGHT JOIN","FULL JOIN","JOIN","UNION ALL",
        "UNION","VALUES","SET","ON",
      ];
      // uppercase standalone keywords
      sql = sql.replace(/[A-Za-z_]+/g, (w) =>
        KW_SET.has(w.toUpperCase()) ? w.toUpperCase() : w
      );
      clauses
        .sort((a, b) => b.length - a.length)
        .forEach((cl) => {
          const r = new RegExp("\\s+" + cl.replace(/ /g, "\\s+") + "\\b", "gi");
          sql = sql.replace(r, "\n" + cl);
        });
      sql = sql.replace(/,\s*/g, ",\n  ");
      setValue(sql.trim());
    }

    render();
    return {
      getValue, getSelection, getCursor, setValue, focus, setSchema, setAutoCaps,
      setTabWidth, setWrap, setAutocomplete, setSnippets,
      format, render, selectAll, exec, insert,
    };
  }

  return { create };
})();
