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

export type ImportedCustomer = {
  name: string;
  email: string;
  phone: string;
  // Optional history from the export (e.g. Hotplate's totalSpend/orderCount/…)
  orders?: number;
  spent?: number; // cents
  firstOrderAt?: string;
  lastOrderAt?: string;
  since?: string;
  note?: string;
  subscribed?: boolean | null; // null = the file doesn't say
};

const date = (v: string) => {
  const d = new Date(v);
  return v && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
};

/**
 * Turn a customer export (Hotplate, Square, a spreadsheet…) into customer rows
 * by recognizing common column headers. `subscribedColumn` names the column
 * that says who is subscribed to marketing, if the file has one.
 */
export function customersFromCsv(text: string): { rows: ImportedCustomer[]; columns: string; subscribedColumn: string | null } {
  const [header, ...data] = parseCsv(text);
  if (!header) return { rows: [], columns: "", subscribedColumn: null };
  const h = header.map((c) => c.trim().toLowerCase().replace(/[\s_-]+/g, ""));
  const find = (...tests: ((c: string) => boolean)[]) => {
    for (const t of tests) {
      const i = h.findIndex(t);
      if (i >= 0) return i;
    }
    return -1;
  };
  // Headers are compared lowercased with spaces/underscores removed ("First Name" → "firstname")
  const email = find((c) => c === "email" || c === "emailaddress", (c) => c.includes("email") && !c.includes("sub"));
  const phone = find((c) => c === "phone" || c === "phonenumber", (c) => c.includes("phone") || c.includes("mobile") || c.includes("cell"));
  const full = find((c) => c === "name" || c === "fullname" || c === "customername" || c === "customer");
  const first = find((c) => c === "firstname" || c === "first");
  const last = find((c) => c === "lastname" || c === "last" || c === "surname");
  const spent = find((c) => c.includes("spen") || c === "totalsales" || c === "lifetimevalue");
  const orders = find((c) => c === "ordercount" || c === "orders" || c === "totalorders" || c === "numberoforders");
  const firstOrder = find((c) => c.includes("first") && c.includes("order"));
  const lastOrder = find((c) => (c.includes("latest") || c.includes("last")) && c.includes("order"));
  const since = find((c) => c === "createdat" || c === "created" || c === "customersince" || c === "joined");
  const note = find((c) => c === "note" || c === "notes");
  const sub = find((c) => c.includes("subscri") || c.includes("optin") || c.includes("marketing") || c.includes("consent"));
  const inverted = sub >= 0 && (h[sub].includes("unsub") || h[sub].includes("optout"));

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const yes = (v: string) => /^(true|yes|y|1|subscribed|opted ?in)$/i.test(v);
  const rows = data.map((r): ImportedCustomer => {
    const money = Number(cell(r, spent).replace(/[$,]/g, ""));
    const count = Number(cell(r, orders));
    return {
      name: cell(r, full) || [cell(r, first), cell(r, last)].filter(Boolean).join(" "),
      email: cell(r, email),
      phone: cell(r, phone),
      orders: Number.isFinite(count) && count > 0 ? Math.round(count) : undefined,
      spent: Number.isFinite(money) && money > 0 ? Math.round(money * 100) : undefined,
      firstOrderAt: date(cell(r, firstOrder)),
      lastOrderAt: date(cell(r, lastOrder)),
      since: date(cell(r, since)),
      note: cell(r, note) || undefined,
      subscribed: sub >= 0 ? yes(cell(r, sub)) !== inverted : null,
    };
  });
  const used = [
    full >= 0 ? header[full] : [first, last].filter((i) => i >= 0).map((i) => header[i]).join(" + "),
    ...[email, phone, orders, spent, firstOrder, lastOrder, since, note].map((i) => (i >= 0 ? header[i] : "")),
  ].filter(Boolean);
  return { rows, columns: used.join(", "), subscribedColumn: sub >= 0 ? header[sub] : null };
}
