"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSeasonCatalog } from "@/components/SeasonCatalogProvider";
import { useRef, useState } from "react";
import type { UpcomingRoundScheduleItem } from "@/lib/data/activeSeasonOverlay";
import coursePhotos from "@/lib/data/coursePhotos.json";
import { sessionsForDay, tournamentDays } from "./scheduleDays";
import styles from "./ScheduleAccordion.module.css";

const formatDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

/**
 * One tournament day: that day's sessions split the screen (first session
 * left, second right — stacked top/bottom on mobile), the day name sits at
 * the top center, and the circle arrows step to the previous/next day.
 */
export function ScheduleAccordion({ rounds, year, initialDate }: { rounds: UpcomingRoundScheduleItem[]; year: number; initialDate: string }) {
  const { nextTournament } = useSeasonCatalog();
  const libraryDialog = useRef<HTMLDialogElement>(null);
  const photosByCourse = coursePhotos as Record<string, { name: string; main: string[]; library: string[] }>;

  const listed = tournamentDays(rounds, nextTournament.startDate, nextTournament.endDate);
  const days = listed.includes(initialDate) ? listed : [...listed, initialDate].sort();
  const [dayIndex, setDayIndex] = useState(days.indexOf(initialDate));
  const day = days[dayIndex];

  const panels = sessionsForDay(rounds, day, dayIndex).map((session, index) => {
    const round = rounds.find(round => round.session === session);
    const courseKey = (round?.courseName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const candidates = Object.values(photosByCourse).filter(entry => {
      const key = entry.name.replace(/\s+photos$/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return key && courseKey.includes(key);
    });
    const photos = photosByCourse[courseKey] ?? (candidates.length === 1 ? candidates[0] : undefined);
    const appearance = rounds.filter(item => item.session < session && item.courseName === round?.courseName).length;
    return { round: session, date: formatDate(round?.date ?? day), course: round?.courseName, format: round?.format, image: photos?.main[appearance % (photos.main.length || 1)] ?? "/schedule/mission-hills.webp", library: photos?.library ?? [], position: `${30 + index * 20}% center` };
  });
  // Each course's library once, even when both sessions play the same course.
  const libraries = panels.filter((panel, index) => panel.library.length && panels.findIndex(other => other.course === panel.course) === index);

  function goTo(index: number) {
    setDayIndex(index);
    window.history.replaceState(null, "", `?date=${days[index]}`);
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/schedule">Back</Link>
      <h1 className={styles.dayTitle}>Day {dayIndex + 1}</h1>
      <button type="button" className={styles.libraryButton} onClick={() => libraryDialog.current?.showModal()}>Photo Library</button>
    </header>
    <div className={styles.split} aria-label={`Day ${dayIndex + 1} sessions`}>
      {panels.map(panel => <section key={panel.round} className={styles.half}>
        <Image src={panel.image} alt="" fill sizes="(max-width: 1023px) 100vw, 50vw" className={styles.photo} style={{ objectPosition: panel.position }} />
        <div className={styles.shade} />
        <div className={styles.details}>
          <p className={styles.eyebrow}>{nextTournament.year === year ? nextTournament.venue : "Maroon Tournament " + year}</p>
          <h2>{panel.course ?? "Course to be announced"}</h2>
          <p className={styles.format}>{panel.format ?? "Format to be announced"}</p>
          <p>{nextTournament.year === year ? nextTournament.location : ""}</p>
          <p className={styles.note}>Session {panel.round} · {panel.date}{!panel.course || !panel.format ? " · More details to come" : ""}</p>
        </div>
      </section>)}
    </div>
    {dayIndex > 0 && <button type="button" className={`${styles.arrow} ${styles.prev}`} aria-label={`Day ${dayIndex}`} onClick={() => goTo(dayIndex - 1)}><ChevronLeft size={28} /></button>}
    {dayIndex < days.length - 1 && <button type="button" className={`${styles.arrow} ${styles.next}`} aria-label={`Day ${dayIndex + 2}`} onClick={() => goTo(dayIndex + 1)}><ChevronRight size={28} /></button>}
    <dialog ref={libraryDialog} className={styles.libraryDialog}>
      <header><h2>Day {dayIndex + 1} Photo Library</h2><button type="button" onClick={() => libraryDialog.current?.close()}>Close</button></header>
      {libraries.length
        ? libraries.map(panel => <div key={panel.course}><h3 className={styles.libraryCourse}>{panel.course}</h3><div className={styles.libraryGrid}>{panel.library.map((src, index) => <div key={src}><Image src={src} alt={`${panel.course} course photo ${index + 1}`} width={1200} height={800} sizes="(max-width: 700px) 90vw, 45vw" /></div>)}</div></div>)
        : <p>Course photos will appear here once the library is added.</p>}
    </dialog>
  </main>;
}
