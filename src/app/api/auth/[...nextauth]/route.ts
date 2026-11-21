import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { checkLoginCode } from "@/lib/login-code";

export const { POST } = handlers;

// Every sign-in (link or typed code) passes through here, so wrong-guess
// limits on the short code can't be skipped by calling the callback directly.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  if (url.pathname.endsWith("/callback/nodemailer")) {
    const result = await checkLoginCode(url.searchParams.get("email") ?? "", url.searchParams.get("token") ?? "");
    if (result !== "ok") {
      const params = new URLSearchParams({ code: result });
      const cb = url.searchParams.get("callbackUrl");
      if (cb) {
        // Keep just the path: the link's callback URL is absolute
        try {
          const u = new URL(cb, url.origin);
          params.set("callbackUrl", u.pathname + u.search);
        } catch {}
      }
      // Relative redirect: behind the tunnel the request origin is the internal address
      return new NextResponse(null, { status: 303, headers: { Location: `/login?${params}` } });
    }
  }
  return handlers.GET(req);
}
