"use client";
import { PlatformHome } from "@/components/platform/PlatformHome";
import type { RibbonSetup } from "@/components/platform/ribbon/RibbonProvider";
import { useAppData } from "@/components/app/useAppData";

/** App → Play: the website's Play page, with its posts loaded from the live server (/api/app/play). */
export default function AppPlay() {
  const [state] = useAppData<{ signedIn: boolean; ribbon?: RibbonSetup }>("/api/app/play");
  // Shown straight away; the posts join it once they've loaded (a fresh mount, so the ribbon starts from them).
  return <PlatformHome key={state.status} signedIn ribbon={state.status === "ok" ? state.data.ribbon : undefined} />;
}
