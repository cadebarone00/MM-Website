"use client";
import { useState } from "react";
import type { SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import { tripScoringFromJson, type TripRoundScoring } from "@/lib/platform/tripScoring";
import { OrganizerScorecard } from "./OrganizerScorecard";
import styles from "./GolfTripSettingsPreview.module.css";
import tripStyles from "./GolfTripHome.module.css";

export function SavedTripScorecards({ trip }: { trip: SavedGolfTrip }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [scoring, setScoring] = useState<TripRoundScoring | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = async (round: number) => {
    setSelected(round); setPlayer(null); setScoring(null); setMessage("Loading scorecards…");
    try {
      const response = await fetch(`/api/golf-trips/${trip.trip.id}/scoring?round=${round}`, { cache: "no-store" });
      const body = await response.json();
      const result = response.ok ? tripScoringFromJson(body.scoring) : null;
      setScoring(result); setMessage(result?.entries.length ? "" : "No scores recorded for this round yet.");
    } catch { setMessage("Couldn't load scorecards. Try again."); }
  };
  if (selected !== null) {
    const golfer = scoring?.groups.flatMap(group => group.players).find(item => item.profileId === player);
    const holes = Array.from({ length: 18 }, (_, index) => {
      const entry = scoring?.entries.find(item => item.scoredProfileId === player && item.enteredByProfileId === player && item.hole === index + 1);
      return { strokes: entry?.strokes ?? null, putts: entry?.putts ?? null, fairway: entry?.fairway ?? null, green: entry?.green ?? null };
    });
    return <div><button type="button" onClick={() => player ? setPlayer(null) : setSelected(null)}>Back to {player ? "players" : "scorecards"}</button><h2>Round {selected}</h2>
      {message && <p role="status">{message}</p>}
      {/* The round's confirmed pars (golf_trip_round_pars.sql), else none: plain numbers, nothing guessed. */}
      {golfer ? <OrganizerScorecard name={golfer.displayName} par={scoring?.pars?.pars ?? []} holes={holes} editable={false} competition={trip.trip.includes_tournament === "yes"} onSave={() => {}} />
        : scoring?.groups.flatMap(group => group.players).map(item => <button type="button" key={item.profileId} className={styles.scheduleRoundCard} onClick={() => setPlayer(item.profileId)}>{item.displayName}{item.submittedAt ? " · Submitted" : ""}</button>)}
    </div>;
  }
  const dates = [...new Set(trip.rounds.map(round => round.playDate))];
  return <div className={`${tripStyles.events} ${styles.scorecardDays}`}>{dates.map((date, day) => <section key={date ?? day} className={tripStyles.infoSection}>
    <div className={styles.roundDayHeader}><h2>Day {day + 1}</h2><time>{date}</time></div>
    {trip.rounds.filter(round => round.playDate === date).map(round => <div key={round.roundNumber} className={styles.scheduleRoundCard}>
      <button type="button" className={styles.roundCardButton} onClick={() => void load(round.roundNumber)}><span className={tripStyles.eventInfo}><span className={tripStyles.eventHost}>Round {round.roundNumber}</span><span className={tripStyles.eventTitle}>{round.courseName || "Course TBD"}</span></span><span className={styles.roundCardState}>{date && date > new Date().toISOString().slice(0, 10) ? "Upcoming" : "Scorecards"}</span></button>
    </div>)}
  </section>)}</div>;
}
