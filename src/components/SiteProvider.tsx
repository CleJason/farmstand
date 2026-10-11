"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { SITE_DEFAULTS, type SiteSettings } from "@/lib/site-defaults";
import { copyText, parseCopy, type CopyKey } from "@/lib/copy";

export type Viewer = { email: string | null; isAdmin: boolean } | null;

const SiteContext = createContext<SiteSettings>(SITE_DEFAULTS);
const ViewerContext = createContext<Viewer>(null);

/**
 * Makes the owner's site settings and the signed-in viewer available to
 * client pages without a refetch.
 */
export function SiteProvider({
  site,
  viewer,
  children,
}: {
  site: SiteSettings;
  viewer: Viewer;
  children: React.ReactNode;
}) {
  return (
    <SiteContext.Provider value={site}>
      <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}

/** The signed-in user, or null when signed out. */
export function useViewer() {
  return useContext(ViewerContext);
}

/** text("drop.step1") → the owner's wording for that spot (Admin → Site → Text & buttons). */
export function useText() {
  const site = useSite();
  const overrides = useMemo(() => parseCopy(site.SITE_COPY), [site.SITE_COPY]);
  return useCallback(
    (key: CopyKey, vars?: Record<string, string | number>) => copyText(overrides, key, vars),
    [overrides]
  );
}
