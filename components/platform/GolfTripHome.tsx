"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { MessageCircle, Settings } from "lucide-react";
import { golfTripDraftSnapshot, parseGolfTripDraft, type GolfTripDraft, plannedRounds, shortTripDate, tripDates } from "@/lib/platform/golfTripDraft";
import styles from "./GolfTripHome.module.css";

const TABS = ["Home", "Golf", "Venue", "Info"] as const;
type Tab = (typeof TABS)[number];

const TOURNAMENT_ANSWERS: Record<string, string> = { yes: "Yes, there's a tournament", no: "No tournament, just golf", undecided: "Not sure yet" };

/** The draft only changes on the questionnaire's Next, so there is nothing to listen for here. */
const subscribeNever = () => () => {};

/**
 * Golf Trip Home: trip name, a 4-tab selector, and (on Home) one card per part of the trip. Layout only:
 * cards show the questionnaire answers kept in this tab, or an empty state. Nothing is saved yet.
 * `preview` replaces those answers with fixed ones (the /dev/tournament design preview).
 * `settingsHref` is where the settings wheel goes (this trip's settings page).
 */
export function GolfTripHome({ preview, settingsHref }: { preview?: GolfTripDraft; settingsHref: string }) {
  const raw = useSyncExternalStore(subscribeNever, golfTripDraftSnapshot, () => "");
  const stored = useMemo(() => parseGolfTripDraft(raw), [raw]);
  const draft = preview ?? stored;
  const [tab, setTab] = useState<Tab>("Home");

  const dates = tripDates(draft.startDate, draft.endDate);
  const dateRange = dates.length > 0 ? `${shortTripDate(dates[0])} – ${shortTripDate(dates[dates.length - 1])}` : "";

  return <main className={styles.page}>
    <header className={styles.header}>
      {/* Look only for now: chat isn't built yet. */}
      <button type="button" className={`${styles.iconButton} ${styles.iconLeft}`} aria-label="Trip chat"><MessageCircle size={24} strokeWidth={1.75} aria-hidden /></button>
      <Link href={settingsHref} className={`${styles.iconButton} ${styles.iconRight}`} aria-label="Trip settings"><Settings size={24} strokeWidth={1.75} aria-hidden /></Link>
      <h1 className={styles.title}>{draft.tripName || "Your Golf Trip"}</h1>
      <div className={styles.tabs} role="tablist" aria-label="Trip sections">
        {TABS.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name}
          className={`${styles.tab} ${tab === name ? styles.tabActive : ""}`} onClick={() => setTab(name)}>{name}</button>)}
      </div>
    </header>
    <div className={styles.body} role="tabpanel" aria-label={tab}>
      {tab === "Home" ? <HomeSections draft={draft} dates={dates} dateRange={dateRange} /> : <Card title={tab}><Empty>Coming soon</Empty></Card>}
    </div>
  </main>;
}

function HomeSections({ draft, dates, dateRange }: { draft: Record<string, string>; dates: string[]; dateRange: string }) {
  const rounds = plannedRounds(draft);

  return <>
    <Card title="Travel">
      {draft.destination || dates.length > 0
        ? <Rows rows={[["Destination", draft.destination || "Not set yet"], ["Dates", dateRange || "Not set yet"], ["Nights", dates.length > 1 ? String(dates.length - 1) : "—"]]} />
        : <Empty>Add your destination and dates</Empty>}
    </Card>
    <Card title="Stay"><Empty>Add where you&apos;re staying</Empty></Card>
    <Card title="Golf">
      {rounds.length > 0
        ? <Rows rows={rounds.map((round) => [`Round ${round.number}`, `${round.date ? shortTripDate(round.date) : `Day ${round.dayNumber}`} · ${draft[`round${round.number}Course`] || "Course not set"}`])} />
        : <Empty>Add your golf days and courses</Empty>}
    </Card>
    <Card title="Transportation"><Empty>Add flights, rental cars or shuttles</Empty></Card>
    <Card title="Tournament">
      {draft.includesTournament ? <p className={styles.text}>{TOURNAMENT_ANSWERS[draft.includesTournament] ?? "Not sure yet"}</p> : <Empty>Decide if there&apos;s a tournament</Empty>}
    </Card>
    <Card title="Travelers">
      {draft.yourName ? <Rows rows={[[draft.yourName, "Organizer"]]} /> : null}
      <Empty>Invite the rest of your group</Empty>
    </Card>
    <Card title="Itinerary">
      {dates.length > 0
        ? <Rows rows={dates.map((date, i) => [`Day ${i + 1}`, shortTripDate(date)])} />
        : <Empty>Your day-by-day plan shows here once dates are set</Empty>}
    </Card>
    <Card title="Expenses"><Empty>Track who paid for what</Empty></Card>
    <Card title="Photos"><Empty>Share photos from the trip</Empty></Card>
  </>;
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.card} aria-label={title}>
    <h2 className={styles.cardTitle}>{title}</h2>
    {children}
  </section>;
}

function Rows({ rows }: { rows: string[][] }) {
  return <dl className={styles.rows}>
    {rows.map(([label, value]) => <div key={label} className={styles.row}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
