import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevEditProfilePreview } from "@/components/dev/DevProfilePreview";

export const metadata: Metadata = { title: "Edit profile preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: the real Edit profile form for the sample profile (/dev/profile's photo pencil). Changes stay in the sample data. */
export default function DevEditProfilePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevEditProfilePreview />;
}
