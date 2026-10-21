"use client";

import { useCallback, useEffect, useState } from "react";
import { parsFromForm, type TripRoundPars as Snapshot } from "@/lib/platform/tripRoundPars";
import type { RoundCourseLoad } from "@/lib/platform/tripRoundParsServer";
import styles from "./TripRoundPars.module.css";

/**
 * H5C Part 1 — Trip Settings → a round → Course Yardage, under the tee boxes (saved trips, organizer only).
 * Round pars: loaded from the round's course + tee (Use course pars), or typed by hand when the course has no scorecard.
 * Nothing is saved until the organizer taps Confirm pars; pars lock at the round's first score. Shotgun: each scoring
 * group's starting hole, until that group has a score. Always the same size (18 boxes, fixed status lines).
 */
interface Load {
  installed: boolean; scored: boolean; courseName: string | null; course: RoundCourseLoad; snapshot: Snapshot | null;
  groups: { id: string; groupNumber: number; startHole: number; locked: boolean; players: string[] }[];
}
const BLANK = Array<string>(18).fill("");
const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

function courseStatus(course: RoundCourseLoad): string {
  if (course.status === "no-course") return "Pick this round's course (Edit, above) to load its pars, or enter them by hand.";
  const where = `${course.name}${course.tee ? ` · ${course.tee}` : ""}`;
  if (course.status === "ok") return `Course scorecard: ${where}.`;
  if (course.status === "no-scorecard") return `${where} has no 18-hole scorecard on file. Enter the pars from the card.`;
  if (course.status === "tee-par") return `${where}: a tee's par is outside 3–6. Enter the pars from the card.`;
  return `${where}: the scorecard couldn't be loaded right now. Try again, or enter the pars by hand.`;
}

export function TripRoundPars({ tripId, roundNumber }: { tripId: string; roundNumber: number }) {
  const [load, setLoad] = useState<Load | "loading" | "unavailable">("loading");
  const [form, setForm] = useState<string[]>(BLANK);
  const [fromCourse, setFromCourse] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Bumped after a save: reloads the round's pars and groups.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/golf-trips/${tripId}/round-pars?round=${roundNumber}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Load;
        if (!response.ok) { setLoad("unavailable"); return; }
        setLoad(body);
        setForm(body.snapshot ? body.snapshot.pars.map(String) : BLANK);
        setFromCourse(body.snapshot?.source === "course");
      })
      .catch((error: Error) => { if (error.name !== "AbortError") setLoad("unavailable"); });
    return () => controller.abort();
  }, [tripId, roundNumber, version]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const post = async (body: Record<string, unknown>, done: string) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/golf-trips/${tripId}/round-pars`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ round: roundNumber, ...body }) });
      const answer = await response.json() as { error?: string };
      setMessage(response.ok ? done : answer.error ?? "Couldn't save. Try again.");
      if (response.ok) refresh();
    } catch { setMessage("You're offline. Try again when you're back online."); }
    finally { setBusy(false); }
  };

  const ready = typeof load === "object" ? load : null;
  const locked = Boolean(ready && (ready.scored || ready.snapshot?.lockedAt));
  const canEdit = Boolean(ready?.installed) && !locked && !busy;
  const snapshot = ready?.snapshot ?? null;
  const status = load === "loading" ? "Loading round pars…"
    : load === "unavailable" ? "Round pars aren't available right now."
    : !load.installed ? "Round pars need the latest database update (golf_trip_round_pars.sql)."
    : snapshot ? `Confirmed${snapshot.source === "course" ? ` from ${snapshot.courseName ?? "the course"}${snapshot.tee ? ` · ${snapshot.tee}` : ""}` : " (entered by hand)"}${snapshot.confirmedBy ? ` by ${snapshot.confirmedBy}` : ""}.${locked ? " Locked: scoring has started." : ""}`
    : `Not confirmed yet: scorecards show plain numbers and only hole-in-ones can be highlighted.${locked ? " Scoring has started, so pars can't be added." : ""}`;
  const courseLine = ready ? courseStatus(ready.course) : "";
  const coursePars = ready?.course.status === "ok" ? ready.course.pars : null;

  return <section className={styles.panel} aria-label={`Round ${roundNumber} pars`}>
    <h4>Round pars</h4>
    <p className={styles.status} role="status">{status}<br />{courseLine}</p>
    <div className={styles.grid}>
      {HOLES.map((hole) => <label key={hole}>{hole}
        <input type="number" inputMode="numeric" min={3} max={6} aria-label={`Par for hole ${hole}`} value={form[hole - 1]} disabled={!canEdit}
          onChange={(event) => { const value = event.target.value; setForm((current) => current.map((v, i) => i === hole - 1 ? value : v)); setFromCourse(false); }} />
      </label>)}
    </div>
    <div className={styles.actions}>
      <button type="button" disabled={!canEdit || !coursePars} onClick={() => { if (coursePars) { setForm(coursePars.map(String)); setFromCourse(true); setMessage("Check them against the card, then confirm."); } }}>Use course pars</button>
      <button type="button" className={styles.primary} disabled={!canEdit} onClick={() => {
        const checked = parsFromForm(form);
        if (!checked.ok) { setMessage(checked.error); return; }
        void post({ action: "confirm", pars: checked.pars, source: fromCourse ? "course" : "manual" }, "Round pars confirmed.");
      }}>Confirm pars</button>
    </div>
    <p className={styles.message} role="alert">{message}</p>
    {ready && ready.groups.length > 0 && <>
      <h4>Starting holes</h4>
      <p className={styles.status}>Shotgun start: choose each group&apos;s first hole. A group&apos;s hole is fixed once it has a score.</p>
      <ul className={styles.groups}>
        {ready.groups.map((group) => <li key={group.id}>
          <span>Group {group.groupNumber}{group.players.length ? ` · ${group.players.join(", ")}` : ""}</span>
          <select aria-label={`Group ${group.groupNumber} starting hole`} value={group.startHole} disabled={!ready.installed || group.locked || busy}
            onChange={(event) => void post({ action: "start-hole", groupId: group.id, startHole: Number(event.target.value) }, `Group ${group.groupNumber} starts on hole ${event.target.value}.`)}>
            {HOLES.map((hole) => <option key={hole} value={hole}>Hole {hole}</option>)}
          </select>
        </li>)}
      </ul>
    </>}
  </section>;
}
