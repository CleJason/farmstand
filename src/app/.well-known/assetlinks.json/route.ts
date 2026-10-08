import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Digital Asset Links: proves the Android admin app belongs to this site so it
 * opens full-screen (no browser bar). Values come from Admin → Settings → Android app.
 */
export async function GET() {
  const [packageId, fingerprints] = await Promise.all([
    getSetting("ANDROID_PACKAGE_ID"),
    getSetting("ANDROID_CERT_SHA256"),
  ]);

  const certs = fingerprints
    .split(/[\s,]+/)
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));

  const body =
    packageId && certs.length
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: { namespace: "android_app", package_name: packageId, sha256_cert_fingerprints: certs },
          },
        ]
      : [];

  return Response.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}
