"use client";

import { createContext, useContext } from "react";
import { SITE_DEFAULTS, type SiteSettings } from "@/lib/site-defaults";

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
