import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevProfilePreview } from "@/components/dev/DevProfilePreview";
import styles from "../../../profile/page.module.css";

export const metadata: Metadata = { title: "Public profile preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: someone else's Public profile (sample golfer Jake Parker), as you'd see it after searching for them. */
export default function DevPublicProfilePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <div className={styles.page}><Suspense><DevProfilePreview user="jakeparker" /></Suspense></div>;
}
