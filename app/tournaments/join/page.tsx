import type { Metadata } from "next";
import { JoinTournamentPage } from "@/components/platform/JoinTournamentPage";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Tournaments | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Where Join Tournament on the home screen leads: open a link, create, or revisit past tournaments. */
export default function JoinPage() {
  return <div className={styles.pageHeader}><JoinTournamentPage /></div>;
}
