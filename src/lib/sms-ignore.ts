import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { phoneKey } from "@/lib/phone";

const KEY = "IGNORED_SMS_NUMBERS";

/**
 * Numbers kept out of Admin → Messages (e.g. the owner's own phone, which texts
 * the shop phone all day). Their texts aren't saved; STOP/START still work.
 */
export async function ignoredNumbers(): Promise<Set<string>> {
  const raw = await getSetting(KEY, "");
  return new Set(raw.split(",").map(phoneKey).filter(Boolean));
}

export async function setIgnored(phone: string, ignored: boolean): Promise<Set<string>> {
  const key = phoneKey(phone);
  const list = await ignoredNumbers();
  if (ignored) list.add(key);
  else list.delete(key);
  const value = [...list].join(",");
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return list;
}
