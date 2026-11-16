"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

type Settings = {
  enabled: boolean;
  pointsPerDollar: number;
  threshold: number;
  rewardType: "AMOUNT" | "PERCENT";
  rewardValue: number;
  expiresDays: number;
};
type Due = { name: string | null; email: string | null; phone: string | null; points: number; rewards: number };

const input =
  "text-sm px-3 py-2 border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500";

/**
 * Admin → Rewards: points for what customers pay, turned into a discount code
 * when they reach the goal. Set it up first; nothing goes out until it's on.
 */
export default function AdminRewardsPage() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [due, setDue] = useState<Due[]>([]);
  const [withPoints, setWithPoints] = useState(0);
  const [form, setForm] = useState({ pointsPerDollar: "", threshold: "", rewardType: "AMOUNT", rewardValue: "", expiresDays: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/settings/rewards")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const s: Settings = d.settings;
        setSaved(s);
        setDue(d.due);
        setWithPoints(d.customers);
        setForm({
          pointsPerDollar: String(s.pointsPerDollar),
          threshold: String(s.threshold),
          rewardType: s.rewardType,
          rewardValue: s.rewardType === "PERCENT" ? String(s.rewardValue) : (s.rewardValue / 100).toFixed(2),
          expiresDays: String(s.expiresDays),
        });
      })
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const put = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/settings/rewards", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(d.error || "Couldn't save that"), false;
    await load();
    return true;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = form.rewardType === "PERCENT" ? Math.round(Number(form.rewardValue)) : Math.round(Number(form.rewardValue) * 100);
    if (await put({ ...form, rewardValue: value })) setMsg("Saved.");
  };

  const toggle = async () => {
    if (!saved) return;
    if (!saved.enabled) {
      const now = due.reduce((n, d) => n + d.rewards, 0);
      const warn = now
        ? `\n\n${due.length} customer${due.length === 1 ? " already has" : "s already have"} enough points, so ${now} reward code${now === 1 ? "" : "s"} will go out within about 10 minutes.`
        : "";
      if (!confirm(`Turn rewards on?${warn}`)) return;
    } else if (!confirm("Turn rewards off? Points keep counting; no new codes go out.")) return;
    if (await put({ enabled: !saved.enabled })) setMsg(saved.enabled ? "Rewards are off." : "Rewards are on.");
  };

  if (!saved) return <p className="text-sm text-stone-400">Loading…</p>;

  const valueNum = Number(form.rewardValue) || 0;
  const rewardText = form.rewardType === "PERCENT" ? `${valueNum}% off` : `${formatPrice(Math.round(valueNum * 100))} off`;
  const spendFor = (Number(form.threshold) || 0) / (Number(form.pointsPerDollar) || 1);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Rewards</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Customers earn points for what they pay. When they reach the goal, they get a discount code by email or text.
        </p>
      </div>

      <div
        className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
          saved.enabled ? "bg-emerald-50 border-emerald-200" : "bg-white border-stone-200"
        }`}
      >
        <div>
          <p className="font-semibold text-stone-900">{saved.enabled ? "Rewards are on" : "Rewards are off"}</p>
          <p className="text-xs text-stone-500">
            {saved.enabled
              ? "Codes go out automatically when someone reaches the goal (checked every 10 minutes)."
              : "Points still add up in Admin → Customers. Nothing is sent to customers until you turn it on."}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 ${
            saved.enabled ? "bg-stone-100 hover:bg-stone-200 text-stone-700" : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
        >
          {saved.enabled ? "Turn off" : "Turn on"}
        </button>
      </div>

      <form onSubmit={save} className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-medium text-stone-600 mb-1">Points per $1 paid</span>
            <input type="number" min={0} step="any" value={form.pointsPerDollar} onChange={(e) => setForm({ ...form, pointsPerDollar: e.target.value })} className={`${input} w-full`} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-stone-600 mb-1">Points for a reward</span>
            <input type="number" min={1} step={1} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} className={`${input} w-full`} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-stone-600 mb-1">Reward</span>
            <span className="flex gap-2">
              <select value={form.rewardType} onChange={(e) => setForm({ ...form, rewardType: e.target.value })} className={input}>
                <option value="AMOUNT">$ off</option>
                <option value="PERCENT">% off</option>
              </select>
              <input
                type="number"
                min={0}
                step={form.rewardType === "PERCENT" ? 1 : 0.01}
                value={form.rewardValue}
                onChange={(e) => setForm({ ...form, rewardValue: e.target.value })}
                className={`${input} w-full`}
              />
            </span>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-stone-600 mb-1">Code expires after (days, 0 = never)</span>
            <input type="number" min={0} step={1} value={form.expiresDays} onChange={(e) => setForm({ ...form, expiresDays: e.target.value })} className={`${input} w-full`} />
          </label>
        </div>
        <p className="text-sm text-stone-700 bg-stone-50 rounded-lg px-3 py-2">
          Every <b>{form.threshold || "?"}</b> points (about <b>${Math.round(spendFor * 100) / 100}</b> spent) = <b>{rewardText}</b> their next order
          {Number(form.expiresDays) > 0 ? `, good for ${form.expiresDays} days` : ""}. Each code works once, and only for them when they have an email.
        </p>
        <div className="flex items-center gap-3">
          <button disabled={busy} className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg">
            Save
          </button>
          {msg && <span className="text-sm text-stone-500">{msg}</span>}
        </div>
      </form>

      <section className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
        <h2 className="font-semibold text-stone-900">With these settings</h2>
        <p className="text-sm text-stone-600">
          {withPoints} customer{withPoints === 1 ? " has" : "s have"} points. Points count paid orders here plus history imported from
          Hotplate, and any points you added by hand in Customers.
        </p>
        {due.length > 0 ? (
          <>
            <p className="text-sm text-amber-800">
              {due.length} customer{due.length === 1 ? " is" : "s are"} already at the goal and would get a code as soon as rewards are on:
            </p>
            <ul className="text-sm text-stone-700 divide-y divide-stone-100 max-h-72 overflow-y-auto">
              {due.map((d, i) => (
                <li key={i} className="py-1.5 flex justify-between gap-3">
                  <span>{d.name || d.email || d.phone}</span>
                  <span className="text-stone-500 whitespace-nowrap">
                    {d.points} pts → {d.rewards} code{d.rewards === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-stone-500">Nobody is at the goal yet.</p>
        )}
      </section>
    </div>
  );
}
