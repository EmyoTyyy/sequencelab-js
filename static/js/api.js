/* =================================================================== *
 *  SequenceLab — serverless edition.
 *  Same API surface as the Flask version, but everything runs in the
 *  browser: sql.js (real SQLite compiled to WebAssembly) executes the
 *  SQL, and IndexedDB persists the database files between sessions.
 *  No Python, no server, nothing leaves the machine.
 * =================================================================== */
const API = (() => {
  "use strict";

  const quoteIdent = (n) => '"' + String(n).replace(/"/g, '""') + '"';
  const WRITE_RE = /^\s*(insert|update|delete|drop|alter|create|replace|vacuum)\b/i;
  const now = () => new Date().toISOString().slice(0, 19);

  // ----------------------------------------------------------- IndexedDB
  // stores: dbs {name -> {bytes, mtime}}, backups {key -> {...}}, kv {k -> v}
  let _idb = null;
  function idb() {
    if (_idb) return _idb;
    _idb = new Promise((resolve, reject) => {
      const req = indexedDB.open("sequencelab", 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("dbs")) d.createObjectStore("dbs");
        if (!d.objectStoreNames.contains("backups")) d.createObjectStore("backups");
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _idb;
  }
  const tx = (store, mode, fn) =>
    idb().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : undefined);
      t.onerror = () => reject(t.error);
    }));
  const idbGet = (s, k) => tx(s, "readonly", (o) => o.get(k));
  const idbPut = (s, k, v) => tx(s, "readwrite", (o) => o.put(v, k));
  const idbDel = (s, k) => tx(s, "readwrite", (o) => o.delete(k));
  const idbKeys = (s) => tx(s, "readonly", (o) => o.getAllKeys());
  const kvGet = (k) => idbGet("kv", k);
  const kvPut = (k, v) => idbPut("kv", k, v);

  // ----------------------------------------------------------- engine
  let SQLmod = null;
  const open = new Map(); // name -> { db, attached: Set<alias> }

  const SEED_SQL = `
    CREATE TABLE users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      email     TEXT    NOT NULL UNIQUE,
      age       INTEGER,
      city      TEXT,
      joined_at TEXT
    );
    CREATE TABLE products (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT    NOT NULL,
      price  REAL    NOT NULL,
      stock  INTEGER NOT NULL DEFAULT 0,
      category TEXT
    );
    CREATE TABLE orders (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER NOT NULL REFERENCES users(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity  INTEGER NOT NULL DEFAULT 1,
      ordered_at TEXT,
      status    TEXT DEFAULT 'pending'
    );
    CREATE VIEW order_details AS
      SELECT o.id AS order_id, u.name AS customer, p.name AS product,
             o.quantity AS qty, ROUND(p.price * o.quantity, 2) AS total,
             o.status AS status, o.ordered_at AS ordered_at
      FROM orders o
      JOIN users u    ON u.id = o.user_id
      JOIN products p ON p.id = o.product_id;
    INSERT INTO users(name,email,age,city,joined_at) VALUES
      ('Alice Martin','alice@example.com',34,'Paris','2024-01-15'),
      ('Bob Chen','bob@example.com',28,'Lyon','2024-02-03'),
      ('Carla Diaz','carla@example.com',41,'Marseille','2024-02-20'),
      ('David Okafor','david@example.com',22,'Paris','2024-03-11'),
      ('Emma Rossi','emma@example.com',37,'Nice','2024-03-28'),
      ('Farid Haddad','farid@example.com',45,'Lyon','2024-04-09'),
      ('Grace Liu','grace@example.com',31,'Paris','2024-05-02'),
      ('Hugo Bernard','hugo@example.com',26,'Toulouse','2024-05-19');
    INSERT INTO products(name,price,stock,category) VALUES
      ('Mechanical Keyboard',89.90,40,'Peripherals'),
      ('27" Monitor',249.00,15,'Displays'),
      ('USB-C Hub',39.50,120,'Accessories'),
      ('Ergonomic Mouse',54.00,75,'Peripherals'),
      ('Webcam 1080p',65.00,0,'Accessories'),
      ('Laptop Stand',32.00,60,'Accessories'),
      ('Noise-cancelling Headset',159.00,25,'Audio');
    INSERT INTO orders(user_id,product_id,quantity,ordered_at,status) VALUES
      (1,1,1,'2024-06-01','shipped'),(1,3,2,'2024-06-01','shipped'),
      (2,2,1,'2024-06-04','pending'),(3,7,1,'2024-06-05','delivered'),
      (4,4,1,'2024-06-07','pending'),(5,1,1,'2024-06-08','cancelled'),
      (6,6,3,'2024-06-09','shipped'),(7,3,1,'2024-06-09','pending'),
      (2,5,1,'2024-06-10','pending'),(1,2,1,'2024-06-11','delivered');
  `;

  const ready = (async () => {
    SQLmod = await initSqlJs({ locateFile: (f) => "static/vendor/" + f });
    if (!(await idbGet("dbs", "example.db"))) await seedExample();
  })();

  async function seedExample() {
    const db = new SQLmod.Database();
    db.run(SEED_SQL);
    await idbPut("dbs", "example.db", { bytes: db.export(), mtime: Date.now() });
    db.close();
  }

  async function getDb(name) {
    if (open.has(name)) return open.get(name);
    const rec = await idbGet("dbs", name);
    if (!rec) throw new Error(`No database named "${name}". Pick one in the sidebar.`);
    const db = new SQLmod.Database(rec.bytes);
    const prefs = (await kvGet("prefs")) || {};
    db.run("PRAGMA foreign_keys = " +
      ((prefs[name] || {}).foreign_keys === false ? "OFF" : "ON"));
    const h = { db, attached: new Set() };
    open.set(name, h);
    return h;
  }

  // next free name for a stored db: "app.db" -> "app-1.db" -> "app-2.db"…
  async function freeName(n) {
    if (!(await idbGet("dbs", n))) return n;
    const stem = n.replace(/\.db$/i, "");
    for (let i = 1; ; i++) {
      const cand = `${stem}-${i}.db`;
      if (!(await idbGet("dbs", cand))) return cand;
    }
  }

  async function persist(name) {
    const h = open.get(name);
    if (!h) return;
    const bytes = h.db.export();
    await idbPut("dbs", name, { bytes, mtime: Date.now() });
    writeBack(name, bytes); // live file link, when one exists (fire & forget)
  }

  // --- live file links (File System Access API, Chrome/Edge) -------------
  // When a db was opened with a link, every persisted change is also written
  // straight back into the real file on disk. The IndexedDB copy stays the
  // source of truth, so a denied permission never loses data.
  async function writeBack(name, bytes) {
    try {
      const handle = await kvGet("handle::" + name);
      if (!handle) return false;
      let perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm === "prompt")
        perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") return false;
      const w = await handle.createWritable();
      await w.write(bytes);
      await w.close();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function makeBackup(name) {
    const rec = await idbGet("dbs", name);
    if (!rec) return;
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    await idbPut("backups", `${name}::${stamp}`, {
      db: name, name: `${name.replace(/\.db$/, "")}.${stamp}.db`,
      bytes: rec.bytes, size: rec.bytes.length, mtime: Date.now(),
    });
    const keys = (await idbKeys("backups"))
      .filter((k) => k.startsWith(name + "::")).sort();
    for (const k of keys.slice(0, -5)) await idbDel("backups", k);
  }

  // attachments: { mainDb: [{alias, src}] } — src is another stored database.
  // Both Database instances share one Emscripten MEMFS, so ATTACH works by
  // pointing at the other instance's virtual filename.
  async function applyAttachments(name, h) {
    const all = (await kvGet("attachments")) || {};
    for (const a of all[name] || []) {
      if (h.attached.has(a.alias)) continue;
      try {
        const srcH = await getDb(a.src);
        h.db.run(`ATTACH DATABASE '/${srcH.db.filename}' AS ${quoteIdent(a.alias)}`);
        h.attached.add(a.alias);
      } catch (e) { /* a missing attachment must not block the main db */ }
    }
    return all[name] || [];
  }

  // ----------------------------------------------------------- sql helpers
  function execRows(db, sql, params) {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
  }
  function tableColumns(db, table) {
    const cols = execRows(db, `PRAGMA table_info(${quoteIdent(table)})`);
    if (!cols.length) throw new Error(`Table '${table}' was not found.`);
    return cols;
  }
  const b64 = (u8) => {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000)
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const jsonable = (v) =>
    v instanceof Uint8Array ? { $blob: b64(v), size: v.length } : v;
  const unblob = (v) => {
    if (v && typeof v === "object" && "$blob" in v) {
      const bin = atob(v.$blob), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    }
    return v;
  };

  // quote/comment-aware statement splitter (mirror of the old server's)
  function splitStatements(sql) {
    const out = [];
    let cur = "", i = 0, mode = null; // mode: quote char, "--" or "/*"
    const n = sql.length;
    while (i < n) {
      const c = sql[i], two = sql.substr(i, 2);
      if (mode === "--") { cur += c; if (c === "\n") mode = null; i++; continue; }
      if (mode === "/*") {
        if (two === "*/") { cur += two; i += 2; mode = null; } else { cur += c; i++; }
        continue;
      }
      if (mode) {
        cur += c;
        if (c === mode) {
          if (sql[i + 1] === mode) { cur += mode; i += 2; continue; }
          mode = null;
        }
        i++; continue;
      }
      if (two === "--") { mode = "--"; cur += two; i += 2; continue; }
      if (two === "/*") { mode = "/*"; cur += two; i += 2; continue; }
      if (c === "'" || c === '"' || c === "`") { mode = c; cur += c; i++; continue; }
      if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; i++; continue; }
      cur += c; i++;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function explainError(msg) {
    const m = String(msg).toLowerCase();
    const rules = [
      ["no such table", "The table you referenced doesn't exist in this database. Check the spelling, or look at the schema sidebar to see which tables are available."],
      ["no such column", "One of the column names doesn't exist. Make sure it's spelled correctly and belongs to the table you're querying. Expand the table in the sidebar to see its columns."],
      ["syntax error", "SQLite couldn't understand the statement. This is usually a typo, a missing comma, an unclosed quote/parenthesis, or a misplaced keyword near the highlighted spot."],
      ["unique constraint failed", "You're trying to insert or update a value that must be unique, but that value already exists in the table (for example a duplicate id or email)."],
      ["not null constraint failed", "A column that requires a value was left empty. Provide a value for every NOT NULL column."],
      ["foreign key constraint failed", "This row references another row that doesn't exist (or you're deleting a row other rows still point to). Check the related table."],
      ["datatype mismatch", "A value doesn't match the column's expected type — for example putting text where a number/integer primary key is expected."],
      ["incomplete input", "The statement looks unfinished. You may be missing a closing quote, parenthesis, or the rest of the clause."],
      ["ambiguous column name", "Two joined tables share this column name. Prefix it with the table name, e.g. users.id instead of just id."],
      ["already exists", "An object with this name already exists. Use a different name, or drop the existing one first (CREATE ... IF NOT EXISTS skips it)."],
      ["has no column named", "You're inserting into a column that doesn't exist on this table. Check the column list against the schema sidebar."],
      ["interrupted", "The query was cancelled before it finished."],
    ];
    for (const [pat, friendly] of rules) if (m.includes(pat)) return friendly;
    return "SQLite reported an error while running this statement. Read the raw message above for the specific cause.";
  }

  // Error codes — first digit is the category, so a future error console can
  // group them: 1 = SQL/syntax, 2 = constraints, 3 = our validation, 4 = not
  // found / naming, 5 = import/export/parse, 6 = mode/permission, 9 = unknown.
  const ERR_RULES = [
    [/foreign key constraint failed/, "E201", "FK"],
    [/unique constraint failed/, "E202", "UNIQUE"],
    [/not null constraint failed/, "E203", "NOTNULL"],
    [/check constraint failed/, "E204", "CHECK"],
    [/datatype mismatch/, "E205", "DATATYPE"],
    [/doesn't fit column type/, "E301", "TYPE"],
    [/duplicate primary key/, "E302", "DUPPK"],
    [/primary key .*already exists/, "E303", "PKEXISTS"],
    [/no such table/, "E401", "NOTABLE"],
    [/no such column|has no column named/, "E402", "NOCOLUMN"],
    [/ambiguous column name/, "E403", "AMBIGUOUS"],
    [/already exists/, "E404", "EXISTS"],
    [/syntax error/, "E101", "SYNTAX"],
    [/incomplete input/, "E102", "INCOMPLETE"],
    [/no such function/, "E103", "NOFUNC"],
    [/invalid json/, "E501", "JSON"],
    [/csv is empty|no rows|expected a json array/, "E502", "NODATA"],
    [/columns match|json keys match/, "E503", "NOCOLMATCH"],
    [/\.xlsx/, "E504", "XLSX"],
    [/read-only/, "E601", "READONLY"],
    [/interrupted/, "E901", "CANCELLED"],
  ];
  function errCode(msg) {
    const m = String(msg).toLowerCase();
    for (const [re, code, tag] of ERR_RULES) if (re.test(m)) return { code, tag };
    if (/\bsql\b|statement|near "|unrecognized token/.test(m)) return { code: "E110", tag: "SQL" };
    return { code: "E900", tag: "ERROR" };
  }

  const fail = (e) => {
    const msg = String((e && e.message) || e);
    const c = errCode(msg);
    return { error: `${c.code} ${c.tag} · ${msg}`, explanation: explainError(msg), code: c.code, tag: c.tag };
  };

  // generic wrapper: wait for the engine, run, map errors to the API shape
  const guard = (fn) => async (...args) => {
    await ready;
    try { return await fn(...args); }
    catch (e) { return fail(e); }
  };

  // row identifier: prefer __rowid__, else match on the provided values
  function rowIdentifier(ident) {
    if (ident && ident.__rowid__ !== undefined && ident.__rowid__ !== null)
      return ["rowid = ?", [ident.__rowid__]];
    const clauses = [], params = [];
    for (const k in ident || {}) {
      clauses.push(`${quoteIdent(k)} = ?`);
      params.push(unblob(ident[k]));
    }
    if (!clauses.length) throw new Error("Could not identify the row to modify.");
    return [clauses.join(" AND "), params];
  }

  // schema-altering helper (savepoint + optional backup + persist)
  async function alter(name, fn, backup) {
    await ready;
    let h;
    try { h = await getDb(name); } catch (e) { return fail(e); }
    if (backup) await makeBackup(name);
    h.db.run("SAVEPOINT sl_alter");
    try {
      fn(h.db);
      h.db.run("RELEASE sl_alter");
    } catch (e) {
      try { h.db.run("ROLLBACK TO sl_alter"); h.db.run("RELEASE sl_alter"); } catch (_) {}
      return fail(e);
    }
    await persist(name);
    return { ok: true };
  }

  // table rebuild (change column type / add FK) — port of the server's
  // 12-step ALTER procedure; legacy_alter_table keeps dependent views intact
  function rebuildTable(db, table, newTypes, extraFk) {
    const cols = execRows(db, `PRAGMA table_info(${quoteIdent(table)})`);
    if (!cols.length) throw new Error(`Table '${table}' was not found.`);
    const fks = execRows(db, `PRAGMA foreign_key_list(${quoteIdent(table)})`);
    const ddlRow = execRows(db,
      "SELECT sql FROM sqlite_master WHERE name = ? AND type='table'", [table])[0];
    const autoinc = ((ddlRow && ddlRow.sql) || "").toUpperCase().includes("AUTOINCREMENT");
    const pkCols = cols.filter((c) => c.pk).map((c) => c.name);
    const defs = [];
    cols.forEach((c) => {
      const ctype = (newTypes || {})[c.name] !== undefined ? newTypes[c.name] : (c.type || "");
      let d = quoteIdent(c.name) + (ctype ? " " + ctype : "");
      if (pkCols.length === 1 && c.pk) {
        d += " PRIMARY KEY";
        if (autoinc && ctype.toUpperCase().trim() === "INTEGER") d += " AUTOINCREMENT";
      }
      if (c.notnull) d += " NOT NULL";
      if (c.dflt_value !== null && c.dflt_value !== undefined)
        d += " DEFAULT " + c.dflt_value;
      defs.push(d);
    });
    if (pkCols.length > 1)
      defs.push("PRIMARY KEY (" + pkCols.map(quoteIdent).join(", ") + ")");
    const groups = {};
    fks.forEach((f) => {
      groups[f.id] = groups[f.id] || { table: f.table, from: [], to: [] };
      groups[f.id].from.push(f.from);
      groups[f.id].to.push(f.to);
    });
    if (extraFk)
      groups.__new__ = { table: extraFk.table, from: [extraFk.from], to: [extraFk.to] };
    Object.values(groups).forEach((g) => {
      defs.push("FOREIGN KEY (" + g.from.map(quoteIdent).join(", ") + ") " +
        `REFERENCES ${quoteIdent(g.table)} (` + g.to.map(quoteIdent).join(", ") + ")");
    });
    const indexDdls = execRows(db,
      "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
      [table]).map((r) => r.sql);
    const colnames = cols.map((c) => quoteIdent(c.name)).join(", ");
    const tmp = "_sl_rebuild_tmp";
    db.run("PRAGMA foreign_keys = OFF");
    db.run("PRAGMA legacy_alter_table = ON");
    db.run(`DROP TABLE IF EXISTS ${quoteIdent(tmp)}`);
    db.run(`CREATE TABLE ${quoteIdent(tmp)} (\n  ` + defs.join(",\n  ") + "\n)");
    db.run(`INSERT INTO ${quoteIdent(tmp)} (${colnames}) SELECT ${colnames} FROM ${quoteIdent(table)}`);
    db.run(`DROP TABLE ${quoteIdent(table)}`);
    db.run(`ALTER TABLE ${quoteIdent(tmp)} RENAME TO ${quoteIdent(table)}`);
    indexDdls.forEach((ddl) => db.run(ddl));
    db.run("PRAGMA legacy_alter_table = OFF");
    db.run("PRAGMA foreign_keys = ON");
  }

  // ----------------------------------------------------------- history (kv)
  async function recordHistory(token, sql, status, ms, rows) {
    const hist = (await kvGet("history")) || [];
    const last = hist[hist.length - 1];
    if (last && last.db_token === token && last.sql === sql) {
      Object.assign(last, { status, ran_at: now(), duration_ms: ms, row_count: rows });
    } else {
      hist.push({ id: Date.now(), db_token: token, sql, status,
        ran_at: now(), duration_ms: ms, row_count: rows });
      if (hist.length > 300) hist.splice(0, hist.length - 300);
    }
    await kvPut("history", hist);
  }

  // ----------------------------------------------------------- CSV
  // Pre-insert primary-key check for imports: rejects duplicate PK values
  // within the batch, and (append mode) values that already exist — with a
  // clear message — instead of SQLite's cryptic "UNIQUE constraint failed".
  // No-op when the table has no PK or the import doesn't supply the PK column(s).
  function verifyImportPk(db, table, mode, rows, providedCols, getVal) {
    const info = execRows(db, `PRAGMA table_info(${quoteIdent(table)})`);
    const pk = info.filter((c) => c.pk).sort((a, b) => a.pk - b.pk);
    if (!pk.length || !pk.every((c) => providedCols.includes(c.name))) return;
    const pkCols = pk.map((c) => c.name);
    const num = pk.map((c) => /INT|REAL|FLOA|DOUB|NUM|DEC/i.test(c.type || ""));
    const norm = (v, i) => {
      if (v === null || v === undefined || v === "") return "∅";
      if (num[i] && typeof v !== "number") {
        const s = String(v).trim();
        if (/^-?\d+(\.\d+)?$/.test(s)) return "#" + Number(s);
      }
      return typeof v === "number" ? "#" + v : "$" + String(v);
    };
    const keyOf = (row) => pkCols.map((c, i) => norm(getVal(row, c), i)).join("");
    const label = (row) => pkCols.map((c) => `${c}=${getVal(row, c)}`).join(", ");
    const seen = new Map();
    for (let i = 0; i < rows.length; i++) {
      const k = keyOf(rows[i]);
      if (k.includes("∅")) continue; // NULL/blank PK: let SQLite / autoincrement decide
      if (seen.has(k))
        throw new Error(`Duplicate primary key (${label(rows[i])}) in the import — rows ${seen.get(k) + 1} and ${i + 1}. Nothing was imported.`);
      seen.set(k, i);
    }
    if (mode !== "replace") {
      const existing = new Set(
        execRows(db, `SELECT ${pkCols.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)}`)
          .map((r) => pkCols.map((c, i) => norm(r[c], i)).join("")));
      for (let i = 0; i < rows.length; i++) {
        const k = keyOf(rows[i]);
        if (k.includes("∅")) continue;
        if (existing.has(k))
          throw new Error(`Primary key (${label(rows[i])}) already exists in "${table}" (row ${i + 1}). Nothing was imported.`);
      }
    }
  }

  // SQLite column affinity from a declared type (the standard rules).
  function sqlAffinity(t) {
    t = String(t || "").toUpperCase();
    if (t.includes("INT")) return "INTEGER";
    if (/CHAR|CLOB|TEXT/.test(t)) return "TEXT";
    if (t === "" || t.includes("BLOB")) return "BLOB";
    if (/REAL|FLOA|DOUB/.test(t)) return "REAL";
    return "NUMERIC";
  }
  // Returns an error string when a value can't fit a numeric column, else null.
  // (SQLite would silently keep it as text via affinity; we reject instead.)
  function typeMismatch(type, v) {
    if (v === null || v === undefined || v === "" || (v && typeof v === "object")) return null;
    const aff = sqlAffinity(type), s = String(v).trim();
    if (aff === "INTEGER" && !(typeof v === "number" ? Number.isInteger(v) : /^[+-]?\d+$/.test(s)))
      return `“${v}” doesn't fit column type ${type || "INTEGER"} (a whole number is expected).`;
    if (aff === "REAL" && !(typeof v === "number" || /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)))
      return `“${v}” doesn't fit column type ${type || "REAL"} (a number is expected).`;
    return null;
  }

  function parseCsv(text, delim) {
    const rows = [];
    let row = [], cur = "", inQ = false, i = 0;
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cur += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === delim) { row.push(cur); cur = ""; i++; continue; }
      if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = []; i++; continue;
      }
      cur += c; i++;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function csvField(v, delim) {
    if (v === null || v === undefined) return "";
    if (v instanceof Uint8Array) v = "<BLOB " + v.length + " B>";
    const s = String(v);
    return (s.includes(delim) || s.includes('"') || s.includes("\n"))
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function buildCsv(db, opts) {
    const delim = opts.delimiter === "tab" ? "\t" : (opts.delimiter || ",");
    const header = String(opts.header) !== "0";
    const sql = opts.sql || `SELECT * FROM ${quoteIdent(opts.table)}`;
    const stmt = db.prepare(sql);
    const cols = stmt.getColumnNames();
    const lines = [];
    if (header) lines.push(cols.map((c) => csvField(c, delim)).join(delim));
    while (stmt.step())
      lines.push(stmt.get().map((v) => csvField(v, delim)).join(delim));
    stmt.free();
    return lines.join("\n") + "\n";
  }

  // ----------------------------------------------------------- SQL dump
  const sqlLit = (v) => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    if (v instanceof Uint8Array)
      return "X'" + [...v].map((b) => b.toString(16).padStart(2, "0")).join("") + "'";
    return "'" + String(v).replace(/'/g, "''") + "'";
  };
  function buildDump(db) {
    let out = "BEGIN TRANSACTION;\n";
    const objs = execRows(db,
      "SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL " +
      "AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 " +
      "WHEN 'view' THEN 2 WHEN 'index' THEN 3 ELSE 1 END, name");
    objs.filter((o) => o.type === "table").forEach((o) => {
      out += o.sql + ";\n";
      const stmt = db.prepare(`SELECT * FROM ${quoteIdent(o.name)}`);
      while (stmt.step())
        out += `INSERT INTO ${quoteIdent(o.name)} VALUES (` +
          stmt.get().map(sqlLit).join(",") + ");\n";
      stmt.free();
    });
    objs.filter((o) => o.type !== "table").forEach((o) => { out += o.sql + ";\n"; });
    return out + "COMMIT;\n";
  }

  const blobUrl = (text, type) => URL.createObjectURL(new Blob([text], { type }));

  // =================================================================== API
  return {
    engineReady: () => ready,

    // -------------------------------------------------- databases
    listDatabases: guard(async () => {
      const keys = (await idbKeys("dbs")).sort();
      const items = [];
      for (const k of keys) {
        const rec = await idbGet("dbs", k);
        items.push({ token: k, label: k, path: "browser storage",
          size: rec.bytes.length, external: false,
          linked: !!(await kvGet("handle::" + k)) });
      }
      return { databases: items };
    }),
    createDatabase: guard(async (name) => {
      let n = (name || "").trim().replace(/[^\w.\- ]/g, "_");
      if (!n) return { error: "A name is required." };
      if (!n.endsWith(".db")) n += ".db";
      if (await idbGet("dbs", n))
        return { error: "A database with that name already exists." };
      const db = new SQLmod.Database();
      db.run("PRAGMA user_version = 0"); // force a non-empty file
      await idbPut("dbs", n, { bytes: db.export(), mtime: Date.now() });
      db.close();
      return { token: n, label: n, path: "browser storage" };
    }),
    // serverless: import a picked File instead of opening a filesystem path.
    // A name collision never overwrites an existing entry (it might hold
    // unexported edits, or be live-linked to a file on disk) — the import
    // gets a fresh "-1", "-2"… name instead, and never inherits a link.
    importDbFile: guard(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const headOk = bytes.length === 0 ||
        new TextDecoder().decode(bytes.slice(0, 15)) === "SQLite format 3";
      if (!headOk) return { error: "That file is not a valid SQLite database." };
      let n = file.name;
      if (!/\.(db|sqlite3?|db3)$/i.test(n)) n += ".db";
      n = await freeName(n);
      await idbDel("kv", "handle::" + n); // an imported copy is never linked
      await idbPut("dbs", n, { bytes, mtime: Date.now() });
      return { token: n, label: n, path: "browser storage" };
    }),
    openDatabase: guard(async () => ({
      error: "In the browser edition, use the file picker to import a .db file.",
    })),
    // live link: pick a real .db and keep a writable handle — edits are
    // saved back into the file itself, not just the browser copy
    supportsFileLink: () =>
      typeof window !== "undefined" && !!window.showOpenFilePicker,
    linkDbFile: guard(async () => {
      if (typeof window === "undefined" || !window.showOpenFilePicker)
        return { error: "Live file links need the File System Access API (Chrome/Edge). Use Import instead." };
      let handle;
      try {
        [handle] = await window.showOpenFilePicker({
          types: [{ description: "SQLite database",
            accept: { "application/x-sqlite3": [".db", ".sqlite", ".sqlite3", ".db3"] } }],
        });
      } catch (_) { return { cancelled: true }; }
      const file = await handle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const headOk = bytes.length === 0 ||
        new TextDecoder().decode(bytes.slice(0, 15)) === "SQLite format 3";
      if (!headOk) return { error: "That file is not a valid SQLite database." };
      let n = file.name;
      if (!/\.(db|sqlite3?|db3)$/i.test(n)) n += ".db";
      // re-linking the SAME file refreshes the existing entry from disk;
      // a different file that merely shares the name gets a fresh name
      const prev = await kvGet("handle::" + n);
      let sameFile = false;
      if (prev && prev.isSameEntry) {
        try { sameFile = await prev.isSameEntry(handle); } catch (_) {}
      }
      if (!sameFile && (await idbGet("dbs", n))) n = await freeName(n);
      if (open.has(n)) { open.get(n).db.close(); open.delete(n); }
      await idbPut("dbs", n, { bytes, mtime: Date.now() });
      await kvPut("handle::" + n, handle);
      return { token: n, label: n, linked: true };
    }),
    fileLink: guard(async (name) => ({ linked: !!(await kvGet("handle::" + name)) })),
    saveToFile: guard(async (name) => {
      const h = await getDb(name);
      if (!(await kvGet("handle::" + name)))
        return { error: "This database isn't linked to a file — use Download instead." };
      return (await writeBack(name, h.db.export()))
        ? { ok: true }
        : { error: "The browser refused write access to the linked file." };
    }),
    closeDatabase: guard(async (token) => {
      if (open.has(token)) { open.get(token).db.close(); open.delete(token); }
      await idbDel("dbs", token);
      await idbDel("kv", "handle::" + token);
      return { ok: true };
    }),
    resetExample: guard(async () => {
      if (open.has("example.db")) { open.get("example.db").db.close(); open.delete("example.db"); }
      await seedExample();
      return { token: "example.db", label: "example.db", path: "browser storage" };
    }),
    // download the current bytes as a real .db file (serverless extra)
    exportDbUrl: (name) => {
      const h = open.get(name);
      if (!h) return null;
      return URL.createObjectURL(
        new Blob([h.db.export()], { type: "application/x-sqlite3" }));
    },
    files: guard(async () => {
      const keys = (await idbKeys("dbs")).sort();
      const files = [];
      const bk = await idbKeys("backups");
      if (bk.length) files.push({ name: "_backups", is_dir: true, is_db: false,
        size: 0, count: bk.length, mtime: "" });
      for (const k of keys) {
        const rec = await idbGet("dbs", k);
        files.push({ name: k, size: rec.bytes.length, is_db: true, is_dir: false,
          linked: !!(await kvGet("handle::" + k)),
          mtime: new Date(rec.mtime).toISOString().slice(0, 16).replace("T", " ") });
      }
      return { dir: "Browser storage (IndexedDB)", files, external: [] };
    }),

    // -------------------------------------------------- schema
    listTables: guard(async (name) => {
      const h = await getDb(name);
      const out = [];
      execRows(h.db,
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') " +
        "AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
      ).forEach((r) => {
        let count = null;
        try {
          count = execRows(h.db, `SELECT COUNT(*) AS c FROM ${quoteIdent(r.name)}`)[0].c;
        } catch (_) {}
        out.push({ name: r.name, type: r.type, rows: count });
      });
      return { tables: out };
    }),
    schema: guard(async (name, table) => {
      const h = await getDb(name);
      const colsFor = (t) => ({
        cols: execRows(h.db, `PRAGMA table_info(${quoteIdent(t)})`).map((c) => ({
          name: c.name, type: c.type || "", notnull: !!c.notnull,
          pk: !!c.pk, default: c.dflt_value,
        })),
        fks: execRows(h.db, `PRAGMA foreign_key_list(${quoteIdent(t)})`).map((f) => ({
          from: f.from, table: f.table, to: f.to,
        })),
      });
      if (table) {
        const { cols, fks } = colsFor(table);
        const ddl = execRows(h.db,
          "SELECT sql FROM sqlite_master WHERE name = ?", [table])[0];
        return { table, columns: cols, foreign_keys: fks, ddl: ddl ? ddl.sql : null };
      }
      const schema = {};
      execRows(h.db,
        "SELECT name FROM sqlite_master WHERE type IN ('table','view') " +
        "AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).forEach((r) => { schema[r.name] = colsFor(r.name).cols.map((c) => c.name); });
      return { schema };
    }),
    diagram: guard(async (name) => {
      const h = await getDb(name);
      const tables = execRows(h.db,
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') " +
        "AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).map((r) => ({
        name: r.name, type: r.type,
        columns: execRows(h.db, `PRAGMA table_info(${quoteIdent(r.name)})`).map((c) => ({
          name: c.name, type: c.type || "", notnull: !!c.notnull, pk: !!c.pk,
        })),
        foreign_keys: execRows(h.db, `PRAGMA foreign_key_list(${quoteIdent(r.name)})`)
          .map((f) => ({ from: f.from, table: f.table, to: f.to })),
      }));
      return { tables };
    }),

    // -------------------------------------------------- table / column editing
    addColumn: (p) => alter(p.db, (db) => {
      let sql = `ALTER TABLE ${quoteIdent(p.table)} ADD COLUMN ${quoteIdent(p.name)}`;
      if (p.type) sql += " " + p.type;
      if (p.notnull) sql += " NOT NULL";
      if (p.default !== undefined && p.default !== "") {
        const d = p.default;
        sql += " DEFAULT " + (isNaN(Number(d)) ? sqlLit(d) : Number(d));
      }
      db.run(sql);
    }),
    renameColumn: (p) => alter(p.db, (db) =>
      db.run(`ALTER TABLE ${quoteIdent(p.table)} RENAME COLUMN ${quoteIdent(p.old)} TO ${quoteIdent(p.new)}`)),
    dropColumn: (p) => alter(p.db, (db) =>
      db.run(`ALTER TABLE ${quoteIdent(p.table)} DROP COLUMN ${quoteIdent(p.column)}`), p.backup),
    renameTable: (p) => alter(p.db, (db) =>
      db.run(`ALTER TABLE ${quoteIdent(p.table)} RENAME TO ${quoteIdent(p.new)}`)),
    dropTable: (p) => alter(p.db, (db) => {
      const row = execRows(db, "SELECT type FROM sqlite_master WHERE name = ?", [p.table])[0];
      const kind = row && row.type === "view" ? "VIEW" : "TABLE";
      db.run(`DROP ${kind} IF EXISTS ${quoteIdent(p.table)}`);
    }, p.backup),
    changeColumn: (p) => alter(p.db, (db) => {
      const cols = new Set(tableColumns(db, p.table).map((c) => c.name));
      if (!cols.has(p.column)) throw new Error(`Column '${p.column}' does not exist.`);
      rebuildTable(db, p.table, { [p.column]: p.type });
    }, p.backup),
    addFk: (p) => alter(p.db, (db) => {
      const cols = new Set(tableColumns(db, p.table).map((c) => c.name));
      if (!cols.has(p.column)) throw new Error(`Column '${p.column}' does not exist.`);
      rebuildTable(db, p.table, null,
        { from: p.column, table: p.ref_table, to: p.ref_column });
    }, p.backup),

    // -------------------------------------------------- indexes
    indexes: guard(async (name, table) => {
      const h = await getDb(name);
      const list = execRows(h.db, `PRAGMA index_list(${quoteIdent(table)})`)
        .filter((ix) => ix.origin === "c")
        .map((ix) => ({
          name: ix.name, unique: !!ix.unique,
          columns: execRows(h.db, `PRAGMA index_info(${quoteIdent(ix.name)})`)
            .map((c) => c.name),
        }));
      return { indexes: list };
    }),
    createIndex: (p) => alter(p.db, (db) => {
      if (!p.name || !(p.columns || []).length)
        throw new Error("Index name and at least one column are required.");
      db.run(`CREATE ${p.unique ? "UNIQUE " : ""}INDEX ${quoteIdent(p.name)} ` +
        `ON ${quoteIdent(p.table)} (` + p.columns.map(quoteIdent).join(", ") + ")");
    }),
    dropIndex: (p) => alter(p.db, (db) =>
      db.run(`DROP INDEX IF EXISTS ${quoteIdent(p.name)}`)),

    // -------------------------------------------------- triggers
    triggers: guard(async (name, table) => {
      const h = await getDb(name);
      let q = "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger'";
      const args = [];
      if (table) { q += " AND tbl_name = ?"; args.push(table); }
      return { triggers: execRows(h.db, q + " ORDER BY name", args)
        .map((r) => ({ name: r.name, table: r.tbl_name, sql: r.sql })) };
    }),
    createTrigger: (p) => alter(p.db, (db) => {
      const timing = (p.timing || "AFTER").toUpperCase();
      const event = (p.event || "").toUpperCase();
      if (!["BEFORE", "AFTER", "INSTEAD OF"].includes(timing) ||
          !["INSERT", "UPDATE", "DELETE"].includes(event))
        throw new Error("Invalid trigger timing or event.");
      if (!p.name || !p.body) throw new Error("Trigger name and body are required.");
      db.run(`CREATE TRIGGER ${quoteIdent(p.name)} ${timing} ${event} ` +
        `ON ${quoteIdent(p.table)}\nBEGIN\n  ${p.body.trim().replace(/;$/, "")};\nEND`);
    }),
    dropTrigger: (name, trg) => alter(name, (db) =>
      db.run(`DROP TRIGGER ${quoteIdent(trg)}`)),

    // -------------------------------------------------- pragma
    pragma: guard(async (name) => {
      const h = await getDb(name);
      const g = (n) => {
        const r = execRows(h.db, "PRAGMA " + n)[0];
        return r ? Object.values(r)[0] : null;
      };
      const prefs = (await kvGet("prefs")) || {};
      return {
        foreign_keys: (prefs[name] || {}).foreign_keys !== false,
        journal_mode: g("journal_mode"), auto_vacuum: g("auto_vacuum"),
        page_size: g("page_size"), encoding: g("encoding"),
        user_version: g("user_version"),
      };
    }),
    setPragma: guard(async (p) => {
      const h = await getDb(p.db);
      if (p.name === "foreign_keys") {
        const prefs = (await kvGet("prefs")) || {};
        prefs[p.db] = Object.assign(prefs[p.db] || {}, { foreign_keys: !!p.value });
        await kvPut("prefs", prefs);
        h.db.run("PRAGMA foreign_keys = " + (p.value ? "ON" : "OFF"));
        return { ok: true, value: !!p.value };
      }
      if (p.name === "journal_mode") {
        const v = String(p.value).toLowerCase();
        if (!["delete", "wal", "truncate", "persist", "memory"].includes(v))
          return { error: "Invalid journal mode." };
        const r = execRows(h.db, "PRAGMA journal_mode = " + v)[0];
        await persist(p.db);
        return { ok: true, value: r ? Object.values(r)[0] : v };
      }
      if (p.name === "user_version") {
        h.db.run("PRAGMA user_version = " + (parseInt(p.value, 10) || 0));
        await persist(p.db);
        return { ok: true, value: parseInt(p.value, 10) || 0 };
      }
      if (p.name === "auto_vacuum") {
        const v = parseInt(p.value, 10);
        if (![0, 1, 2].includes(v)) return { error: "Invalid auto_vacuum value." };
        h.db.run("PRAGMA auto_vacuum = " + v);
        h.db.run("VACUUM"); // auto_vacuum only takes effect after VACUUM
        await persist(p.db);
        return { ok: true, value: v };
      }
      return { error: "This pragma can't be changed here." };
    }),

    // -------------------------------------------------- global search
    search: guard(async (name, q) => {
      q = (q || "").trim();
      if (!q) return { results: [], truncated: false };
      const h = await getDb(name);
      const like = `%${q}%`, ql = q.toLowerCase();
      const PER = 10, TOTAL = 120;
      const results = [];
      let truncated = false;
      const tables = execRows(h.db,
        "SELECT name FROM sqlite_master WHERE type IN ('table','view') " +
        "AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);
      for (const t of tables) {
        if (results.length >= TOTAL) { truncated = true; break; }
        let rows, cols;
        try {
          cols = execRows(h.db, `PRAGMA table_info(${quoteIdent(t)})`).map((c) => c.name);
          if (!cols.length) continue;
          const where = cols.map((c) => `CAST(${quoteIdent(c)} AS TEXT) LIKE ?`).join(" OR ");
          rows = execRows(h.db,
            `SELECT * FROM ${quoteIdent(t)} WHERE ${where} LIMIT ${PER + 1}`,
            cols.map(() => like));
        } catch (_) { continue; }
        if (rows.length > PER) { truncated = true; rows = rows.slice(0, PER); }
        for (const row of rows) {
          for (const c of cols) {
            const v = row[c];
            if (v === null || v instanceof Uint8Array) continue;
            const s = String(v);
            if (s.toLowerCase().includes(ql)) {
              results.push({ table: t, column: c, value: s.slice(0, 120) });
              break;
            }
          }
        }
      }
      return { results: results.slice(0, TOTAL), truncated };
    }),

    // -------------------------------------------------- JSON import
    importJson: guard(async (p) => {
      const table = (p.table || "").trim();
      if (!table) return { error: "Target table required." };
      let data;
      try { data = JSON.parse(p.json || ""); }
      catch (e) { return { error: "Invalid JSON: " + e.message }; }
      if (data && !Array.isArray(data) && typeof data === "object") data = [data];
      if (!Array.isArray(data) || !data.length ||
          !data.every((r) => r && typeof r === "object" && !Array.isArray(r)))
        return { error: 'Expected a JSON array of objects (e.g. [{"name": "Ada"}, …]).' };
      const cols = [];
      data.forEach((r) => Object.keys(r).forEach((k) => {
        if (!cols.includes(k)) cols.push(k);
      }));
      const affinity = (key) => {
        const vals = data.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
        if (vals.length && vals.every((v) => typeof v === "boolean" || Number.isInteger(v)))
          return "INTEGER";
        if (vals.length && vals.every((v) => typeof v === "number" || typeof v === "boolean"))
          return "REAL";
        return "TEXT";
      };
      const h = await getDb(p.db);
      if (p.backup) await makeBackup(p.db);
      h.db.run("SAVEPOINT sl_json");
      let n = 0;
      try {
        const exists = execRows(h.db,
          "SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name = ?", [table]).length;
        if (!exists) {
          if (!p.create)
            throw new Error(`Table "${table}" does not exist (tick "create table" to make it).`);
          h.db.run(`CREATE TABLE ${quoteIdent(table)} (` +
            cols.map((c) => `${quoteIdent(c)} ${affinity(c)}`).join(", ") + ")");
        } else if (p.mode === "replace") {
          h.db.run(`DELETE FROM ${quoteIdent(table)}`);
        }
        const live = execRows(h.db, `PRAGMA table_info(${quoteIdent(table)})`)
          .map((c) => c.name);
        const use = cols.filter((c) => live.includes(c));
        if (!use.length) throw new Error("No JSON keys match the table's columns.");
        if (p.mode !== "upsert") verifyImportPk(h.db, table, p.mode, data, use, (row, col) => row[col]);
        const ins = h.db.prepare(`INSERT ${p.mode === "upsert" ? "OR REPLACE " : ""}INTO ${quoteIdent(table)} (` +
          use.map(quoteIdent).join(", ") + ") VALUES (" +
          use.map(() => "?").join(", ") + ")");
        data.forEach((r) => {
          ins.run(use.map((c) => {
            let v = r[c];
            if (v === undefined) v = null;
            else if (typeof v === "object" && v !== null) v = JSON.stringify(v);
            else if (typeof v === "boolean") v = v ? 1 : 0;
            return v;
          }));
          n++;
        });
        ins.free();
        h.db.run("RELEASE sl_json");
      } catch (e) {
        try { h.db.run("ROLLBACK TO sl_json"); h.db.run("RELEASE sl_json"); } catch (_) {}
        return fail(e);
      }
      await persist(p.db);
      return { ok: true, inserted: n, table };
    }),

    // -------------------------------------------------- dump / sql import
    dumpUrl: (name) => {
      const h = open.get(name);
      if (!h) return "#";
      return blobUrl(buildDump(h.db), "application/sql");
    },
    importSql: guard(async (p) => {
      const h = await getDb(p.db);
      if (p.backup) await makeBackup(p.db);
      h.db.run("SAVEPOINT sl_imp");
      try { h.db.run(p.sql); h.db.run("RELEASE sl_imp"); }
      catch (e) {
        try { h.db.run("ROLLBACK TO sl_imp"); h.db.run("RELEASE sl_imp"); } catch (_) {}
        return fail(e);
      }
      await persist(p.db);
      return { ok: true };
    }),

    // -------------------------------------------------- backups
    backups: guard(async (name) => {
      const keys = (await idbKeys("backups"))
        .filter((k) => k.startsWith(name + "::")).sort().reverse();
      const out = [];
      for (const k of keys) {
        const b = await idbGet("backups", k);
        out.push({ name: b.name, size: b.size,
          mtime: new Date(b.mtime).toISOString().slice(0, 19).replace("T", " ") });
      }
      return { backups: out };
    }),
    restoreBackup: guard(async (name, bname) => {
      for (const k of await idbKeys("backups")) {
        const b = await idbGet("backups", k);
        if (b.name === bname && b.db === name) {
          await makeBackup(name); // safety copy of the current state first
          await idbPut("dbs", name, { bytes: b.bytes, mtime: Date.now() });
          if (open.has(name)) { open.get(name).db.close(); open.delete(name); }
          return { ok: true };
        }
      }
      return { error: "Backup not found." };
    }),
    deleteBackup: guard(async (name, bname) => {
      for (const k of await idbKeys("backups")) {
        const b = await idbGet("backups", k);
        if (b.name === bname && b.db === name) {
          await idbDel("backups", k);
          return { ok: true };
        }
      }
      return { error: "Backup not found." };
    }),

    // -------------------------------------------------- attachments
    attachments: guard(async (name) => {
      const all = (await kvGet("attachments")) || {};
      return { attachments: (all[name] || [])
        .map((a) => ({ alias: a.alias, path: a.src })) };
    }),
    addAttachment: guard(async (p) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.alias || ""))
        return { error: "Alias must be a simple identifier (letters, digits, _)." };
      if (p.path === p.db) return { error: "Can't attach a database to itself." };
      if (!(await idbGet("dbs", p.path)))
        return { error: `No stored database named "${p.path}".` };
      const all = (await kvGet("attachments")) || {};
      all[p.db] = (all[p.db] || []).filter((a) => a.alias !== p.alias);
      all[p.db].push({ alias: p.alias, src: p.path });
      await kvPut("attachments", all);
      return { ok: true, alias: p.alias };
    }),
    removeAttachment: guard(async (name, alias) => {
      const all = (await kvGet("attachments")) || {};
      all[name] = (all[name] || []).filter((a) => a.alias !== alias);
      await kvPut("attachments", all);
      const h = open.get(name);
      if (h && h.attached.has(alias)) {
        try { h.db.run(`DETACH DATABASE ${quoteIdent(alias)}`); } catch (_) {}
        h.attached.delete(alias);
      }
      return { ok: true };
    }),

    // -------------------------------------------------- query
    query: guard(async (name, sql, record = true, backup = false) => {
      const h = await getDb(name);
      const attached = await applyAttachments(name, h);
      const statements = splitStatements(sql);
      if (!statements.length)
        return { results: [], error: "No SQL statement to run.",
          explanation: "Write a statement first — for example SELECT * FROM users;" };
      const isWrite = statements.some((s) => WRITE_RE.test(s));
      if (backup && isWrite) await makeBackup(name);
      const results = [];
      const t0 = performance.now();
      let error = null;
      h.db.run("SAVEPOINT sl_run");
      try {
        for (const stmt of statements) {
          const s0 = performance.now();
          const prep = h.db.prepare(stmt);
          const cols = prep.getColumnNames();
          if (cols.length) {
            const rows = [];
            while (prep.step()) rows.push(prep.get().map(jsonable));
            prep.free();
            results.push({ statement: stmt, kind: "rows", columns: cols,
              rows, row_count: rows.length,
              duration_ms: Math.round((performance.now() - s0) * 100) / 100 });
          } else {
            prep.step();
            prep.free();
            const last = execRows(h.db, "SELECT last_insert_rowid() AS r")[0].r;
            results.push({ statement: stmt, kind: "write",
              rows_affected: h.db.getRowsModified(),
              last_insert_rowid: last,
              duration_ms: Math.round((performance.now() - s0) * 100) / 100 });
          }
        }
        h.db.run("RELEASE sl_run");
      } catch (e) {
        try { h.db.run("ROLLBACK TO sl_run"); h.db.run("RELEASE sl_run"); } catch (_) {}
        error = String(e.message || e);
      }
      const totalMs = Math.round((performance.now() - t0) * 100) / 100;
      if (!error && isWrite) {
        await persist(name);
        for (const a of attached) await persist(a.src); // cross-db writes
      }
      if (record && sql.trim()) {
        const totalRows = results.reduce((s, r) => s + (r.row_count || 0), 0);
        await recordHistory(name, sql, error ? "error" : "ok", totalMs, totalRows);
      }
      const payload = { results, duration_ms: totalMs };
      if (error) {
        const c = errCode(error);
        payload.error = `${c.code} ${c.tag} · ${error}`;
        payload.explanation = explainError(error);
        payload.code = c.code; payload.tag = c.tag;
      }
      return payload;
    }),
    cancelQuery: async () => ({
      ok: false, note: "Queries run synchronously in the browser edition.",
    }),

    // dry-run a write query in a savepoint, build each affected table's resulting
    // rows tagged add / del / edit, then roll back (nothing is committed/persisted).
    previewWrite: guard(async (name, sql) => {
      const h = await getDb(name);
      const CAP = 2000;
      const listTables = () => execRows(h.db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map((r) => r.name);
      const snap = (t) => {
        let info;
        try { info = execRows(h.db, `PRAGMA table_info(${quoteIdent(t)})`); } catch (_) { return null; }
        if (!info.length) return null;
        const cols = info.map((c) => c.name);
        let rows;
        try { rows = execRows(h.db, `SELECT rowid AS __rid, * FROM ${quoteIdent(t)}`); }
        catch (_) { return { cols, map: null }; } // WITHOUT ROWID / view → can't diff
        const m = new Map();
        rows.forEach((r) => { const o = {}; for (const k in r) o[k] = jsonable(r[k]); m.set(r.__rid, o); });
        return { cols, map: m };
      };
      const beforeTables = listTables();
      const before = {};
      beforeTables.forEach((t) => { before[t] = snap(t); });
      h.db.run("SAVEPOINT sl_preview");
      try { h.db.exec(sql); }
      catch (e) {
        try { h.db.run("ROLLBACK TO sl_preview"); h.db.run("RELEASE sl_preview"); } catch (_) {}
        return fail(e);
      }
      const afterTables = listTables();
      const after = {};
      afterTables.forEach((t) => { after[t] = snap(t); });
      h.db.run("ROLLBACK TO sl_preview");
      h.db.run("RELEASE sl_preview");

      const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      const tables = [];
      [...new Set([...beforeTables, ...afterTables])].sort().forEach((t) => {
        const b = before[t], a = after[t];
        const cols = (a && a.cols) || (b && b.cols);
        if (!cols) return;
        const cellsOf = (row) => cols.map((c) => (row[c] === undefined ? null : row[c]));
        const bm = b && b.map, am = a && a.map;
        const rows = []; let adds = 0, dels = 0, edits = 0;
        if (bm && am) {
          bm.forEach((row, rid) => {
            if (!am.has(rid)) { rows.push({ cells: cellsOf(row), status: "del" }); dels++; return; }
            const ar = am.get(rid);
            if (cols.some((c) => !eq(row[c], ar[c]))) { rows.push({ cells: cellsOf(ar), status: "edit" }); edits++; }
            else rows.push({ cells: cellsOf(row), status: "" });
          });
          am.forEach((row, rid) => { if (!bm.has(rid)) { rows.push({ cells: cellsOf(row), status: "add" }); adds++; } });
        } else if (am && !bm) {
          am.forEach((row) => { rows.push({ cells: cellsOf(row), status: "add" }); adds++; });
        } else if (bm && !am) {
          bm.forEach((row) => { rows.push({ cells: cellsOf(row), status: "del" }); dels++; });
        }
        if (adds || dels || edits)
          tables.push({ table: t, columns: cols, rows: rows.slice(0, CAP), adds, dels, edits, truncated: rows.length > CAP });
      });
      return { tables };
    }),

    // -------------------------------------------------- rows (browse)
    browse: guard(async (name, table, opts = {}) => {
      const h = await getDb(name);
      const cols = tableColumns(h.db, table);
      const colnames = cols.map((c) => c.name);
      const pkCols = cols.filter((c) => c.pk).map((c) => c.name);
      const limit = Math.max(1, Math.min(parseInt(opts.limit || 100, 10), 1000));
      const offset = Math.max(0, parseInt(opts.offset || 0, 10));
      const dir = String(opts.order_dir || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
      const orderClause = opts.order_by && colnames.includes(opts.order_by)
        ? ` ORDER BY ${quoteIdent(opts.order_by)} ${dir}` : "";
      const where = (opts.where || "").trim();
      const whereClause = where ? ` WHERE ${where}` : "";
      const total = execRows(h.db,
        `SELECT COUNT(*) AS c FROM ${quoteIdent(table)}${whereClause}`)[0].c;
      let rows, hasRowid = true;
      try {
        rows = execRows(h.db,
          `SELECT rowid AS __rowid__, * FROM ${quoteIdent(table)}${whereClause}${orderClause} LIMIT ? OFFSET ?`,
          [limit, offset]);
      } catch (e) {
        if (where && String(e.message || e).toLowerCase().includes("no such column"))
          throw e;
        hasRowid = false; // WITHOUT ROWID tables / views have no rowid
        rows = execRows(h.db,
          `SELECT * FROM ${quoteIdent(table)}${whereClause}${orderClause} LIMIT ? OFFSET ?`,
          [limit, offset]);
      }
      rows = rows.map((r) => {
        const o = {};
        for (const k in r) o[k] = jsonable(r[k]);
        return o;
      });
      return {
        columns: cols.map((c) => ({ name: c.name, type: c.type,
          pk: !!c.pk, notnull: !!c.notnull })),
        rows, total, limit, offset, pk_cols: pkCols, has_rowid: hasRowid,
      };
    }),
    updateRow: guard(async (name, table, identifier, changes) => {
      const h = await getDb(name);
      const byName = {}; tableColumns(h.db, table).forEach((c) => (byName[c.name] = c));
      for (const c in changes) {
        if (!byName[c]) return { error: `Unknown column '${c}'.` };
        const bad = typeMismatch(byName[c].type, changes[c]);
        if (bad) return { error: bad };
      }
      if (!Object.keys(changes || {}).length) return { error: "No changes provided." };
      const [whereSql, whereParams] = rowIdentifier(identifier);
      h.db.run(`UPDATE ${quoteIdent(table)} SET ` +
        Object.keys(changes).map((c) => `${quoteIdent(c)} = ?`).join(", ") +
        ` WHERE ${whereSql}`,
        Object.values(changes).map(unblob).concat(whereParams));
      await persist(name);
      return { ok: true };
    }),
    insertRow: guard(async (name, table, values) => {
      const h = await getDb(name);
      const cols = new Set(tableColumns(h.db, table).map((c) => c.name));
      const clean = {};
      for (const k in values || {}) if (cols.has(k)) clean[k] = unblob(values[k]);
      if (Object.keys(clean).length)
        h.db.run(`INSERT INTO ${quoteIdent(table)} (` +
          Object.keys(clean).map(quoteIdent).join(", ") + ") VALUES (" +
          Object.keys(clean).map(() => "?").join(", ") + ")",
          Object.values(clean));
      else h.db.run(`INSERT INTO ${quoteIdent(table)} DEFAULT VALUES`);
      const rowid = execRows(h.db, "SELECT last_insert_rowid() AS r")[0].r;
      await persist(name);
      return { ok: true, rowid };
    }),
    deleteRow: guard(async (name, table, identifier) => {
      const h = await getDb(name);
      tableColumns(h.db, table); // validates the table exists
      const [whereSql, whereParams] = rowIdentifier(identifier);
      h.db.run(`DELETE FROM ${quoteIdent(table)} WHERE ${whereSql}`, whereParams);
      await persist(name);
      return { ok: true };
    }),

    // -------------------------------------------------- CSV
    importCsv: guard(async (p) => {
      const table = (p.table || "").trim();
      if (!table) return { error: "Target table required." };
      const rows = parseCsv(p.csv || "",
        (p.delimiter === "tab" ? "\t" : p.delimiter) || ",");
      if (!rows.length) return { error: "The CSV is empty." };
      const header = p.has_header !== false;
      const headers = header
        ? rows[0].map((c, i) => (c.trim() || "col" + (i + 1)))
        : rows[0].map((_, i) => "col" + (i + 1));
      const dataRows = header ? rows.slice(1) : rows;
      const h = await getDb(p.db);
      h.db.run("SAVEPOINT sl_csv");
      let n = 0;
      try {
        const exists = execRows(h.db,
          "SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name = ?", [table]).length;
        if (!exists) {
          if (!p.create_table)
            throw new Error(`Table "${table}" does not exist (enable "create table").`);
          h.db.run(`CREATE TABLE ${quoteIdent(table)} (` +
            headers.map((c) => `${quoteIdent(c)} TEXT`).join(", ") + ")");
        } else if (p.mode === "replace") {
          h.db.run(`DELETE FROM ${quoteIdent(table)}`);
        }
        const live = execRows(h.db, `PRAGMA table_info(${quoteIdent(table)})`)
          .map((c) => c.name);
        const use = headers.map((c, i) => ({ c, i })).filter((x) => live.includes(x.c));
        if (!use.length) throw new Error("No CSV columns match the table's columns.");
        if (p.mode !== "upsert") {
          const pkRows = dataRows.filter((r) => !r.every((v) => v === ""));
          verifyImportPk(h.db, table, p.mode, pkRows, use.map((x) => x.c), (row, col) => {
            const u = use.find((x) => x.c === col);
            return u ? (row[u.i] === "" || row[u.i] === undefined ? null : row[u.i]) : null;
          });
        }
        const ins = h.db.prepare(`INSERT ${p.mode === "upsert" ? "OR REPLACE " : ""}INTO ${quoteIdent(table)} (` +
          use.map((x) => quoteIdent(x.c)).join(", ") + ") VALUES (" +
          use.map(() => "?").join(", ") + ")");
        dataRows.forEach((r) => {
          if (r.every((v) => v === "")) return;
          ins.run(use.map((x) =>
            (r[x.i] === "" || r[x.i] === undefined ? null : r[x.i])));
          n++;
        });
        ins.free();
        h.db.run("RELEASE sl_csv");
      } catch (e) {
        try { h.db.run("ROLLBACK TO sl_csv"); h.db.run("RELEASE sl_csv"); } catch (_) {}
        return fail(e);
      }
      await persist(p.db);
      return { ok: true, inserted: n, table };
    }),
    exportUrl: (name, opts = {}) => {
      const h = open.get(name);
      if (!h) return "#";
      try { return blobUrl(buildCsv(h.db, opts), "text/csv"); }
      catch (e) { return "#"; }
    },

    // -------------------------------------------------- history & snippets
    history: guard(async (name) => {
      const hist = (await kvGet("history")) || [];
      return { history: hist.filter((x) => x.db_token === name).slice(-100).reverse() };
    }),
    clearHistory: guard(async () => {
      await kvPut("history", []);
      return { ok: true };
    }),
    snippets: guard(async () => ({ snippets: (await kvGet("snippets")) || [] })),
    saveSnippet: guard(async (s) => {
      const list = (await kvGet("snippets")) || [];
      if (s.id) {
        const ex = list.find((x) => x.id === s.id);
        if (ex) Object.assign(ex, { title: s.title, sql: s.sql });
      } else {
        list.push({ id: Date.now(), title: s.title, sql: s.sql });
      }
      await kvPut("snippets", list);
      return { ok: true };
    }),
    deleteSnippet: guard(async (id) => {
      const list = ((await kvGet("snippets")) || [])
        .filter((x) => x.id !== Number(id) && x.id !== id);
      await kvPut("snippets", list);
      return { ok: true };
    }),

    // -------------------------------------------------- health
    health: guard(async () => {
      const db = new SQLmod.Database();
      const v = execRows(db, "SELECT sqlite_version() AS v")[0].v;
      db.close();
      return { ok: true, sqlite: v };
    }),

    // -------------------------------------------------- debug / reset
    // close the cached connection + drop in-memory handles, then delete the
    // whole IndexedDB (every database + backups + kv). Caller reloads after.
    wipeStorage: async () => {
      try { if (_idb) { const d = await _idb; d.close(); } } catch (_) {}
      _idb = null;
      open.clear();
      await new Promise((resolve) => {
        try {
          const req = indexedDB.deleteDatabase("sequencelab");
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        } catch (_) { resolve(); }
      });
      return { ok: true };
    },
  };
})();
