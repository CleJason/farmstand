import { getSetting } from "@/lib/settings";

/**
 * Texting hours for marketing (drop alerts, last-call reminders, bulk messages,
 * Porch Pickup notices): they only go out between these times, in the shop's
 * timezone. Order confirmations and replies from Admin → Messages always go
 * right away.
 */
export type TextHours = { enabled: boolean; start: string; end: string };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const tz = () => process.env.TZ || "America/New_York";

export async function textHours(): Promise<TextHours> {
  const [enabled, start, end] = await Promise.all([
    getSetting("TEXT_HOURS_ENABLED", "true"),
    getSetting("TEXT_HOURS_START", "09:00"),
    getSetting("TEXT_HOURS_END", "20:00"),
  ]);
  return {
    enabled: enabled !== "false",
    start: TIME.test(start) ? start : "09:00",
    end: TIME.test(end) ? end : "20:00",
  };
}

/** Minutes past midnight, in the shop's timezone. */
function localMinutes(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Whether marketing texts may go out now. */
export async function isTextingTime(now = new Date(), hours?: TextHours): Promise<boolean> {
  const h = hours ?? (await textHours());
  if (!h.enabled) return true;
  const m = localMinutes(now);
  const s = minutes(h.start);
  const e = minutes(h.end);
  return s <= e ? m >= s && m < e : m >= s || m < e; // e.g. 20:00–09:00 wraps past midnight
}

/** When texting hours next start (now, if they already have). */
export async function nextTextingTime(now = new Date()): Promise<Date> {
  const h = await textHours();
  if (await isTextingTime(now, h)) return now;
  const wait = (minutes(h.start) - localMinutes(now) + 1440) % 1440;
  const at = new Date(now.getTime() + wait * 60000);
  at.setSeconds(0, 0);
  return at;
}

/** "9:00 AM" */
export function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
