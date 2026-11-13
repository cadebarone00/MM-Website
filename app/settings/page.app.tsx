"use client";
import { useSyncExternalStore } from "react";
import { SettingsView } from "@/components/settings/SettingsView";
import type { SettingsData } from "@/lib/profile/profileScreensData";
import { appMode, MODE_COOKIE } from "@/lib/theme/appMode";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

const noSubscription = () => () => undefined;
/** Light / Dark is kept on this device (the same cookie the website uses), so it's read here rather than from the server. */
const savedMode = () => document.cookie.split("; ").find((c) => c.startsWith(`${MODE_COOKIE}=`))?.split("=")[1];

/** App → Settings (the gear on Profile): the website's Settings, with the same data from /api/app/profile?view=settings. */
export default function AppSettings() {
  const [state, reload] = useAppData<SettingsData>("/api/app/profile?view=settings");
  const mode = useSyncExternalStore(noSubscription, savedMode, () => undefined);
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  return <SettingsView data={state.data} appearance={appMode(mode)} />;
}
