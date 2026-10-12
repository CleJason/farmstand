import { announceDueDrops } from "@/lib/drop-alerts";
import { sweepCardPayments } from "@/lib/stripe-paid";

let running = false;

/** The once-a-minute check started in src/instrumentation.ts. Never overlaps itself. */
export async function runBackgroundJobs(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await announceDueDrops();
    await sweepCardPayments();
  } finally {
    running = false;
  }
}
