import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { redirectToSetupIfNeeded } from "@/lib/first-run";

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  await redirectToSetupIfNeeded();
  // Already signed in: no point showing the login form
  const session = await auth();
  if (session?.user) redirect(session.user.role === "ADMIN" ? "/admin" : "/");
  return children;
}
