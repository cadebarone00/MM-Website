import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevLiveEvent } from "@/components/dev/DevLivePreview";

export const metadata: Metadata = { title: "The Maroon Live event page | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: The Maroon Live event page on made-up data (simulator → The Maroon Live). Nothing is loaded or saved. */
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevLiveEvent />;
}
