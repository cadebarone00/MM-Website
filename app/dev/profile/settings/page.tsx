import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevSettingsPreview } from "@/components/dev/DevProfilePreview";

export const metadata: Metadata = { title: "Settings preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: the real Settings screen for the sample profile (/dev/profile's gear). Changes stay in the sample data. */
export default function DevProfileSettingsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevSettingsPreview />;
}
