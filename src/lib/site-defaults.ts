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
  SITE_PICKUP_INFO: "",
  SITE_CONTACT_EMAIL: "",
  SITE_CONTACT_PHONE: "",
  SITE_INSTAGRAM: "",
  SITE_FACEBOOK: "",
  SITE_WEBSITE: "",
  SITE_LOGO_URL: "",
  // Where the logo / business name appear ("true" | "false")
  SITE_LOGO_IN_HEADER: "true",
  SITE_NAME_IN_HEADER: "true",
  SITE_NAME_IN_TAB: "true",
  SITE_NAME_IN_NOTIFICATIONS: "true",
  SITE_BRAND_COLOR: "#D97706",
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

export function isHexColor(v: string) {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}
