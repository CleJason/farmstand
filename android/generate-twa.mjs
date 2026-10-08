// Generates the Android (Trusted Web Activity) project for the admin app.
// Run by .github/workflows/android.yml; not part of the web app.
//
// env: DOMAIN, PACKAGE_ID, APP_NAME, VERSION_CODE, VERSION_NAME,
//      KEYSTORE_PATH, KEY_ALIAS, OUT_DIR, LOCAL_ICON_BASE (fallback icon host)
import { TwaGenerator, TwaManifest, ConsoleLog } from "@bubblewrap/core";

const env = (k, d) => process.env[k] || d;
const domain = env("DOMAIN").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const log = new ConsoleLog("twa");

// Prefer the live manifest (name, colors, logo from Admin → Site). If the site
// isn't reachable yet, fall back to defaults with the bundled icon.
let webManifestUrl = new URL(`https://${domain}/manifest.webmanifest`);
let webManifest;
let live = true;
try {
  const res = await fetch(webManifestUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  webManifest = await res.json();
  log.info(`Using live manifest from ${webManifestUrl}`);
} catch (err) {
  log.warn(`Couldn't load ${webManifestUrl} (${err.message}); using defaults and the bundled icon.`);
  live = false;
  const base = env("LOCAL_ICON_BASE");
  webManifestUrl = new URL(`${base}/manifest.webmanifest`);
  webManifest = {
    name: env("APP_NAME", "Shop Admin"),
    short_name: env("APP_NAME", "Shop Admin"),
    start_url: "/admin",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#D97706",
    icons: [{ src: `${base}/icon.png`, sizes: "512x512", type: "image/png" }],
  };
}

const twa = TwaManifest.fromWebManifestJson(webManifestUrl, webManifest);
// The generator re-downloads the web manifest when this is set; only do that for the live site
if (!live) twa.webManifestUrl = undefined;
twa.packageId = env("PACKAGE_ID");
twa.host = domain;
twa.startUrl = "/admin";
if (process.env.APP_NAME) {
  twa.name = process.env.APP_NAME;
  twa.launcherName = process.env.APP_NAME.slice(0, 30);
}
twa.appVersionCode = Number(env("VERSION_CODE", "1"));
twa.appVersionName = env("VERSION_NAME", "1.0.0");
twa.signingKey = { path: env("KEYSTORE_PATH"), alias: env("KEY_ALIAS", "farmstand") };
twa.fallbackType = "customtabs";
twa.enableNotifications = false;
twa.generatorApp = "farmstand-github-actions";

const problem = twa.validate();
if (problem) {
  console.error(`Invalid app settings: ${problem}`);
  process.exit(1);
}

await new TwaGenerator().createTwaProject(env("OUT_DIR"), twa, log);
log.info(`Generated ${twa.packageId} for https://${domain}${twa.startUrl}`);
