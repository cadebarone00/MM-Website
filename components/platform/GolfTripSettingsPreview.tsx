"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import styles from "./GolfTripSettingsPreview.module.css";
import tripStyles from "./GolfTripHome.module.css";
import { GolfTripCompetition } from "./GolfTripCompetition";
import { useGolfTripCompetitionPreview } from "./GolfTripCompetitionPreviewProvider";

const GENERAL_CARDS = Array.from({ length: 6 }, () => "Place holder");
const ORGANIZER_CARDS = ["Players", "Competition", "Place holder", "Place holder", "Place holder", "Place holder"];

/** Reference layout in the site's maroon palette; settings remain presentation only. */
export function GolfTripSettingsPreview({ tripName }: { tripName: string }) {
  const [section, setSection] = useState("General");
  const [competitionOpen, setCompetitionOpen] = useState(false);
  const competition = useGolfTripCompetitionPreview();
  const cards = section === "Organizer" ? ORGANIZER_CARDS : GENERAL_CARDS;
  return <main className={`${styles.page} ${competitionOpen ? styles.competitionPage : ""}`}>
    <div className={styles.content}>
      {competitionOpen ? <header className={styles.competitionHeader}>
        <button type="button" className={styles.close} aria-label="Back to organizer settings" onClick={() => setCompetitionOpen(false)}><ChevronLeft size={28} aria-hidden /></button>
        <h1>Competition Settings</h1>
        <button type="button" className={styles.save} onClick={() => setCompetitionOpen(false)}>SAVE</button>
      </header> : <header className={styles.header}>
      <Link href="/dev/tournament" className={styles.close} aria-label="Back to trip"><ChevronLeft size={26} strokeWidth={1.75} aria-hidden /></Link>
      <div className={styles.heading}>
        <h1>{tripName}</h1>
        <p>Trip Settings</p>
      </div>
      </header>}
      {!competitionOpen && <div className={`${tripStyles.tabs} ${styles.tabs}`} aria-label="Settings sections preview">
        {["General", "Organizer"].map((name) => <button key={name} type="button" aria-pressed={section === name}
          className={`${tripStyles.tab} ${section === name ? tripStyles.tabActive : ""} ${styles.tab}`}
          onClick={() => { setSection(name); setCompetitionOpen(false); }}>{name}</button>)}
      </div>}
      {competitionOpen && competition ? <div className={styles.competition}>
        <p className={styles.previewNote}>Preview only. Changes stay during navigation and reset on reload.</p>
        <GolfTripCompetition rounds={competition.rounds} onChange={competition.change} />
      </div> : <div className={styles.grid}>
        {cards.map((title, index) => title === "Competition" ? <button key={index} type="button" className={`${styles.card} ${styles.cardButton}`} onClick={() => setCompetitionOpen(true)}>
          <h2>{title}</h2>
        </button> : <section key={index} className={styles.card} aria-label={title}>
          <h2>{title}</h2>
        </section>)}
      </div>}
    </div>
  </main>;
}
