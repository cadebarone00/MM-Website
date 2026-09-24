"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { UpcomingRoundScheduleItem } from "@/lib/data/activeSeasonOverlay";
import styles from "./ScheduleAccordion.module.css";

export function ScheduleAccordion({ rounds, year, initialDate }: { rounds: UpcomingRoundScheduleItem[]; year: number; initialDate: string }) {
  const panels = Array.from({ length: 8 }, (_, index) => {
    const round = rounds.find(round => round.round === index + 1);
    const date = round?.date ?? `${year}-01-0${6 + Math.floor(index / 2)}`;
    return { round: index + 1, date, course: round?.courseName, format: round?.format };
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
      setActive(index => Math.max(0, Math.min(7, index + direction)));
      accumulated = 0;
    };
    container.addEventListener("wheel", wheel, { passive: false });
    return () => { container.removeEventListener("wheel", wheel); if (timer.current) clearTimeout(timer.current); };
  }, []);

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
    <header className={styles.header}><Link href="/schedule">Back</Link><h1>The Maroon Masters <span>{year}</span></h1><span className={styles.hint}>Explore eight sessions</span></header>
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
          <Image src="/schedule/mission-hills.webp" alt="" fill sizes="(max-width: 1023px) 100vw, 50vw" className={styles.photo} style={{ objectPosition: `${30 + index * 6}% center` }} />
          <div className={styles.shade} />
          <button className={styles.toggle} aria-expanded={active === index} aria-controls={`round-${panel.round}`} onClick={() => setActive(index)}><span>{date}</span><span>Session {panel.round}</span></button>
          <div id={`round-${panel.round}`} className={styles.details} hidden={active !== index}>
            <p className={styles.eyebrow}>Mission Hills Country Club</p>
            <h2>{panel.course ?? "Course to be announced"}</h2>
            <p className={styles.format}>{panel.format ?? "Format to be announced"}</p>
            <p>Palm Springs, CA</p>
            <p className={styles.note}>Round {panel.round} · {date}{!panel.course || !panel.format ? " · More details to come" : ""}</p>
          </div>
        </section>;
      })}
    </div>
  </main>;
}
