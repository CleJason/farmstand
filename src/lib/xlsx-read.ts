/**
 * Read an .xlsx (Excel, or Google Sheets → Download → .xlsx) in the browser:
 * each sheet's cell values as a grid. Formulas give the value last saved with
 * the file. No library: an .xlsx is a zip of XML files.
 */

export type Sheet = { name: string; rows: (string | number | null)[][] };

/** The files inside a zip, unpacked (only stored or deflated entries, which is all Excel/Sheets/Mealie use). */
export async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("That isn't a valid .xlsx or .zip file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      files.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
  }
  return files;
}

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(file: File): Promise<Sheet[]> {
  const files = await unzip(await file.arrayBuffer());
  const text = (path: string) => {
    const f = files.get(path);
    return f ? new TextDecoder().decode(f) : "";
  };
  const xml = (path: string) => new DOMParser().parseFromString(text(path), "application/xml");
  const all = (doc: Document | Element, tag: string) => Array.from(doc.getElementsByTagNameNS("*", tag));

  const shared = all(xml("xl/sharedStrings.xml"), "si").map((si) => all(si, "t").map((t) => t.textContent ?? "").join(""));
  const rels = new Map(all(xml("xl/_rels/workbook.xml.rels"), "Relationship").map((r) => [r.getAttribute("Id"), r.getAttribute("Target") ?? ""]));

  return all(xml("xl/workbook.xml"), "sheet").map((s) => {
    const rid = s.getAttribute("r:id") ?? s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = (rels.get(rid) ?? "").replace(/^\/?(xl\/)?/, "");
    const doc = xml(`xl/${target}`);
    const rows: (string | number | null)[][] = [];
    for (const row of all(doc, "row")) {
      const r = Number(row.getAttribute("r")) - 1;
      const cells: (string | number | null)[] = [];
      for (const c of all(row, "c")) {
        const t = c.getAttribute("t");
        const v = all(c, "v")[0]?.textContent ?? null;
        let value: string | number | null = null;
        if (t === "s") value = v === null ? null : shared[Number(v)] ?? null;
        else if (t === "inlineStr") value = all(c, "t").map((x) => x.textContent ?? "").join("");
        else if (t === "str" || t === "e") value = v;
        else if (t === "b") value = v === "1" ? "TRUE" : "FALSE";
        else value = v === null || v === "" ? null : Number(v);
        cells[colIndex(c.getAttribute("r") ?? "A1")] = value;
      }
      rows[r] = Array.from(cells, (x) => x ?? null);
    }
    return { name: s.getAttribute("name") ?? "Sheet", rows: Array.from(rows, (x) => x ?? []) };
  });
}

/** An Excel date (days since 1899-12-30) or date text → ISO date, or null. */
export function sheetDate(v: string | number | null): string | null {
  // Noon UTC, so the day doesn't shift in US timezones
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.floor(v - 25569) * 86400000 + 43200000).toISOString();
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}
