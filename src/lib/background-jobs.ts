import { announceDueDrops } from "@/lib/drop-alerts";
import { remindDueDrops } from "@/lib/drop-reminders";
import { sweepCardPayments } from "@/lib/stripe-paid";

let running = false;

/** The once-a-minute check started in src/instrumentation.ts. Never overlaps itself. */
export async function runBackgroundJobs(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await announceDueDrops();
    await remindDueDrops();
    await sweepCardPayments();
  } finally {
    running = false;
  }
}
