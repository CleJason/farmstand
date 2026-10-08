import { redirect } from "next/navigation";
import { isAppConfigured } from "@/lib/auth-helpers";

// The wizard only runs once; afterwards settings live in Admin → Settings.
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  if (await isAppConfigured()) redirect("/admin");
  return children;
}
