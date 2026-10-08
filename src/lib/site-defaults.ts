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
  // Where the logo / business name appear ("true" | "false")
  SITE_LOGO_IN_HEADER: "true",
  SITE_NAME_IN_HEADER: "true",
  SITE_NAME_IN_TAB: "true",
  SITE_NAME_IN_NOTIFICATIONS: "true",
  SITE_BRAND_COLOR: "#D97706",
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
