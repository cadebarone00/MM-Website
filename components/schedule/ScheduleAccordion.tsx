"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { UpcomingRoundScheduleItem } from "@/lib/data/activeSeasonOverlay";
import coursePhotos from "@/lib/data/coursePhotos.json";
import styles from "./ScheduleAccordion.module.css";

export function ScheduleAccordion({ rounds, year, initialDate }: { rounds: UpcomingRoundScheduleItem[]; year: number; initialDate: string }) {
  const libraryDialog = useRef<HTMLDialogElement>(null);
  const photosByCourse = coursePhotos as Record<string, { name: string; main: string[]; library: string[] }>;
  const panels = Array.from({ length: Math.max(rounds.length, ...rounds.map(round => round.session), 1) }, (_, index) => {
    const round = rounds.find(round => round.session === index + 1);
    const date = round?.date ?? "Date pending";
    const courseKey = (round?.courseName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const candidates = Object.values(photosByCourse).filter(entry => {
      const key = entry.name.replace(/\s+photos$/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return key && courseKey.includes(key);
    });
    const photos = photosByCourse[courseKey] ?? (candidates.length === 1 ? candidates[0] : undefined);
    const appearance = rounds.filter(item => item.session < index + 1 && item.courseName === round?.courseName).length;
    return { round: index + 1, date, course: round?.courseName, format: round?.format, image: photos?.main[appearance % (photos.main.length || 1)] ?? "/schedule/mission-hills.webp", library: photos?.library ?? [] };
  });
  const [active, setActive] = useState(Math.max(0, panels.findIndex(panel => panel.date === initialDate)));
  const track = useRef<HTMLDivElement>(null);
  const lockedUntil = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = track.current;
    if (!container) return;
    lockedUntil.current = Date.now() + 700;
    const frame = requestAnimationFrame(() => {
      const panel = container.children[active] as HTMLElement;
      const mobile = window.matchMedia("(max-width: 1023px)").matches;
      container.scrollTo({ left: 0, top: mobile ? panel.offsetTop : 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    const container = track.current;
    if (!container) return;
    let accumulated = 0;
    const wheel = (event: WheelEvent) => {
      if (window.innerWidth < 1024 || event.ctrlKey) return;
      event.preventDefault();
      if (Date.now() < lockedUntil.current) return;
      accumulated += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(accumulated) < 40) return;
      const direction = Math.sign(accumulated);
      setActive(index => Math.max(0, Math.min(panels.length - 1, index + direction)));
      accumulated = 0;
    };
    container.addEventListener("wheel", wheel, { passive: false });
    return () => { container.removeEventListener("wheel", wheel); if (timer.current) clearTimeout(timer.current); };
  }, [panels.length]);

  const onScroll = () => {
    if (window.innerWidth >= 1024 || Date.now() < lockedUntil.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const container = track.current;
      if (!container) return;
      const mobile = window.innerWidth < 1024;
      const center = mobile ? container.scrollTop : container.scrollLeft + container.clientWidth / 2;
      let nearest = active;
      let distance = Infinity;
      Array.from(container.children).forEach((child, index) => {
        const item = child as HTMLElement;
        const midpoint = mobile ? item.offsetTop : item.offsetLeft + item.offsetWidth / 2;
        if (Math.abs(midpoint - center) < distance) { nearest = index; distance = Math.abs(midpoint - center); }
      });
      setActive(nearest);
    }, 140);
  };

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/schedule">Back</Link><button type="button" className={styles.libraryButton} onClick={() => libraryDialog.current?.showModal()}>Photo Library</button><span /></header>
    <div ref={track} className={styles.track} onScroll={onScroll} aria-label="Round schedule" onKeyDown={event => {
      const delta = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      const next = Math.max(0, Math.min(7, active + delta));
      setActive(next);
      (track.current?.children[next].querySelector("button") as HTMLButtonElement)?.focus({ preventScroll: true });
    }}>
      {panels.map((panel, index) => {
        const date = new Date(`${panel.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
        return <section key={panel.round} className={`${styles.panel} ${active === index ? styles.active : ""}`}>
          <Image src={panel.image} alt="" fill sizes="(max-width: 1023px) 100vw, 50vw" className={styles.photo} style={{ objectPosition: `${30 + index * 6}% center` }} />
          <div className={styles.shade} />
          <button className={styles.toggle} aria-expanded={active === index} aria-controls={`round-${panel.round}`} onClick={() => setActive(index)}><span className={styles.panelLabel}><span>{date}</span><span>Session {panel.round}</span></span></button>
          <div id={`round-${panel.round}`} className={styles.details} hidden={active !== index}>
            <p className={styles.eyebrow}>Mission Hills Country Club</p>
            <h2>{panel.course ?? "Course to be announced"}</h2>
            <p className={styles.format}>{panel.format ?? "Format to be announced"}</p>
            <p>Palm Springs, CA</p>
            <p className={styles.note}>Session {panel.round} · {date}{!panel.course || !panel.format ? " · More details to come" : ""}</p>
          </div>
        </section>;
      })}
    </div>
    <dialog ref={libraryDialog} className={styles.libraryDialog}>
      <header><h2>{panels[active].course ?? "Course"} Photo Library</h2><button type="button" onClick={() => libraryDialog.current?.close()}>Close</button></header>
      {panels[active].library.length ? <div className={styles.libraryGrid}>{panels[active].library.map((src, index) => <div key={src}><Image src={src} alt={`${panels[active].course} course photo ${index + 1}`} width={1200} height={800} sizes="(max-width: 700px) 90vw, 45vw" /></div>)}</div> : <p>Course photos will appear here once the library is added.</p>}
    </dialog>
  </main>;
}
