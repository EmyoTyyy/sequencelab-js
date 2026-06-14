/* =================================================================== *
 *  SequenceLab — minimal .xlsx reader/writer, zero dependencies.
 *  A .xlsx is a ZIP of XML parts. Export writes STORED (uncompressed)
 *  zip entries — valid and openable everywhere. Import unzips with the
 *  browser's native DecompressionStream (deflate-raw), no library.
 *  XLSXMini.build(columns, rows, sheetName) -> Blob
 *  XLSXMini.parse(arrayBuffer) -> Promise<{ sheets: [{ name, rows }] }>
 * =================================================================== */
window.XLSXMini = (function () {
  "use strict";

  // ---- CRC32 (for zip entries) ----
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---- ZIP writer (store / no compression) ----
  function zipStore(files) {
    const enc = new TextEncoder();
    const chunks = []; let offset = 0;
    const central = [];
    const u16 = (n) => new Uint8Array([n & 255, (n >> 8) & 255]);
    const u32 = (n) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]);
    const push = (a) => { chunks.push(a); offset += a.length; };
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data), at = offset;
      push(u32(0x04034b50)); push(u16(20)); push(u16(0)); push(u16(0));
      push(u16(0)); push(u16(0)); push(u32(crc));
      push(u32(data.length)); push(u32(data.length));
      push(u16(name.length)); push(u16(0)); push(name); push(data);
      const c = [];
      const c16 = (n) => c.push(n & 255, (n >> 8) & 255);
      const c32 = (n) => c.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255);
      c32(0x02014b50); c16(20); c16(20); c16(0); c16(0); c16(0); c16(0);
      c32(crc); c32(data.length); c32(data.length);
      c16(name.length); c16(0); c16(0); c16(0); c16(0); c32(0); c32(at);
      central.push(new Uint8Array(c)); central.push(name);
    }
    const cdStart = offset;
    let cdSize = 0;
    central.forEach((a) => { push(a); cdSize += a.length; });
    const e = [];
    const e16 = (n) => e.push(n & 255, (n >> 8) & 255);
    const e32 = (n) => e.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255);
    e32(0x06054b50); e16(0); e16(0); e16(files.length); e16(files.length);
    e32(cdSize); e32(cdStart); e16(0);
    push(new Uint8Array(e));
    let total = 0; chunks.forEach((c) => (total += c.length));
    const out = new Uint8Array(total); let p = 0;
    chunks.forEach((c) => { out.set(c, p); p += c.length; });
    return out;
  }

  const xe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function colLetter(n) { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  function sheetXml(allRows) {
    let body = "";
    for (let r = 0; r < allRows.length; r++) {
      const row = allRows[r] || [];
      let cells = "";
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (v === null || v === undefined || v === "") continue;
        const ref = colLetter(c) + (r + 1);
        cells += (typeof v === "number" && isFinite(v))
          ? `<c r="${ref}"><v>${v}</v></c>`
          : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
      }
      body += `<row r="${r + 1}">${cells}</row>`;
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  }

  const CONTENT_TYPES =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`;
  const ROOT_RELS =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
  const WB_RELS =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;
  const workbookXml = (name) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${xe(name).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  function build(columns, rows, sheetName) {
    const enc = new TextEncoder();
    const parts = [
      { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
      { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
      { name: "xl/workbook.xml", data: enc.encode(workbookXml(sheetName || "Sheet1")) },
      { name: "xl/_rels/workbook.xml.rels", data: enc.encode(WB_RELS) },
      { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml([columns, ...rows])) },
    ];
    return new Blob([zipStore(parts)],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  // ---- ZIP reader ----
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Response(bytes).body.pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    // locate End Of Central Directory
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error("Not a valid .xlsx (no zip directory).");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = new Map();
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      files.set(name, method === 8 ? await inflateRaw(raw) : raw);
    }
    return files;
  }

  const td = new TextDecoder();
  const parseXml = (bytes) => new DOMParser().parseFromString(td.decode(bytes), "application/xml");
  function colNum(letters) { let n = 0; for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n; }

  async function parse(arrayBuffer) {
    const files = await unzip(arrayBuffer);
    const get = (path) => files.get(path);
    // shared strings
    const shared = [];
    const ss = get("xl/sharedStrings.xml");
    if (ss) {
      const sis = parseXml(ss).getElementsByTagName("si");
      for (let i = 0; i < sis.length; i++) {
        const ts = sis[i].getElementsByTagName("t");
        let s = "";
        for (let j = 0; j < ts.length; j++) s += ts[j].textContent;
        shared.push(s);
      }
    }
    // sheet name + path order from workbook + rels
    const wb = get("xl/workbook.xml");
    const rels = get("xl/_rels/workbook.xml.rels");
    const relMap = {};
    if (rels) {
      const rs = parseXml(rels).getElementsByTagName("Relationship");
      for (let i = 0; i < rs.length; i++) relMap[rs[i].getAttribute("Id")] = rs[i].getAttribute("Target");
    }
    const sheets = [];
    const wbSheets = wb ? parseXml(wb).getElementsByTagName("sheet") : [];
    const order = [];
    for (let i = 0; i < wbSheets.length; i++) {
      const name = wbSheets[i].getAttribute("name") || `Sheet${i + 1}`;
      const rid = wbSheets[i].getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
        || wbSheets[i].getAttribute("r:id");
      let target = relMap[rid] || `worksheets/sheet${i + 1}.xml`;
      order.push({ name, path: target.replace(/^\/?xl\//, "").replace(/^\//, "") });
    }
    if (!order.length) order.push({ name: "Sheet1", path: "worksheets/sheet1.xml" });

    for (const s of order) {
      const wsBytes = get("xl/" + s.path) || get(s.path);
      if (!wsBytes) continue;
      const doc = parseXml(wsBytes);
      const rowEls = doc.getElementsByTagName("row");
      const rowsMap = new Map(); let maxC = 0, maxR = 0;
      for (let i = 0; i < rowEls.length; i++) {
        const rEl = rowEls[i];
        const rNum = parseInt(rEl.getAttribute("r"), 10) || (i + 1);
        maxR = Math.max(maxR, rNum);
        const arr = rowsMap.get(rNum) || []; rowsMap.set(rNum, arr);
        const cEls = rEl.getElementsByTagName("c");
        for (let j = 0; j < cEls.length; j++) {
          const cEl = cEls[j];
          const ref = cEl.getAttribute("r") || "";
          const m = /^([A-Z]+)(\d+)$/.exec(ref);
          const ci = m ? colNum(m[1]) - 1 : j;
          const t = cEl.getAttribute("t");
          let val = null;
          if (t === "inlineStr") {
            const tEl = cEl.getElementsByTagName("t");
            val = tEl.length ? tEl[0].textContent : "";
          } else {
            const vEl = cEl.getElementsByTagName("v")[0];
            const raw = vEl ? vEl.textContent : null;
            if (raw == null) val = null;
            else if (t === "s") val = shared[parseInt(raw, 10)] ?? "";
            else if (t === "str") val = raw;
            else if (t === "b") val = raw === "1" ? 1 : 0;
            else { const num = parseFloat(raw); val = isNaN(num) ? raw : num; }
          }
          arr[ci] = val;
          maxC = Math.max(maxC, ci + 1);
        }
      }
      const rows = [];
      for (let i = 1; i <= maxR; i++) {
        const a = rowsMap.get(i) || [];
        for (let j = 0; j < maxC; j++) if (a[j] === undefined) a[j] = null;
        rows.push(a.slice(0, maxC));
      }
      sheets.push({ name: s.name, rows });
    }
    return { sheets };
  }

  return { build, parse };
})();
