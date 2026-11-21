import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevLiveSettings } from "@/components/dev/DevLivePreview";

export const metadata: Metadata = { title: "Who can watch settings | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: Who can watch settings on made-up data (simulator → The Maroon Live). Nothing is loaded or saved. */
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevLiveSettings />;
}
