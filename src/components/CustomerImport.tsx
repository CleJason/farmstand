"use client";

import { useState } from "react";
import { customersFromCsv, type ImportedCustomer } from "@/lib/csv";

type Result = { added: number; updated: number; subscribed: number; skipped: number };

const inputClass =
  "w-full text-sm px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500";

async function send(rows: ImportedCustomer[], subscribe: boolean): Promise<Result> {
  const res = await fetch("/api/customers/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, subscribe }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Import failed");
  return data;
}

function AlertsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-stone-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-amber-600" />
      <span>
        Also add them to Drop Alerts
        <span className="block text-xs text-stone-500">
          Only if they already agreed to hear about new drops (e.g. they followed you on Hotplate). Every alert has an
          unsubscribe link.
        </span>
      </span>
    </label>
  );
}

/** "Add customer" and "Import CSV" on Admin → Customers. */
export default function CustomerImport({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"add" | "import" | null>(null);
  const [one, setOne] = useState<ImportedCustomer>({ name: "", email: "", phone: "" });
  const [rows, setRows] = useState<ImportedCustomer[]>([]);
  const [columns, setColumns] = useState("");
  const [subscribe, setSubscribe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const close = () => {
    setMode(null);
    setRows([]);
    setColumns("");
    setMessage("");
    setSubscribe(false);
    setOne({ name: "", email: "", phone: "" });
  };

  const readFile = async (file: File) => {
    const parsed = customersFromCsv(await file.text());
    setRows(parsed.rows);
    setColumns(parsed.columns);
    setMessage(parsed.rows.length ? "" : "Couldn't find any customers in that file.");
  };

  const usable = rows.filter((r) => r.email.trim() || r.phone.trim());

  const run = async (list: ImportedCustomer[]) => {
    setBusy(true);
    setMessage("");
    try {
      const r = await send(list, subscribe);
      onDone();
      if (mode === "add") {
        close();
        return;
      }
      setRows([]);
      setMessage(
        `Done: ${r.added} added, ${r.updated} updated` +
          (r.subscribed ? `, ${r.subscribed} added to Drop Alerts` : "") +
          (r.skipped ? `, ${r.skipped} skipped (no email or phone)` : "") +
          "."
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={() => setMode("add")}
          className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2 rounded-lg"
        >
          + Add customer
        </button>
        <button
          onClick={() => setMode("import")}
          className="bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 font-semibold text-sm px-4 py-2 rounded-lg"
        >
          Import CSV
        </button>
      </div>

      {mode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={close}>
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {mode === "add" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run([one]);
                }}
                className="space-y-3"
              >
                <h2 className="text-lg font-bold text-stone-900">Add customer</h2>
                <input placeholder="Name" value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} className={inputClass} />
                <input type="email" placeholder="Email" value={one.email} onChange={(e) => setOne({ ...one, email: e.target.value })} className={inputClass} />
                <input type="tel" placeholder="Phone" value={one.phone} onChange={(e) => setOne({ ...one, phone: e.target.value })} className={inputClass} />
                <p className="text-xs text-stone-500">An email or a phone number is needed.</p>
                <AlertsCheckbox checked={subscribe} onChange={setSubscribe} />
                {message && <p className="text-sm text-red-600">{message}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={close} className="flex-1 border border-stone-300 text-stone-700 font-semibold text-sm py-2 rounded-lg">
                    Cancel
                  </button>
                  <button
                    disabled={busy || (!one.email.trim() && !one.phone.trim())}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm py-2 rounded-lg"
                  >
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-stone-900">Import customers</h2>
                <p className="text-sm text-stone-600">
                  Upload a CSV, like a customer export from Hotplate, or a spreadsheet saved as CSV. Columns named like
                  Name (or First/Last Name), Email and Phone are picked up automatically.
                </p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
                  className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:font-semibold"
                />
                {rows.length > 0 && (
                  <>
                    <div className="text-sm bg-stone-50 rounded-lg p-3 space-y-1">
                      <p>
                        Found <b>{usable.length}</b> {usable.length === 1 ? "customer" : "customers"}
                        {rows.length > usable.length && ` (${rows.length - usable.length} rows without an email or phone will be skipped)`}.
                      </p>
                      {columns && <p className="text-xs text-stone-500">Using columns: {columns}</p>}
                      <ul className="text-xs text-stone-600 pt-1">
                        {usable.slice(0, 3).map((r, i) => (
                          <li key={i}>{[r.name, r.email, r.phone].filter(Boolean).join(" · ")}</li>
                        ))}
                        {usable.length > 3 && <li>…</li>}
                      </ul>
                    </div>
                    <AlertsCheckbox checked={subscribe} onChange={setSubscribe} />
                  </>
                )}
                {message && <p className="text-sm text-stone-700">{message}</p>}
                <div className="flex gap-2">
                  <button onClick={close} className="flex-1 border border-stone-300 text-stone-700 font-semibold text-sm py-2 rounded-lg">
                    {rows.length ? "Cancel" : "Close"}
                  </button>
                  {rows.length > 0 && (
                    <button
                      disabled={busy || usable.length === 0}
                      onClick={() => run(usable)}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm py-2 rounded-lg"
                    >
                      {busy ? "Importing…" : `Import ${usable.length}`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
