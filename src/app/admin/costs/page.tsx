"use client";

import { useEffect, useState } from "react";
import type { CostsData } from "@/lib/costs-data";
import RecipesTab from "@/components/costs/RecipesTab";
import IngredientsTab from "@/components/costs/IngredientsTab";
import PurchasesTab from "@/components/costs/PurchasesTab";
import ImportExportTab from "@/components/costs/ImportExportTab";
import ReceiptsTab from "@/components/costs/ReceiptsTab";
import BakingTab from "@/components/costs/BakingTab";

const TABS = [
  { key: "recipes", label: "Recipes" },
  { key: "baking", label: "Baking" },
  { key: "ingredients", label: "Ingredients" },
  { key: "purchases", label: "Purchases" },
  { key: "receipts", label: "Receipts" },
  { key: "import", label: "Import / Export" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/**
 * Admin → Costs: what ingredients cost (from the purchase log) and what each
 * recipe costs to make, per batch and per item, against what it sells for.
 */
export default function AdminCostsPage() {
  const [data, setData] = useState<CostsData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("recipes");

  useEffect(() => {
    fetch("/api/costs")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("Couldn't load costs"));
  }, []);

  /** Send a change; the reply is the fresh data. `error` is "" when it worked. */
  const save = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: (json.error as string) || "Couldn't save that", data: null, json };
    const fresh: CostsData = json.data ?? json;
    setData(fresh);
    return { error: "", data: fresh, json };
  };

  const empty = data && !data.ingredients.length && !data.recipes.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Costs</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          What your ingredients cost, from what you buy, and what each recipe costs to make.
        </p>
      </div>

      <div className="flex gap-1 bg-stone-100 p-1 rounded-lg w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === t.key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && (
        <div className="text-center py-16">
          <div className="inline-block w-5 h-5 border-2 border-stone-300 border-t-amber-600 rounded-full animate-spin" />
        </div>
      )}
      {data && empty && tab !== "import" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          Nothing here yet. Start in{" "}
          <button onClick={() => setTab("import")} className="font-semibold underline">
            Import / Export
          </button>{" "}
          to bring in your cost spreadsheet or Mealie recipes, or add ingredients and purchases by hand.
        </div>
      )}
      {data && tab === "recipes" && <RecipesTab data={data} save={save} />}
      {data && tab === "baking" && <BakingTab data={data} save={save} />}
      {data && tab === "ingredients" && <IngredientsTab data={data} save={save} />}
      {data && tab === "purchases" && <PurchasesTab data={data} save={save} />}
      {data && tab === "receipts" && <ReceiptsTab data={data} save={save} />}
      {data && tab === "import" && <ImportExportTab data={data} save={save} />}
    </div>
  );
}
