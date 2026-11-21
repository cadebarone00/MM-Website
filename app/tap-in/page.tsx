import type { Viewport } from "next";
import { MaroonLiveDirectory } from "@/components/tap-in/MaroonLiveDirectory";

export const metadata = { title: "The Maroon Live", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

/** The Maroon Live directory: every Public trip and tournament (loaded from /api/live). */
export default function TapInPage() {
  return <MaroonLiveDirectory />;
}
