import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-input";
import { loadCustomers } from "@/lib/customers";
import { REWARD_KEYS, rewardSettings, rewardsDue, type RewardSettings } from "@/lib/rewards";

/** The rewards settings, plus who'd get a reward right away with them (before turning it on). */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await rewardSettings();
  const customers = await loadCustomers();
  const due = rewardsDue(customers, settings);
  return NextResponse.json({
    settings,
    customers: customers.filter((c) => c.points > 0).length,
    due: due.map((d) => ({ name: d.name, email: d.email, phone: d.phone, points: d.points, rewards: d.rewards })),
  });
}

/** Save any of the settings (and turn rewards on or off). */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = (await req.json().catch(() => ({}))) as Partial<Record<keyof RewardSettings, unknown>>;
  const values: [string, string][] = [];
  const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });

  if (data.enabled !== undefined) values.push([REWARD_KEYS.enabled, data.enabled ? "true" : "false"]);
  if (data.pointsPerDollar !== undefined) {
    const n = Number(data.pointsPerDollar);
    if (!(n > 0 && n <= 100)) return bad("Points per $1 must be more than 0 (up to 100)");
    values.push([REWARD_KEYS.pointsPerDollar, String(n)]);
  }
  if (data.threshold !== undefined) {
    const n = Number(data.threshold);
    if (!Number.isInteger(n) || n < 1 || n > 100000) return bad("Points for a reward must be a whole number above 0");
    values.push([REWARD_KEYS.threshold, String(n)]);
  }
  if (data.rewardType !== undefined) values.push([REWARD_KEYS.rewardType, data.rewardType === "PERCENT" ? "PERCENT" : "AMOUNT"]);
  if (data.rewardValue !== undefined) {
    const n = Number(data.rewardValue);
    if (!Number.isInteger(n) || n < 1) return bad("The reward must be more than 0");
    const type = data.rewardType ?? (await rewardSettings()).rewardType;
    if (type === "PERCENT" && n > 100) return bad("A percent reward can be up to 100%");
    values.push([REWARD_KEYS.rewardValue, String(n)]);
  }
  if (data.expiresDays !== undefined) {
    const n = Number(data.expiresDays);
    if (!Number.isInteger(n) || n < 0 || n > 3650) return bad("Days must be a whole number (0 = never expires)");
    values.push([REWARD_KEYS.expiresDays, String(n)]);
  }

  await prisma.$transaction(
    values.map(([key, value]) => prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } }))
  );
  return NextResponse.json({ settings: await rewardSettings() });
}
