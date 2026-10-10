/** Minimal CSV reader for spreadsheet exports: quoted fields, "" escapes, commas/newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, ""); // Excel's byte-order mark

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export type ImportedCustomer = { name: string; email: string; phone: string };

/**
 * Turn a customer export (Hotplate, Square, a spreadsheet…) into name/email/phone
 * rows by recognizing common column headers.
 */
export function customersFromCsv(text: string): { rows: ImportedCustomer[]; columns: string } {
  const [header, ...data] = parseCsv(text);
  if (!header) return { rows: [], columns: "" };
  const h = header.map((c) => c.trim().toLowerCase());
  const find = (...tests: ((c: string) => boolean)[]) => {
    for (const t of tests) {
      const i = h.findIndex(t);
      if (i >= 0) return i;
    }
    return -1;
  };
  const email = find((c) => c === "email" || c === "email address", (c) => c.includes("email"));
  const phone = find((c) => c === "phone" || c === "phone number", (c) => c.includes("phone") || c.includes("mobile") || c.includes("cell"));
  const full = find((c) => c === "name" || c === "full name" || c === "customer name" || c === "customer");
  const first = find((c) => c.includes("first"));
  const last = find((c) => c.includes("last") && c.includes("name"), (c) => c === "last");

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const rows = data.map((r) => ({
    name: cell(r, full) || [cell(r, first), cell(r, last)].filter(Boolean).join(" "),
    email: cell(r, email),
    phone: cell(r, phone),
  }));
  const used = [
    full >= 0 ? header[full] : [first, last].filter((i) => i >= 0).map((i) => header[i]).join(" + "),
    email >= 0 ? header[email] : "",
    phone >= 0 ? header[phone] : "",
  ].filter(Boolean);
  return { rows, columns: used.join(", ") };
}
