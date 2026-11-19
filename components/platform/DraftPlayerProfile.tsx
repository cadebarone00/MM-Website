"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./GolfTripMatch.module.css";
import room from "./TripDraftRoom.module.css";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("");

/**
 * A player's tourney profile from the draft rooms (owner 2026-11-19): the same pop-up as the leaderboard's player card —
 * photo, name, Handicap · Sc. Avg. · Career Low — but nobody has played the trip yet, so there are no round tabs, scorecard
 * or round snapshot. Under the header: every draft stat from their row, in a grid.
 */
export function DraftPlayerProfile({ name, avatarUrl, username, stats, onClose }: {
  name: string; avatarUrl?: string | null; username?: string | null;
  /** The row's stats, [label, value] (HCP first). */
  stats: [string, string][];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Handicap · Sc. Avg. · Career Low from their profile rounds (as the leaderboard card does); sample players have no username.
  const [career, setCareer] = useState<{ handicapIndex: number | null; average18: number | null; best18: { total: number } | null } | null>(null);
  useEffect(() => {
    if (!username) return;
    let live = true;
    fetch("/api/profile/compare?u=" + encodeURIComponent(username)).then(response => response.json())
      .then(body => { if (live && body?.ok && body.result?.status === "ok" && body.result.stats) setCareer(body.result.stats); })
      .catch(() => {});
    return () => { live = false; };
  }, [username]);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const rowHandicap = stats.find(([label]) => label === "HCP")?.[1];
  const header: [string, string][] = [
    ["Handicap", career?.handicapIndex != null ? String(career.handicapIndex) : rowHandicap ?? "—"],
    ["Sc. Avg.", career?.average18 != null ? String(career.average18) : "—"],
    ["Career Low", career?.best18?.total != null ? String(career.best18.total) : "—"],
  ];

  return createPortal(<dialog ref={dialogRef} className={`${styles.leaderboardScoreSheet} ${styles.playerProfileSheet}`} aria-label={name + " tourney profile"}
    // It sits inside a draft room in the React tree: keep Escape / taps from also reaching (and closing) the room.
    onCancel={event => { event.stopPropagation(); onClose(); }}
    onClick={event => {
      event.stopPropagation();
      if (event.target !== event.currentTarget) return;
      const r = event.currentTarget.getBoundingClientRect();
      if (event.clientY < r.top || event.clientY > r.bottom || event.clientX < r.left || event.clientX > r.right) onClose();
    }}>
    <div className={styles.playerTripProfileHeader}>
      <span className={styles.playerTripProfileAvatar} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- a stored photo URL, shown as-is */}
        {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}
      </span>
      <div className={styles.playerTripProfileIdentity}>
        <h2>{name}</h2>
        <dl className={styles.playerTripProfileStats} aria-label="Player numbers">
          {header.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </div>
      <button type="button" className={styles.playerTripProfileClose} onClick={onClose} autoFocus aria-label="Close player profile"><X size={18} strokeWidth={2.25} aria-hidden /></button>
    </div>
    {/* No trip rounds yet: instead of round tabs / scorecard / snapshot, every draft stat. */}
    <dl className={room.draftProfileStats} aria-label={name + " draft stats"}>
      {stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </dialog>, document.body);
}
