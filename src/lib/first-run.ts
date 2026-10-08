import { redirect } from "next/navigation";
import { isAppConfigured } from "@/lib/auth-helpers";

/** Send visitors to the setup wizard until an admin account exists. */
export async function redirectToSetupIfNeeded() {
  if (!(await isAppConfigured())) redirect("/setup");
}
