import { announceDueDrops } from "@/lib/drop-alerts";
import { remindDueDrops } from "@/lib/drop-reminders";
import { sweepCardPayments } from "@/lib/stripe-paid";
import { sendScheduled } from "@/lib/marketing-send";
import { cancelStaleUnpaid } from "@/lib/unpaid-orders";
import { sendDueReviewRequests } from "@/lib/review-requests";
import { issueDueRewards } from "@/lib/rewards";
import { sendPickupReminders } from "@/lib/pickup-reminders";

let running = false;

/** The once-a-minute check started in src/instrumentation.ts. Never overlaps itself. */
export async function runBackgroundJobs(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await announceDueDrops();
    await remindDueDrops();
    await sendScheduled();
    await sweepCardPayments();
    await cancelStaleUnpaid();
    await sendDueReviewRequests();
    await issueDueRewards();
    await sendPickupReminders();
  } finally {
    running = false;
  }
}
