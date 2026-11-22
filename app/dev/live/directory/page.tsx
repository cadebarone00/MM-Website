import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevLiveDirectory } from "@/components/dev/DevLivePreview";

export const metadata: Metadata = { title: "The Maroon Live directory | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: The Maroon Live directory on made-up data (simulator → The Maroon Live). Nothing is loaded or saved. */
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevLiveDirectory />;
}
