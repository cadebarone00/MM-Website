import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevUserFriendsPreview } from "@/components/dev/DevProfilePreview";

export const metadata: Metadata = { title: "Friends preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: a sample golfer's Friends list (?user=<username>), no sign-in. */
export default function DevUserFriendsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense><DevUserFriendsPreview /></Suspense>;
}
