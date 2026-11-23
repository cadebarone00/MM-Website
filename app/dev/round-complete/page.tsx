import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevRoundCompletePreview } from "@/components/dev/DevRoundCompletePreview";

export const metadata: Metadata = { title: "Round complete preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: the Round complete pop-up on a made-up finished round (nothing saved). */
export default function DevRoundCompletePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevRoundCompletePreview />;
}
