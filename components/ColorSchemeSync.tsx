"use client";

import { useEffect } from "react";
import { applyScheme, colorScheme, SCHEME_COOKIE } from "@/lib/theme/colorSchemes";

/** The scheme this device last showed (the "scheme" cookie), or The Maroon. */
export const savedScheme = () => colorScheme(document.cookie.split("; ").find((c) => c.startsWith(`${SCHEME_COOKIE}=`))?.split("=")[1]);

/** Shows the colour scheme saved on the account (Settings → Appearance), so a change on one device follows to the others. Signed out / offline: keeps this device's. */
export async function syncColorScheme() {
  const body = await fetch("/api/account/preferences", { cache: "no-store" }).then((r) => r.json() as Promise<{ ok?: boolean; colorScheme?: string }>).catch(() => null);
  if (body?.ok) applyScheme(colorScheme(body.colorScheme));
}

/** Website: the server already drew this device's scheme from the cookie; check the account once per page load. */
export function ColorSchemeSync() {
  useEffect(() => { void syncColorScheme(); }, []);
  return null;
}
