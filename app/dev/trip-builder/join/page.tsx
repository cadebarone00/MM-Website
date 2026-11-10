import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JoinLinkPreview } from "@/components/dev/tripBuilder/JoinLinkPreview";

export const metadata: Metadata = { title: "Join this trip preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: Trip Builder → Join this trip, in every state. */
export default function DevJoinLinkPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <JoinLinkPreview />;
}
