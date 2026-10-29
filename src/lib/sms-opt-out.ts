import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/phone";

/** Carrier-standard opt-out / opt-in keywords (the whole reply, any case). */
const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"];
const START_WORDS = ["START", "UNSTOP", "SUBSCRIBE"];
/** Replies that clearly mean "stop" even with more words: "Stop please", "Please remove me from this list". */
const STOP_PHRASES =
  /\b(stop (texting|sending|messaging|contacting)|unsubscribe|opt (me )?out|remove me|take me off|don'?t (text|message) me|no more (texts|messages))\b/i;

export function keywordAction(text: string): "stop" | "start" | null {
  const word = text.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP_WORDS.includes(word)) return "stop";
  if (START_WORDS.includes(word)) return "start";
  // "STOP!!", "Stop please", "Stop it now": STOP plus only polite filler. Not just any
  // text that starts with "stop" ("Stop believing chat" is a conversation, not an opt-out).
  if (/^\s*(stop|stopall|unsubscribe)\b[\s.!,]*((please|pls|plz|now|it|this|them|thanks|thank you|asap)[\s.!,]*)*$/i.test(text)) {
    return "stop";
  }
  if (STOP_PHRASES.test(text)) return "stop";
  return null;
}

/**
 * A number replied STOP: never text it again. They stay on the subscriber
 * list (shown as "Replied STOP"; ones with an email keep getting emails), so
 * replying START later turns their texts back on.
 */
export async function optOut(key: string): Promise<void> {
  await prisma.smsOptOut.upsert({ where: { phone: key }, update: {}, create: { phone: key } });
}

/**
 * Once at startup: anyone whose latest STOP/START-type reply in Admin →
 * Messages means "stop" but who isn't opted out (replies like "Stop please"
 * that older versions didn't recognize) is opted out now.
 */
export async function catchMissedStops(): Promise<void> {
  const [incoming, optedOut] = await Promise.all([
    prisma.smsMessage.findMany({ where: { direction: "IN" }, orderBy: { createdAt: "asc" }, select: { phone: true, body: true } }),
    optedOutSet(),
  ]);
  const latest = new Map<string, "stop" | "start">();
  for (const m of incoming) {
    const action = keywordAction(m.body);
    if (action) latest.set(phoneKey(m.phone), action);
  }
  for (const [key, action] of latest) {
    if (key && action === "stop" && !optedOut.has(key)) {
      console.log(`[sms] Opting out ${key.slice(-4).padStart(key.length, "•")}: earlier reply asked to stop`);
      await optOut(key);
    }
  }
}

/** Has this number replied STOP? Texts must never go to it. */
export async function isOptedOut(phone: string | null | undefined): Promise<boolean> {
  const key = phoneKey(phone);
  if (!key) return false;
  return (await prisma.smsOptOut.count({ where: { phone: key } })) > 0;
}

export async function optedOutSet(): Promise<Set<string>> {
  return new Set((await prisma.smsOptOut.findMany({ select: { phone: true } })).map((r) => r.phone));
}
