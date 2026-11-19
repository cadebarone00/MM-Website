import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevRoundPreview } from "@/components/dev/DevRoundPreview";

export const metadata: Metadata = { title: "Round preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: a sample Play round with friends (nothing saved). */
export default function DevRoundPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevRoundPreview />;
}
