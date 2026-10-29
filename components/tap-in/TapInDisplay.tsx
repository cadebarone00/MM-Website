"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BroadcastLeaderboard } from "@/lib/broadcast/leaderboardData";
import type { BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";
import { IndividualLeaderboardScene } from "@/components/broadcast/scenes/IndividualLeaderboardScene";
import { MatchPlayScene } from "@/components/broadcast/scenes/MatchPlayScene";
import styles from "./TapIn.module.css";

type Display = { leaderboard: BroadcastLeaderboard; matchPlay: BroadcastMatchPlay };

/** Graphics only: no producer state, playlist, event queue, video or music. */
export function TapInDisplay({ initial }: { initial: Display }) {
  const [data, setData] = useState(initial);
  const [board, setBoard] = useState<"individual" | "matches">("individual");
  const [scrolling, setScrolling] = useState(true);
  const [message, setMessage] = useState("");
  const [locked, setLocked] = useState(false);
  const stage = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/tap-in/display", { cache: "no-store", signal: controller.signal });
        if (!active) return;
        if (response.status === 401 || response.status === 403) {
          setLocked(true); setMessage("Your session has ended. Sign in again to continue.");
          return;
        }
        if (!response.ok) throw new Error("refresh");
        const next = await response.json() as Display;
        if (active) { setData(next); setMessage(""); }
      } catch { if (active) setMessage("Connection interrupted. Showing the last update; retrying."); }
      finally { pending = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("online", refresh);
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("online", refresh); };
  }, []);

  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0;
  }, [board]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    if (!scrolling || locked || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let direction = 1;
    let position = element.scrollTop;
    let pauseUntil = performance.now() + 3000;
    let previous = performance.now();
    let frame = 0;
    function tick(now: number) {
      if (!element) return;
      const elapsed = Math.min(now - previous, 100);
      previous = now;
      const max = Math.max(0, element.scrollHeight - element.clientHeight);
      position = Math.max(0, Math.min(position, max));
      if (max > 0 && now >= pauseUntil) {
        position += direction * elapsed * 0.025;
        element.scrollTop = position;
        if (position >= max || position <= 0) { position = Math.max(0, Math.min(position, max)); direction *= -1; pauseUntil = now + 3000; }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [board, scrolling, locked]);

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.current?.requestFullscreen) await stage.current.requestFullscreen();
      else setMessage("Use the browser fullscreen control to fill this screen.");
    } catch { setMessage("Use the browser fullscreen control to fill this screen."); }
  }

  return <main className={styles.display} ref={stage}>
    <header className={styles.controls}>
      <Link href="/tap-in">Tap In</Link>
      <div role="group" aria-label="Leaderboard display">
        <button type="button" aria-pressed={board === "individual"} onClick={() => setBoard("individual")}>Leaderboard</button>
        <button type="button" aria-pressed={board === "matches"} onClick={() => setBoard("matches")}>Match Play</button>
        <button type="button" aria-pressed={scrolling} onClick={() => setScrolling(value => !value)}>{scrolling ? "Pause scrolling" : "Resume scrolling"}</button>
        <button type="button" onClick={fullscreen}>Fullscreen</button>
      </div>
    </header>
    {message && <p className={styles.status} role="status">{message}</p>}
    {locked ? <div className={styles.locked}><Link href="/login/email?next=%2Ftap-in">Sign In</Link></div> : <div className={styles.viewport} ref={viewport} tabIndex={0} aria-label="TV leaderboard">
      <div className={styles.canvas}>{board === "individual" ? <IndividualLeaderboardScene standings={data.leaderboard.standings} final={data.leaderboard.final} /> : <MatchPlayScene matchPlay={data.matchPlay} />}</div>
    </div>}
  </main>;
}
