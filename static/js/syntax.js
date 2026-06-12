/* =================================================================== *
 *  SequenceLab — SQL syntax reference panel.
 *  Clickable category boxes that expand to a syntax template + a
 *  runnable example, plus a grouped reference of SQLite functions.
 *  Modelled on the "Syntax" tab from sqliteonline.com.
 * =================================================================== */
window.Syntax = (function () {
  "use strict";

  // {placeholder}  [optional]  — notation matches the sqliteonline convention.
  const REF = [
    {
      id: "select", title: "SELECT",
      syntax: [
        "SELECT [DISTINCT] {columns}",
        "FROM {table}",
        "[JOIN {table} ON {condition}]",
        "[WHERE {condition}]",
        "[GROUP BY {columns}] [HAVING {condition}]",
        "[ORDER BY {columns} [ASC|DESC]]",
        "[LIMIT {count} [OFFSET {n}]]",
      ],
      example:
        "SELECT u.name, COUNT(o.id) AS orders\n" +
        "FROM users u\n" +
        "LEFT JOIN orders o ON o.user_id = u.id\n" +
        "GROUP BY u.id\n" +
        "ORDER BY orders DESC\n" +
        "LIMIT 5;",
    },
    {
      id: "insert", title: "INSERT",
      syntax: [
        "INSERT INTO {table} ( {columns} ) VALUES ( {values} )",
        "-- multiple rows: VALUES (...), (...), ...",
        "-- from a query: INSERT INTO {table} {select-stmt}",
        "-- INSERT OR REPLACE / OR IGNORE for conflict handling",
      ],
      example:
        "INSERT INTO users (name, email, age)\n" +
        "VALUES ('Mara Vidal', 'mara@example.com', 29);",
    },
    {
      id: "update", title: "UPDATE",
      syntax: [
        "UPDATE {table}",
        "SET {column} = {value} [, {column} = {value} ...]",
        "[WHERE {condition}]",
      ],
      example: "UPDATE products\nSET price = price * 1.1\nWHERE category = 'Audio';",
    },
    {
      id: "delete", title: "DELETE",
      syntax: ["DELETE FROM {table} [WHERE {condition}]",
               "-- omit WHERE to delete every row"],
      example: "DELETE FROM orders\nWHERE status = 'cancelled';",
    },
    {
      id: "create-table", title: "CREATE TABLE",
      syntax: [
        "CREATE [TEMP] TABLE [IF NOT EXISTS] {name} ( {column}, ... ) [WITHOUT ROWID]",
        "-- {column} : {name} [{type}] [{constraints}]",
        "-- constraints: PRIMARY KEY | NOT NULL | UNIQUE | DEFAULT {v}",
        "--              | CHECK ({expr}) | REFERENCES {table}({col})",
        "-- auto increment: INTEGER PRIMARY KEY AUTOINCREMENT",
      ],
      example:
        "CREATE TABLE demo2 (\n" +
        "  id   INTEGER PRIMARY KEY AUTOINCREMENT,\n" +
        "  name VARCHAR(20),\n" +
        "  hint TEXT\n" +
        ");",
    },
    {
      id: "alter-table", title: "ALTER TABLE",
      syntax: [
        "ALTER TABLE {table} RENAME TO {new-name}",
        "ALTER TABLE {table} RENAME COLUMN {old} TO {new}",
        "ALTER TABLE {table} ADD COLUMN {column-def}",
        "ALTER TABLE {table} DROP COLUMN {column}",
      ],
      example: "ALTER TABLE users ADD COLUMN phone TEXT;",
    },
    {
      id: "create-index", title: "CREATE INDEX",
      syntax: [
        "CREATE [UNIQUE] INDEX [IF NOT EXISTS] {name}",
        "ON {table} ( {columns} ) [WHERE {condition}]",
      ],
      example: "CREATE INDEX idx_users_city ON users (city);",
    },
    {
      id: "drop-index", title: "DROP INDEX",
      syntax: ["DROP INDEX [IF EXISTS] {name}"],
      example: "DROP INDEX IF EXISTS idx_users_city;",
    },
    {
      id: "create-view", title: "CREATE VIEW",
      syntax: [
        "CREATE [TEMP] VIEW [IF NOT EXISTS] {name} [( {columns} )]",
        "AS {select-stmt}",
        "-- a view is a saved query; it stores no data",
      ],
      example:
        "CREATE VIEW active_users AS\n" +
        "SELECT id, name, email FROM users WHERE age >= 18;",
    },
    {
      id: "drop-view", title: "DROP VIEW",
      syntax: ["DROP VIEW [IF EXISTS] {name}"],
      example: "DROP VIEW IF EXISTS active_users;",
    },
    {
      id: "create-trigger", title: "CREATE TRIGGER",
      syntax: [
        "CREATE [TEMP] TRIGGER [IF NOT EXISTS] {name}",
        "[BEFORE|AFTER|INSTEAD OF] {DELETE|INSERT|UPDATE [OF {columns}]} ON {table}",
        "[FOR EACH ROW] [WHEN {condition}]",
        "BEGIN",
        "  {statements};",
        "END",
        "-- refer to row values with NEW.{col} and OLD.{col}",
      ],
      example:
        "CREATE TRIGGER touch_orders\n" +
        "AFTER UPDATE ON orders\n" +
        "FOR EACH ROW\n" +
        "BEGIN\n" +
        "  UPDATE orders SET ordered_at = datetime('now')\n" +
        "  WHERE id = NEW.id;\n" +
        "END;",
    },
    {
      id: "drop-trigger", title: "DROP TRIGGER",
      syntax: ["DROP TRIGGER [IF EXISTS] {name}"],
      example: "DROP TRIGGER IF EXISTS touch_orders;",
    },
    {
      id: "drop-table", title: "DROP TABLE",
      syntax: ["DROP TABLE [IF EXISTS] {name}"],
      example: "DROP TABLE IF EXISTS demo2;",
    },
    {
      id: "with", title: "WITH (CTE)",
      syntax: [
        "WITH [RECURSIVE] {cte} [( {columns} )] AS ( {select-stmt} ) [, ...]",
        "{select-stmt that uses the CTE}",
      ],
      example:
        "WITH RECURSIVE counter(n) AS (\n" +
        "  SELECT 1\n" +
        "  UNION ALL\n" +
        "  SELECT n + 1 FROM counter WHERE n < 10\n" +
        ")\n" +
        "SELECT n FROM counter;",
    },
    {
      id: "transaction", title: "TRANSACTION",
      syntax: [
        "BEGIN [DEFERRED|IMMEDIATE|EXCLUSIVE] [TRANSACTION]",
        "  ...statements...",
        "COMMIT            -- save all changes",
        "ROLLBACK          -- undo all changes",
        "SAVEPOINT {name}  /  RELEASE {name}  /  ROLLBACK TO {name}",
      ],
      example:
        "BEGIN;\n" +
        "  UPDATE products SET stock = stock - 1 WHERE id = 1;\n" +
        "  INSERT INTO orders (user_id, product_id) VALUES (1, 1);\n" +
        "COMMIT;",
    },
    {
      id: "attach", title: "ATTACH DATABASE",
      syntax: ["ATTACH DATABASE {filename} AS {schema-name}",
               "-- reference attached tables as {schema}.{table}"],
      example: "ATTACH DATABASE 'archive.db' AS arc;",
    },
    {
      id: "detach", title: "DETACH DATABASE",
      syntax: ["DETACH DATABASE {schema-name}"],
      example: "DETACH DATABASE arc;",
    },
    {
      id: "analyze", title: "ANALYZE",
      syntax: ["ANALYZE",
               "ANALYZE {schema|table|index}",
               "-- gathers statistics that help the query planner"],
      example: "ANALYZE;",
    },
    {
      id: "vacuum", title: "VACUUM",
      syntax: ["VACUUM [{schema}]",
               "VACUUM [{schema}] INTO {filename}",
               "-- rebuilds the database file, reclaiming free space"],
      example: "VACUUM;",
    },
    {
      id: "comment", title: "Comment",
      syntax: ["-- single-line comment to end of line",
               "/* block comment,",
               "   spanning multiple lines */"],
      example: "-- this is ignored\nSELECT 1; /* and so is this */",
    },
  ];

  const FUNCTIONS = [
    {
      group: "Aggregate",
      fns: [
        ["count", "count(*) or count(x) — number of rows / non-null values"],
        ["sum", "sum of values (NULL if no rows)"],
        ["total", "like sum() but always returns a float, 0.0 for no rows"],
        ["avg", "average of non-null values"],
        ["min", "minimum value"],
        ["max", "maximum value"],
        ["group_concat", "group_concat(x [, sep]) — join values into a string"],
      ],
    },
    {
      group: "Core scalar",
      fns: [
        ["abs", "absolute value"],
        ["coalesce", "first non-null argument"],
        ["ifnull", "ifnull(a, b) — a if not null, else b"],
        ["nullif", "nullif(a, b) — NULL if a = b, else a"],
        ["iif", "iif(cond, a, b) — ternary expression"],
        ["length", "length of a string / blob"],
        ["lower", "lowercase"],
        ["upper", "uppercase"],
        ["trim", "trim(x [, chars]) — strip leading & trailing chars"],
        ["ltrim", "strip leading chars"],
        ["rtrim", "strip trailing chars"],
        ["substr", "substr(x, start [, len]) — substring (1-based)"],
        ["replace", "replace(x, find, with)"],
        ["instr", "instr(x, sub) — 1-based position of sub, or 0"],
        ["printf", "printf(fmt, ...) — formatted string"],
        ["format", "alias of printf()"],
        ["hex", "hexadecimal representation of a blob"],
        ["quote", "SQL-literal-quoted form of a value"],
        ["typeof", "type name: null/integer/real/text/blob"],
        ["round", "round(x [, digits])"],
        ["sign", "-1, 0 or 1"],
        ["random", "random integer"],
        ["char", "char(n, ...) — characters from code points"],
        ["unicode", "code point of the first character"],
        ["last_insert_rowid", "rowid of the most recent insert"],
        ["changes", "rows changed by the last statement"],
      ],
    },
    {
      group: "Date & time",
      fns: [
        ["date", "date(time [, modifiers]) — YYYY-MM-DD"],
        ["time", "time(...) — HH:MM:SS"],
        ["datetime", "datetime(...) — YYYY-MM-DD HH:MM:SS"],
        ["julianday", "Julian day number"],
        ["unixepoch", "seconds since 1970-01-01"],
        ["strftime", "strftime(fmt, time [, mods]) — custom format"],
      ],
    },
    {
      group: "Math",
      fns: [
        ["ceil", "ceiling"], ["floor", "floor"], ["trunc", "truncate toward zero"],
        ["exp", "e^x"], ["ln", "natural log"], ["log", "log(b, x) / log10"],
        ["pow", "pow(x, y) — x^y"], ["sqrt", "square root"], ["mod", "mod(x, y)"],
        ["pi", "π"], ["sin", "sine"], ["cos", "cosine"], ["tan", "tangent"],
        ["radians", "degrees → radians"], ["degrees", "radians → degrees"],
      ],
    },
    {
      group: "Window",
      fns: [
        ["row_number", "sequential number within the partition"],
        ["rank", "rank with gaps on ties"],
        ["dense_rank", "rank without gaps"],
        ["ntile", "ntile(n) — distribute rows into n buckets"],
        ["lag", "lag(x [, off [, def]]) — previous row's value"],
        ["lead", "lead(x [, off [, def]]) — next row's value"],
        ["first_value", "first value in the window frame"],
        ["last_value", "last value in the window frame"],
        ["nth_value", "nth_value(x, n)"],
        ["percent_rank", "relative rank 0..1"],
        ["cume_dist", "cumulative distribution"],
      ],
    },
    {
      group: "JSON",
      fns: [
        ["json", "validate & minify a JSON string"],
        ["json_array", "build a JSON array"],
        ["json_object", "json_object(k, v, ...) — build a JSON object"],
        ["json_extract", "json_extract(j, path) — read a value"],
        ["json_set", "set a value at a path"],
        ["json_insert", "insert a value at a path"],
        ["json_replace", "replace a value at a path"],
        ["json_type", "type of a JSON value"],
        ["json_valid", "1 if the argument is valid JSON"],
        ["json_array_length", "length of a JSON array"],
        ["json_group_array", "aggregate values into a JSON array"],
        ["json_group_object", "aggregate pairs into a JSON object"],
      ],
    },
  ];

  let rendered = false;
  let app = null;

  function ensure(bridge) {
    app = bridge || app;
    if (rendered) return;
    rendered = true;
    render();
    wireFilter();
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function elem(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  function render() {
    const list = document.querySelector("#syntaxList");
    list.innerHTML = "";

    // Functions box (special, grouped)
    list.appendChild(functionsBox());

    REF.forEach((entry) => list.appendChild(stmtBox(entry)));
  }

  function box(title, keywords) {
    const wrap = elem("div", "syntax-cat");
    wrap.dataset.keywords = keywords.toLowerCase();
    const head = elem("div", "syntax-cat-head");
    head.innerHTML = `<span class="syntax-caret">${ICON("chevron")}</span><span class="syntax-cat-name">${esc(title)}</span>`;
    head.onclick = () => wrap.classList.toggle("open");
    wrap.appendChild(head);
    return wrap;
  }

  function stmtBox(entry) {
    const wrap = box(entry.title, entry.title + " " + entry.id);
    const body = elem("div", "syntax-cat-body");

    body.appendChild(elem("div", "syntax-label", "Syntax"));
    const syn = elem("pre", "syntax-code");
    syn.textContent = entry.syntax.join("\n");
    body.appendChild(syn);

    if (entry.example) {
      const exHead = elem("div", "syntax-label syntax-label-row");
      exHead.innerHTML = `<span>Example</span>`;
      const useBtn = elem("button", "btn icon syntax-use", ICON("arrow-right") + "Editor");
      useBtn.title = "Load this example into the editor";
      useBtn.onclick = (e) => { e.stopPropagation(); app.editorSet(entry.example); };
      exHead.appendChild(useBtn);
      body.appendChild(exHead);

      const ex = elem("pre", "syntax-code syntax-example");
      ex.textContent = entry.example;
      ex.title = "Click to load into the editor";
      ex.onclick = () => app.editorSet(entry.example);
      body.appendChild(ex);
    }
    wrap.appendChild(body);
    return wrap;
  }

  function functionsBox() {
    const allNames = FUNCTIONS.flatMap((g) => g.fns.map((f) => f[0])).join(" ");
    const wrap = box("All functions", "functions " + allNames);
    const body = elem("div", "syntax-cat-body");
    FUNCTIONS.forEach((grp) => {
      body.appendChild(elem("div", "syntax-label", grp.group));
      const chips = elem("div", "fn-chips");
      grp.fns.forEach(([name, desc]) => {
        const chip = elem("button", "fn-chip", esc(name));
        chip.title = desc;
        chip.onclick = () => app.editorAppend(name + "()");
        chips.appendChild(chip);
      });
      body.appendChild(chips);
    });
    wrap.appendChild(body);
    return wrap;
  }

  function wireFilter() {
    const input = document.querySelector("#syntaxFilter");
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      document.querySelectorAll("#syntaxList .syntax-cat").forEach((c) => {
        const hit = !q || c.dataset.keywords.includes(q);
        c.style.display = hit ? "" : "none";
        if (q && hit) c.classList.add("open");
      });
    });
  }

  return { ensure };
})();
