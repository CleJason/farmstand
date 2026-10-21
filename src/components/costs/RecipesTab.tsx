"use client";

import { useState } from "react";
import { money } from "@/lib/costs";
import RecipeEditor from "@/components/costs/RecipeEditor";
import { inputClass, type TabProps } from "@/components/costs/shared";

/** Every recipe's cost per batch and per item, and its margin. Click one to edit it. */
export default function RecipesTab({ data, save }: TabProps) {
  const [open, setOpen] = useState<string | null>(null); // recipe id, or "new"
  const [rate, setRate] = useState(String(data.settings.overheadRate));
  const [msg, setMsg] = useState("");

  const saveSettings = async (body: Record<string, unknown>) => {
    setMsg("");
    const { error } = await save("/api/costs", "PUT", body);
    setMsg(error || "Saved.");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 p-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-stone-700">
        <label className="flex items-center gap-2">
          Overhead (bake/labor) rate
          <span className="flex items-center gap-1">
            $
            <input
              type="number"
              min={0}
              step="0.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onBlur={() => Number(rate) !== data.settings.overheadRate && saveSettings({ overheadRate: rate })}
              className={`${inputClass} w-20`}
            />
            /hr
          </span>
        </label>
        <label className="flex items-center gap-2">
          Cost with
          <select
            value={data.settings.basis}
            onChange={(e) => saveSettings({ basis: e.target.value })}
            className={`${inputClass} w-auto`}
          >
            <option value="average">average price paid (like your sheet)</option>
            <option value="latest">latest price paid</option>
          </select>
        </label>
        {msg && <span className="text-xs text-stone-400">{msg}</span>}
        <button
          onClick={() => setOpen("new")}
          className="ml-auto text-sm font-semibold text-amber-700 hover:underline"
        >
          + New recipe
        </button>
      </div>

      {open === "new" && <RecipeEditor data={data} save={save} onClose={() => setOpen(null)} />}

      {data.recipes.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-stone-500 text-left border-b border-stone-100">
              <tr>
                <th className="px-4 py-2.5 font-medium">Recipe</th>
                <th className="px-4 py-2.5 font-medium">Makes</th>
                <th className="px-4 py-2.5 font-medium text-right">Batch cost</th>
                <th className="px-4 py-2.5 font-medium text-right">Per item</th>
                <th className="px-4 py-2.5 font-medium text-right">Sells for</th>
                <th className="px-4 py-2.5 font-medium text-right">Profit</th>
                <th className="px-4 py-2.5 font-medium text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.recipes.map((r) => (
                <RecipeRowView key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)}>
                  <RecipeEditor data={data} save={save} recipe={r} onClose={() => setOpen(null)} />
                </RecipeRowView>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecipeRowView({
  r,
  open,
  onToggle,
  children,
}: {
  r: TabProps["data"]["recipes"][number];
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const c = r.cost;
  const warn = c.problems > 0 || c.estimates > 0;
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer hover:bg-stone-50 ${open ? "bg-amber-50/40" : ""}`}>
        <td className="px-4 py-3 font-medium text-stone-900">
          {r.name}
          {warn && (
            <span
              className="ml-2 text-[11px] font-normal text-amber-700"
              title={[
                c.problems ? `${c.problems} line(s) can't be priced` : "",
                c.estimates ? `${c.estimates} line(s) in cups/spoons without grams per cup` : "",
              ]
                .filter(Boolean)
                .join("; ")}
            >
              ⚠ check
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
          {r.yieldCount} {r.yieldLabel}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">{money(c.batch)}</td>
        <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-stone-900">{money(c.perItem)}</td>
        <td className="px-4 py-3 text-right whitespace-nowrap text-stone-600">{money(c.batchPrice)}</td>
        <td className={`px-4 py-3 text-right whitespace-nowrap ${c.profit !== null && c.profit < 0 ? "text-red-600" : "text-stone-600"}`}>
          {money(c.profit)}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap text-stone-600">{c.margin === null ? "—" : `${c.margin.toFixed(0)}%`}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="px-4 py-4 bg-stone-50">
            {children}
          </td>
        </tr>
      )}
    </>
  );
}
