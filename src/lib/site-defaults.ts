/** Owner-editable storefront content (Admin → Settings → Site). Safe for client code. */
export const SITE_DEFAULTS = {
  SITE_NAME: "Your Shop Name",
  SITE_TAGLINE: "Fresh, local goods",
  SITE_HEADLINE: "Your Shop Name",
  SITE_INTRO: "Small-batch goods made fresh each week. Pre-order online and pick up at our stand.",
  SITE_ABOUT: "",
  SITE_DROPS_HEADING: "Weekly Drops",
  SITE_DROPS_BLURB: "Pre-order during the ordering window, then pick up at your chosen time.",
  SITE_FARMSTAND_HEADING: "Farmstand",
  SITE_FARMSTAND_BLURB: "Grabbed something from the stand? Pick what you took and pay right here.",
  SITE_PICKUP_AREA: "", // public, e.g. "Springfield, Ohio"
  SITE_PICKUP_INFO: "", // exact address & instructions — only sent to paid customers
  SITE_CONTACT_EMAIL: "",
  SITE_CONTACT_PHONE: "",
  // Social links: a username/handle or a full link. Only filled ones are shown.
  SITE_INSTAGRAM: "",
  SITE_FACEBOOK: "",
  SITE_TIKTOK: "",
  SITE_X: "",
  SITE_YOUTUBE: "",
  SITE_PINTEREST: "",
  SITE_THREADS: "",
  SITE_SNAPCHAT: "",
  SITE_BLUESKY: "",
  SITE_ETSY: "",
  SITE_NEXTDOOR: "",
  SITE_WEBSITE: "",
  SITE_LOGO_URL: "",
  // Wide banner photo at the top of the home page, and which part of it shows
  SITE_COVER_URL: "",
  SITE_COVER_POSITION: "",
  // Where the logo / business name appear ("true" | "false")
  SITE_LOGO_IN_HEADER: "true",
  SITE_NAME_IN_HEADER: "true",
  SITE_NAME_IN_TAB: "true",
  SITE_NAME_IN_NOTIFICATIONS: "true",
  SITE_BRAND_COLOR: "#D97706",
  SITE_BUTTON_TEXT_COLOR: "#FFFFFF", // text on brand-colored buttons
  // Web address of the walk-up page: yoursite.com/<this>. /farmstand always works too.
  SITE_FARMSTAND_PATH: "farmstand",
  // Changed wording for text and buttons, as JSON (see src/lib/copy.ts)
  SITE_COPY: "",
  // Legal pages (/privacy, /terms). Empty = the built-in starter text.
  SITE_PRIVACY: "",
  SITE_TERMS: "",
  // Set automatically when the legal text is saved (yyyy-mm-dd), shown as "Last updated"
  SITE_PRIVACY_UPDATED: "",
  SITE_TERMS_UPDATED: "",
};

export type SiteKey = keyof typeof SITE_DEFAULTS;
export type SiteSettings = Record<SiteKey, string>;
export const SITE_KEYS = Object.keys(SITE_DEFAULTS) as SiteKey[];

export const TOGGLE_KEYS: SiteKey[] = [
  "SITE_LOGO_IN_HEADER",
  "SITE_NAME_IN_HEADER",
  "SITE_NAME_IN_TAB",
  "SITE_NAME_IN_NOTIFICATIONS",
];

export const isOn = (v: string) => v === "true";

/**
 * Settings not sent to the browser with every page: the private pickup
 * address, and the long legal texts (only /privacy and /terms need them).
 */
export const PRIVATE_SITE_KEYS: SiteKey[] = ["SITE_PICKUP_INFO", "SITE_PRIVACY", "SITE_TERMS"];

/** Site settings safe to send to any visitor (private fields blanked). */
export function publicSite(site: SiteSettings): SiteSettings {
  const copy = { ...site };
  for (const k of PRIVATE_SITE_KEYS) copy[k] = "";
  return copy;
}

export function isHexColor(v: string) {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Built-in pages the walk-up page's address can't take over. */
export const RESERVED_PATHS = [
  "admin", "api", "drops", "gift", "login", "my-orders", "privacy", "pwa-icon", "review",
  "setup", "terms", "unsubscribe", "uploads", "manifest.webmanifest", "_next", "icon.png",
  "icon.svg", "offline.html", "sw.js", "favicon.ico",
];

/** "Porch Pickup!" → "porch-pickup"; "" when unusable. */
export function cleanPath(v: string) {
  const p = v
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return p && !RESERVED_PATHS.includes(p) ? p : "";
}

/** Link to the walk-up page, e.g. "/porch-pickup". */
export function standHref(site: Pick<SiteSettings, "SITE_FARMSTAND_PATH">) {
  return `/${cleanPath(site.SITE_FARMSTAND_PATH || "") || "farmstand"}`;
}
