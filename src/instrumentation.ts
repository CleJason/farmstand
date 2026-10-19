/**
 * Runs once when the server starts. Starts a once-a-minute background check:
 * - announce drops that were published for later, when their ordering time starts
 * - send the "closing soon" reminder before a drop's ordering closes
 * - confirm card payments whose Stripe webhook never arrived
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Not during `next build`, only in the running server
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { runBackgroundJobs } = await import("@/lib/background-jobs");
  const tick = () => runBackgroundJobs().catch((err) => console.error("Background jobs failed", err));
  setTimeout(tick, 15_000); // shortly after start, then every minute
  // Once: opt out anyone whose earlier "stop" reply wasn't recognized
  const { catchMissedStops } = await import("@/lib/sms-opt-out");
  setTimeout(() => catchMissedStops().catch((err) => console.error("Checking for missed STOP replies failed", err)), 10_000);
  setInterval(tick, 60_000).unref?.();
}
