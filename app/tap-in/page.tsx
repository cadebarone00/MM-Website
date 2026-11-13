import type { Viewport } from "next";
import { MaroonLiveDirectory } from "@/components/tap-in/MaroonLiveDirectory";

export const metadata = { title: "The Maroon Live", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

/** Public directory mock. Real trip discovery/publication is not connected. */
export default function TapInPage() {
  return <MaroonLiveDirectory />;
}
