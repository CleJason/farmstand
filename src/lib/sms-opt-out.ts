import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/phone";

/** Carrier-standard opt-out / opt-in keywords (the whole reply, any case). */
const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"];
const START_WORDS = ["START", "UNSTOP", "SUBSCRIBE"];

export function keywordAction(text: string): "stop" | "start" | null {
  const word = text.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP_WORDS.includes(word)) return "stop";
  if (START_WORDS.includes(word)) return "start";
  return null;
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
