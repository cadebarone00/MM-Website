import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevProfilePreview } from "@/components/dev/DevProfilePreview";
import styles from "../../profile/page.module.css";

export const metadata: Metadata = { title: "Profile preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: the real profile screen (the bottom menu's Profile) with sample data, no sign-in. The simulator picks whose profile. */
export default function DevProfilePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <div className={styles.page}><DevProfilePreview /></div>;
}
