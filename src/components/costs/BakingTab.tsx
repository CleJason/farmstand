"use client";

import { useCallback, useEffect, useState } from "react";
import { money } from "@/lib/costs";
import { amount, buttonClass, ghostClass, inputClass, shortDate, type TabProps } from "@/components/costs/shared";

type Plan = {
  sold: { name: string; quantity: number; picks: { name: string; quantity: number }[] }[];
  recipes: { recipeId: string; name: string; items: number; yieldCount: number; yieldLabel: string; batches: number; logged: number }[];
  unlinked: { name: string; quantity: number }[];
  ingredients: { id: string; name: string; baseUnit: string; need: number; onHand: number | null }[];
};

const REASON_LABEL: Record<string, string> = {
  drop: "for the drop",
  porch: "porch extras",
  test: "trying a recipe",
  other: "other",
  giveaway: "given away",
  tasting: "tasting",
  tossed: "tossed",
};
const halfUp = (n: number) => Math.ceil(n * 2) / 2;

/**
 * Baking: what a drop's orders need (batches, ingredients vs on hand) and one
 * tap to log it as baked; porch extras and recipe tests by hand; and leftovers
 * given away, so they count as a cost.
 */
export default function BakingTab({ data, save }: TabProps) {
  return (
    <div className="space-y-6">
      <DropPlan data={data} save={save} />
      <OtherBake data={data} save={save} />
      <ItemsOut data={data} save={save} />
      <History data={data} save={save} />
    </div>
  );
}

function DropPlan({ data, save }: TabProps) {
  const [dropId, setDropId] = useState(data.drops[0]?.id ?? "");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [bake, setBake] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  const load = useCallback(
    (id: string) =>
      fetch(`/api/costs/plan?dropId=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p: Plan | null) => {
          setPlan(p);
          // Suggest the rest of what's needed, rounded up to a half batch
          setBake(Object.fromEntries((p?.recipes ?? []).map((r) => [r.recipeId, String(Math.max(0, halfUp(r.batches) - r.logged))])));
          setExtra({});
        }),
    []
  );
  useEffect(() => {
    if (dropId) load(dropId);
  }, [dropId, load]);

  const logIt = async () => {
    if (!plan) return;
    const bakes = plan.recipes.flatMap((r) => [
      { recipeId: r.recipeId, batches: Number(bake[r.recipeId]) || 0, reason: "drop", dropId },
      { recipeId: r.recipeId, batches: Number(extra[r.recipeId]) || 0, reason: "porch", dropId, note: "extra for the porch" },
    ]).filter((b) => b.batches > 0);
    if (!bakes.length) return setMsg("Nothing to log");
    const { error } = await save("/api/costs/bakes", "POST", { bakes });
    setMsg(error || "Logged. Ingredients taken out of what's on hand.");
    if (!error) load(dropId);
  };

  if (!data.drops.length) return null;
  return (
    <section className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Bake for a drop</h2>
          <p className="text-xs text-stone-500">From the drop&apos;s orders (paid or awaiting Venmo/PayPal). Log it once it&apos;s baked.</p>
        </div>
        <select value={dropId} onChange={(e) => setDropId(e.target.value)} className={`${inputClass} w-auto`}>
          {data.drops.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} ({shortDate(d.orderOpenAt)})
            </option>
          ))}
        </select>
      </div>

      {plan && plan.unlinked.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">
          Not linked to a recipe yet: {plan.unlinked.map((u) => `${u.name} × ${u.quantity}`).join(", ")}. Open the recipe on the
          Recipes tab and add it under &quot;Sold in the shop as&quot;.
        </p>
      )}
      {plan && !plan.recipes.length && !plan.unlinked.length && <p className="text-sm text-stone-500">No orders in this drop yet.</p>}

      {plan && plan.recipes.length > 0 && (
        <>
          <table className="w-full text-sm">
            <thead className="text-xs text-stone-500 text-left">
              <tr>
                <th className="py-1.5 font-medium">Recipe</th>
                <th className="py-1.5 font-medium">Ordered</th>
                <th className="py-1.5 font-medium">Batches needed</th>
                <th className="py-1.5 font-medium">Bake (batches)</th>
                <th className="py-1.5 font-medium">+ extra for the porch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {plan.recipes.map((r) => (
                <tr key={r.recipeId}>
                  <td className="py-2 font-medium text-stone-900">{r.name}</td>
                  <td className="py-2 text-stone-600">
                    {Math.round(r.items * 100) / 100} {r.yieldLabel}
                  </td>
                  <td className="py-2 text-stone-600">
                    {r.batches.toFixed(2)} <span className="text-[11px] text-stone-400">(makes {r.yieldCount})</span>
                    {r.logged > 0 && <span className="block text-[11px] text-green-700">{r.logged} logged already</span>}
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min={0} step="0.5" value={bake[r.recipeId] ?? ""} onChange={(e) => setBake({ ...bake, [r.recipeId]: e.target.value })} className={`${inputClass} w-24`} />
                  </td>
                  <td className="py-2">
                    <input type="number" min={0} step="0.5" value={extra[r.recipeId] ?? ""} onChange={(e) => setExtra({ ...extra, [r.recipeId]: e.target.value })} placeholder="0" className={`${inputClass} w-24`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-stone-700">
              Ingredients needed{" "}
              {plan.ingredients.some((i) => i.onHand !== null && i.onHand < i.need) && <span className="text-red-600">· some are short</span>}
            </summary>
            <table className="w-full text-xs mt-2">
              <tbody className="divide-y divide-stone-100">
                {plan.ingredients.map((i) => {
                  const short = i.onHand !== null && i.onHand < i.need;
                  return (
                    <tr key={i.id}>
                      <td className="py-1 text-stone-800">{i.name}</td>
                      <td className="py-1 text-stone-600">need {amount(i.need, i.baseUnit)}</td>
                      <td className={`py-1 ${short ? "text-red-600 font-semibold" : "text-stone-500"}`}>
                        {i.onHand === null ? "on hand: not counted" : `on hand ${amount(Math.max(0, i.onHand), i.baseUnit)}${short ? " · buy more" : ""}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>

          <div className="flex items-center gap-3">
            <button onClick={logIt} className={buttonClass}>
              Log as baked
            </button>
            {msg && <span className="text-xs text-stone-500">{msg}</span>}
          </div>
        </>
      )}
    </section>
  );
}

function OtherBake({ data, save }: TabProps) {
  const [form, setForm] = useState({ recipeId: "", batches: "1", reason: "test", note: "" });
  const [msg, setMsg] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await save("/api/costs/bakes", "POST", { bakes: [form] });
    setMsg(error || "Logged.");
    if (!error) setForm({ ...form, note: "" });
  };
  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-stone-900">Other baking</h2>
        <p className="text-xs text-stone-500">Porch Pickup extras, trying a new recipe, a custom order…</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <select value={form.recipeId} onChange={(e) => setForm({ ...form, recipeId: e.target.value })} className={`${inputClass} w-56`}>
          <option value="">Recipe…</option>
          {data.recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <label className="text-xs text-stone-600">
          Batches
          <input type="number" min={0} step="0.5" value={form.batches} onChange={(e) => setForm({ ...form, batches: e.target.value })} className={`${inputClass} w-20`} />
        </label>
        <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={`${inputClass} w-auto`}>
          <option value="test">Trying a recipe</option>
          <option value="porch">Porch extras</option>
          <option value="other">Other</option>
        </select>
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note (optional)" className={`${inputClass} w-56`} />
        <button disabled={!form.recipeId || !(Number(form.batches) > 0)} className={buttonClass}>
          Log
        </button>
        {msg && <span className="text-xs text-stone-500">{msg}</span>}
      </div>
    </form>
  );
}

function ItemsOut({ data, save }: TabProps) {
  const [form, setForm] = useState({ recipeId: "", count: "", reason: "giveaway", note: "" });
  const [msg, setMsg] = useState("");
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = data.itemsOut.filter((o) => o.date.slice(0, 7) === month && o.reason === "giveaway").reduce((n, o) => n + o.cost, 0) / 100;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await save("/api/costs/items-out", "POST", form);
    setMsg(error || "Logged.");
    if (!error) setForm({ ...form, count: "", note: "" });
  };
  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Leftovers &amp; giveaways</h2>
          <p className="text-xs text-stone-500">
            Didn&apos;t sell and went to someone to try (or got tossed). Counted as a cost; ingredients were already taken out when it was baked.
          </p>
        </div>
        <span className="text-sm text-stone-600">
          Given away this month: <b className="text-stone-900">{money(thisMonth)}</b>
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <select value={form.recipeId} onChange={(e) => setForm({ ...form, recipeId: e.target.value })} className={`${inputClass} w-56`}>
          <option value="">What…</option>
          {data.recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({money(r.cost.perItem)} each)
            </option>
          ))}
        </select>
        <label className="text-xs text-stone-600">
          How many
          <input type="number" min={0} step="any" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} className={`${inputClass} w-20`} />
        </label>
        <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={`${inputClass} w-auto`}>
          <option value="giveaway">Given away</option>
          <option value="tasting">Tasting / samples</option>
          <option value="tossed">Tossed</option>
        </select>
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Who got them (optional)" className={`${inputClass} w-56`} />
        <button disabled={!form.recipeId || !(Number(form.count) > 0)} className={buttonClass}>
          Log
        </button>
        {msg && <span className="text-xs text-stone-500">{msg}</span>}
      </div>
    </form>
  );
}

function History({ data, save }: TabProps) {
  const rows = [
    ...data.bakes.map((b) => ({ kind: "bake" as const, id: b.id, date: b.date, text: `${b.batches} batch${b.batches === 1 ? "" : "es"} of ${b.recipeName}`, reason: b.reason, note: b.note, cost: b.cost })),
    ...data.itemsOut.map((o) => ({ kind: "out" as const, id: o.id, date: o.date, text: `${o.count} ${o.recipeName}`, reason: o.reason, note: o.note, cost: o.cost })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 40);
  if (!rows.length) return null;
  return (
    <section className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
      <h2 className="px-4 py-2.5 text-sm font-semibold text-stone-900 border-b border-stone-100">Recent</h2>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-stone-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2 whitespace-nowrap text-stone-600 w-28">{shortDate(r.date)}</td>
              <td className="px-4 py-2 text-stone-900">
                {r.kind === "bake" ? "Baked " : ""}
                {r.text}
                <span className="ml-2 text-[11px] text-stone-400">{REASON_LABEL[r.reason] ?? r.reason}</span>
                {r.note && <span className="ml-2 text-[11px] text-stone-500">{r.note}</span>}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap text-stone-600">{money(r.cost / 100)}</td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={async () => {
                    if (!confirm("Delete this entry?")) return;
                    const url = r.kind === "bake" ? "/api/costs/bakes" : "/api/costs/items-out";
                    const { error } = await save(`${url}?id=${encodeURIComponent(r.id)}`, "DELETE");
                    if (error) alert(error);
                  }}
                  className={`${ghostClass} !px-2 !py-0.5 !text-[11px] !font-normal`}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
