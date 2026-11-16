import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { sendShopEmail } from "@/lib/send-email";
import { sendMarketing } from "@/lib/marketing-send";
import { getSiteSettings, isOn } from "@/lib/site";
import { isOptedOut } from "@/lib/sms-opt-out";
import { phoneKey } from "@/lib/phone";
import { formatPrice } from "@/lib/utils";

/**
 * Rewards (Admin → Rewards): customers earn points for what they pay, and
 * every `threshold` points turns into a single-use discount code sent to them.
 * Off until the owner turns it on; points still count in Admin → Customers.
 */
export type RewardSettings = {
  enabled: boolean;
  pointsPerDollar: number; // points per $1 paid
  threshold: number; // points per reward
  rewardType: "AMOUNT" | "PERCENT";
  rewardValue: number; // cents off, or percent
  expiresDays: number; // 0 = the code never expires
};

export const REWARD_KEYS = {
  enabled: "REWARDS_ENABLED",
  pointsPerDollar: "REWARDS_POINTS_PER_DOLLAR",
  threshold: "REWARDS_THRESHOLD",
  rewardType: "REWARDS_TYPE",
  rewardValue: "REWARDS_VALUE",
  expiresDays: "REWARDS_EXPIRES_DAYS",
} as const;

const num = (v: string, d: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);

export async function rewardSettings(): Promise<RewardSettings> {
  const [enabled, ppd, threshold, type, value, expires] = await Promise.all([
    getSetting(REWARD_KEYS.enabled, "false"),
    getSetting(REWARD_KEYS.pointsPerDollar, "1"),
    getSetting(REWARD_KEYS.threshold, "100"),
    getSetting(REWARD_KEYS.rewardType, "AMOUNT"),
    getSetting(REWARD_KEYS.rewardValue, "1000"),
    getSetting(REWARD_KEYS.expiresDays, "90"),
  ]);
  return {
    enabled: enabled === "true",
    pointsPerDollar: Math.max(0, num(ppd, 1)),
    threshold: Math.max(1, Math.round(num(threshold, 100))),
    rewardType: type === "PERCENT" ? "PERCENT" : "AMOUNT",
    rewardValue: Math.max(0, Math.round(num(value, 1000))),
    expiresDays: Math.max(0, Math.round(num(expires, 90))),
  };
}

/** "$10 off" or "15% off" */
export const rewardLabel = (s: Pick<RewardSettings, "rewardType" | "rewardValue">) =>
  s.rewardType === "PERCENT" ? `${s.rewardValue}% off` : `${formatPrice(s.rewardValue)} off`;

// No 0/O/1/I so codes are easy to read and type
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rewardCode = () => {
  const c = Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `REWARD-${c.slice(0, 4)}-${c.slice(4)}`;
};

type Earner = { name: string | null; email: string | null; phone: string | null; points: number };

/** How many rewards each customer has earned and not been given yet (for the settings page preview). */
export function rewardsDue(customers: Earner[], s: RewardSettings) {
  return customers
    .filter((c) => (c.email || c.phone) && c.points >= s.threshold)
    .map((c) => ({ ...c, rewards: Math.floor(c.points / s.threshold) }));
}

let lastRun = 0;

/**
 * Background job (every 10 minutes while rewards are on): customers at or over
 * the threshold get a code per reward earned, the points are taken off, and
 * they're told by email and/or text (texts wait for texting hours).
 */
export async function issueDueRewards() {
  if (Date.now() - lastRun < 10 * 60_000) return;
  lastRun = Date.now();
  const s = await rewardSettings();
  if (!s.enabled || s.rewardValue <= 0) return;
  const { loadCustomers } = await import("@/lib/customers");
  const due = rewardsDue(await loadCustomers(), s);
  if (!due.length) return;
  const site = await getSiteSettings();
  const shop = isOn(site.SITE_NAME_IN_NOTIFICATIONS) ? site.SITE_NAME : "";
  const appUrl = await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "");

  for (const c of due.slice(0, 20)) {
    const email = c.email?.trim().toLowerCase() || null;
    const phone = phoneKey(c.phone) || null;
    const codes: string[] = [];
    const expiresAt = s.expiresDays ? new Date(Date.now() + s.expiresDays * 86_400_000) : null;
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < c.rewards; i++) {
        const code = rewardCode();
        await tx.discountCode.create({
          data: {
            code,
            type: s.rewardType,
            value: s.rewardValue,
            appliesTo: "ALL",
            maxUses: 1,
            // Only works for them when we know their email; a phone-only customer's code is just single-use
            allowedEmails: email ? [email] : [],
            expiresAt,
          },
        });
        codes.push(code);
      }
      await tx.pointsAdjustment.create({
        data: { email, phone, points: -c.rewards * s.threshold, reason: `Reward: ${codes.join(", ")}` },
      });
    });

    const first = c.name?.split(" ")[0];
    const what = `${rewardLabel(s)} your next order`;
    const until = expiresAt ? ` It's good until ${expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : "";
    const body =
      `${first ? `Hi ${first}! ` : ""}Thanks for being a regular${shop ? ` at ${shop}` : ""}. You've earned a reward: ` +
      `${what} with code ${codes.join(", ")}.${until}`;
    try {
      if (email) await sendShopEmail({ to: email, subject: `You earned a reward${shop ? ` from ${shop}` : ""}`, text: `${body}\n\n${appUrl}` });
      if (phone && !(await isOptedOut(phone))) {
        const sms = `${shop ? `${shop}: ` : ""}${body} ${appUrl} Reply STOP to opt out.`;
        await sendMarketing("broadcast", { smsMessage: sms, texts: [{ phone }], emails: [] }, { body: sms, phones: [phone] });
      }
    } catch (e) {
      console.error("[rewards] Couldn't tell the customer about their reward", e);
    }
  }
}
