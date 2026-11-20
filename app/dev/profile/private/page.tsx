import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevProfilePreview } from "@/components/dev/DevProfilePreview";
import styles from "../../../profile/page.module.css";

export const metadata: Metadata = { title: "Private profile preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: someone else's Private profile (sample golfer Mike Chen), as you'd see it after searching for them. */
export default function DevPrivateProfilePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <div className={styles.page}><Suspense><DevProfilePreview user="mikechen" /></Suspense></div>;
}
