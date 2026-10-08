import type { GiftCertificate } from "@prisma/client";
import { fireNotification } from "@/lib/notifications";
import { getSetting } from "@/lib/settings";

/** Tell n8n a gift card is ready, so it can email the code to the recipient (and buyer). */
export async function notifyGiftActivated(gift: GiftCertificate) {
  const appUrl = await getSetting("APP_URL", process.env.NEXT_PUBLIC_APP_URL || "");
  await fireNotification("gift.activated", {
    code: gift.code,
    amount: gift.initialAmount,
    balance: gift.balance,
    recipientName: gift.recipientName,
    recipientEmail: gift.recipientEmail,
    fromName: gift.fromName,
    message: gift.message,
    purchaserEmail: gift.purchaserEmail,
    shopUrl: appUrl,
  });
}
