"use client";

import { useState } from "react";
import { parseCsv } from "@/lib/csv";
import { nameKey } from "@/lib/costs";
import { readXlsx, unzip, type Sheet } from "@/lib/xlsx-read";
import { planFromMealie, planFromWorkbook, type ImportPlan } from "@/lib/costs-import";
import { buttonClass, ghostClass, inputClass, type IngredientRow, type TabProps } from "@/components/costs/shared";

type Counts = {
  ingredients: number;
  purchases: number;
  duplicatePurchases: number;
  skippedPurchases: string[];
  receipts?: number;
  duplicateReceipts?: number;
  pastSales?: number;
  duplicatePastSales?: number;
  recipes: number;
  replacedRecipes: number;
  skippedRecipes: number;
  skippedLines: number;
};

const summary = (c: Counts) =>
  [
    c.purchases && `${c.purchases} purchases`,
    c.duplicatePurchases && `${c.duplicatePurchases} purchases already in the log (skipped)`,
    c.pastSales && `${c.pastSales} past sales`,
    c.duplicatePastSales && `${c.duplicatePastSales} past sales already here (skipped)`,
    c.receipts && `${c.receipts} receipts`,
    c.duplicateReceipts && `${c.duplicateReceipts} receipts already here (skipped)`,
    c.ingredients && `${c.ingredients} new ingredients`,
    c.recipes && `${c.recipes} new recipes`,
    c.replacedRecipes && `${c.replacedRecipes} recipes updated`,
    c.skippedRecipes && `${c.skippedRecipes} recipes already here (kept as they were)`,
    c.skippedLines && `${c.skippedLines} recipe lines skipped`,
    c.skippedPurchases?.length && `skipped (unit doesn't fit the item): ${c.skippedPurchases.join("; ")}`,
  ]
    .filter(Boolean)
    .join(" · ") || "Nothing new to import.";

/** Plain names recipes use for something more specific on the shopping list */
const SAME_AS: Record<string, string> = {
  sugar: "granulated sugar",
  "white sugar": "granulated sugar",
  "brown sugar": "light brown sugar",
  "confectioners sugar": "powdered sugar",
  "vanilla": "vanilla extract",
  milk: "whole milk",
};

/** Best existing ingredient for a recipe's ingredient name, or "" for "add it as new". */
function match(name: string, ingredients: IngredientRow[]): string {
  const key = nameKey(name);
  const want = [key, SAME_AS[key] && nameKey(SAME_AS[key])].filter(Boolean);
  const exact = ingredients.find((i) => want.includes(nameKey(i.name)));
  if (exact) return exact.id;
  // Otherwise the closest name that contains it, or that it contains ("unsalted butter" ↔ "Unsalted Butter (Costco)")
  const close = ingredients
    .filter((i) => {
      const k = nameKey(i.name);
      return k.length > 2 && (key.includes(k) || k.includes(key));
    })
    .sort((a, b) => Math.abs(a.name.length - key.length) - Math.abs(b.name.length - key.length))[0];
  return close?.id ?? "";
}

/** Bring in the cost spreadsheet or Mealie recipes, and download the cost analysis for Sheets. */
export default function ImportExportTab({ data, save }: TabProps) {
  return (
    <div className="space-y-6">
      <SheetImport data={data} save={save} />
      <MealieImport data={data} save={save} />
      <Export />
    </div>
  );
}

function SheetImport({ save }: TabProps) {
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const read = async (files: FileList | null) => {
    setMsg("");
    setPlan(null);
    if (!files?.length) return;
    try {
      const sheets: Sheet[] = [];
      for (const f of Array.from(files)) {
        if (/\.xlsx$/i.test(f.name)) sheets.push(...(await readXlsx(f)));
        // A CSV is one tab; its file name ("Pumpkin Cookie.csv") names the recipe
        else sheets.push({ name: f.name.replace(/\.csv$/i, "").replace(/^.* - /, ""), rows: parseCsv(await f.text()) });
      }
      const p = planFromWorkbook(sheets);
      if (!p.purchases.length && !p.recipes.length && !p.ingredients.length && !p.receipts?.length && !p.pastSales?.length) {
        setMsg("Couldn't find a purchase log, receipts, orders or recipe tabs in that file.");
        return;
      }
      setPlan(p);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't read that file");
    }
  };

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    const { error, json } = await save("/api/costs/import", "POST", { ...plan, replace });
    setBusy(false);
    if (error) return setMsg(error);
    setPlan(null);
    setMsg(`Imported: ${summary(json.counts as Counts)}`);
  };

  const dates = plan?.purchases.map((p) => p.date.slice(0, 10)).sort() ?? [];
  return (
    <section className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-stone-900">Import your cost spreadsheet</h2>
        <p className="text-xs text-stone-500 mt-0.5">
          The .xlsx (in Google Sheets: File → Download → Microsoft Excel), or CSVs of single tabs. It reads the Purchasing
          Log, the Master Inventory Pool, each recipe tab, a receipt tracker (Date, Vendor, Amount, What was Purchased),
          and Hotplate&apos;s orders export (kept as past sales for the accountant export; they don&apos;t become orders here).
          Only the numbers you entered are used: all the cost math is redone here. Importing the same file again won&apos;t
          double up purchases or receipts.
        </p>
      </div>
      <input type="file" accept=".xlsx,.csv" multiple onChange={(e) => read(e.target.files)} className="text-sm" />
      {plan && (
        <div className="rounded-lg bg-stone-50 p-3 space-y-2 text-sm text-stone-700">
          <p>
            Found <b>{plan.purchases.length}</b> purchases
            {dates.length > 0 && ` (${dates[0]} to ${dates[dates.length - 1]})`}, <b>{plan.ingredients.length}</b> items in the
            inventory list and <b>{plan.recipes.length}</b> recipes
            {plan.recipes.length > 0 && `: ${plan.recipes.map((r) => `${r.name} (makes ${r.yieldCount})`).join(", ")}`}.
            {plan.overheadRate !== undefined && ` Overhead rate: $${plan.overheadRate}/hr.`}
            {!!plan.receipts?.length &&
              ` Also ${plan.receipts.length} receipts totaling $${plan.receipts.reduce((n, r) => n + r.amount, 0).toFixed(2)}.`}
            {!!plan.pastSales?.length &&
              ` Also ${plan.pastSales.length} past orders (${plan.pastSales[0].source}) with $${plan.pastSales
                .reduce((n, s) => n + s.revenue, 0)
                .toFixed(2)} revenue, kept for the books only.`}
          </p>
          {plan.notes.map((n) => (
            <p key={n} className="text-xs text-amber-700">
              {n}
            </p>
          ))}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-amber-600" />
            Update recipes that are already here with the spreadsheet&apos;s version
          </label>
          <div className="flex gap-2">
            <button onClick={run} disabled={busy} className={buttonClass}>
              {busy ? "Importing…" : "Import"}
            </button>
            <button onClick={() => setPlan(null)} className={ghostClass}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-sm text-stone-700">{msg}</p>}
    </section>
  );
}

type Mapped = { plan: ImportPlan; picks: string[][] }; // picks[recipe][line] = ingredient id, or "" for new

function MealieImport({ data, save }: TabProps) {
  const [mapped, setMapped] = useState<Mapped | null>(null);
  const [pasted, setPasted] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = (jsons: unknown[]) => {
    const plan = planFromMealie(jsons);
    if (!plan.recipes.length) {
      setMsg("Couldn't find any Mealie recipes in that.");
      return;
    }
    setMsg("");
    setMapped({ plan, picks: plan.recipes.map((r) => r.lines.map((l) => match(l.ingredientName, data.ingredients))) });
  };

  const readFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const jsons: unknown[] = [];
      for (const f of Array.from(files)) {
        if (/\.zip$/i.test(f.name)) {
          for (const [path, bytes] of await unzip(await f.arrayBuffer())) {
            if (path.endsWith(".json")) jsons.push(JSON.parse(new TextDecoder().decode(bytes)));
          }
        } else jsons.push(JSON.parse(await f.text()));
      }
      load(jsons);
    } catch {
      setMsg("That doesn't look like Mealie recipe JSON.");
    }
  };

  const run = async () => {
    if (!mapped) return;
    setBusy(true);
    const recipes = mapped.plan.recipes.map((r, ri) => ({
      ...r,
      lines: r.lines.map((l, li) => ({ ...l, ingredientId: mapped.picks[ri][li] || undefined })),
    }));
    const { error, json } = await save("/api/costs/import", "POST", { recipes, replace });
    setBusy(false);
    if (error) return setMsg(error);
    setMapped(null);
    setPasted("");
    setMsg(`Imported: ${summary(json.counts as Counts)}. Add prices and bake time on the Recipes tab.`);
  };

  return (
    <section className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-stone-900">Import recipes from Mealie</h2>
        <p className="text-xs text-stone-500 mt-0.5">
          A recipe&apos;s JSON (Mealie: open the recipe → ⋮ → Download), several files, or a Mealie export .zip. You can also
          paste the JSON. You&apos;ll match each ingredient to yours before anything is saved.
        </p>
      </div>
      <input type="file" accept=".json,.zip" multiple onChange={(e) => readFiles(e.target.files)} className="text-sm" />
      <div className="flex gap-2 items-start">
        <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={2} placeholder="…or paste Mealie JSON here" className={inputClass} />
        <button
          onClick={() => {
            try {
              load([JSON.parse(pasted)]);
            } catch {
              setMsg("That doesn't look like JSON.");
            }
          }}
          disabled={!pasted.trim()}
          className={ghostClass}
        >
          Read
        </button>
      </div>

      {mapped && (
        <div className="space-y-4">
          {mapped.plan.recipes.map((r, ri) => (
            <div key={ri} className="rounded-lg bg-stone-50 p-3">
              <p className="text-sm font-semibold text-stone-900">
                {r.name} <span className="font-normal text-stone-500">· makes {r.yieldCount} {r.yieldLabel}</span>
              </p>
              <table className="w-full text-xs mt-2">
                <tbody>
                  {r.lines.map((l, li) => (
                    <tr key={li}>
                      <td className="py-1 pr-2 text-stone-600 whitespace-nowrap">
                        {l.quantity} {l.unit}
                      </td>
                      <td className="py-1 pr-2 text-stone-900">{l.ingredientName}</td>
                      <td className="py-1 w-64">
                        <select
                          value={mapped.picks[ri][li]}
                          onChange={(e) => {
                            const picks = mapped.picks.map((p) => [...p]);
                            picks[ri][li] = e.target.value;
                            setMapped({ ...mapped, picks });
                          }}
                          className={`${inputClass} text-xs py-1`}
                        >
                          <option value="">➕ New: {l.ingredientName}</option>
                          {data.ingredients.map((i) => (
                            <option key={i.id} value={i.id}>
                              = {i.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {mapped.plan.notes.map((n) => (
            <p key={n} className="text-xs text-amber-700">
              {n}
            </p>
          ))}
          <label className="flex items-center gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-amber-600" />
            Replace recipes with the same name that are already here
          </label>
          <div className="flex gap-2">
            <button onClick={run} disabled={busy} className={buttonClass}>
              {busy ? "Importing…" : `Import ${mapped.plan.recipes.length} recipe${mapped.plan.recipes.length === 1 ? "" : "s"}`}
            </button>
            <button onClick={() => setMapped(null)} className={ghostClass}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-sm text-stone-700">{msg}</p>}
    </section>
  );
}

function Export() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const link = (what: string, label: string) => (
    <a href={`/api/costs/export?what=${what}`} className={ghostClass}>
      {label}
    </a>
  );
  const dated = (what: string, label: string) => (
    <a href={`/api/costs/export?what=${what}&from=${from}&to=${to}`} className={ghostClass}>
      {label}
    </a>
  );
  return (
    <>
    <section className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-stone-900">For your accountant</h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Sales (this shop&apos;s paid orders, plus past sales imported from Hotplate&apos;s orders export), expenses from
          Receipts, giveaways, and a month-by-month summary. Card fees for shop orders are in your Stripe dashboard.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-xs text-stone-600">
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} w-40`} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} w-40`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {dated("summary", "Monthly summary")}
        {dated("sales", "Sales")}
        {dated("expenses", "Expenses")}
        {dated("giveaways", "Giveaways")}
      </div>
    </section>
    <section className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-stone-900">Export the cost analysis</h2>
        <p className="text-xs text-stone-500 mt-0.5">
          CSV files that open in Google Sheets (File → Import → Upload) or Excel.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {link("recipes", "Recipe summary")}
        {link("lines", "Recipe ingredients, line by line")}
        {link("ingredients", "Ingredient costs")}
        {link("receipts", "Receipts")}
      </div>
    </section>
    </>
  );
}
