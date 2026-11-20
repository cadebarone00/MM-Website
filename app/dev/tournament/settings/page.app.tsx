"use client";

import { SettingsDataPreview } from "./SettingsDataPreview";
import { devTripSettingsPreview } from "@/lib/dev/devTripPreview";

/** App → the example trip's Settings (dev server only), the same sample trips as /dev/tournament. */
export default function DevTripSettingsAppPage() {
  return process.env.NODE_ENV === "development" ? <SettingsDataPreview {...devTripSettingsPreview()} /> : null;
}
