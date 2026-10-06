"use client";

import { useState } from "react";
import { Calendar, ChevronLeft, MapPin, Plus, Trash2, Trophy } from "lucide-react";
import {
  addPastPlayer, addPastRound, addPastTrip, pastChampion, pastLeaderboard, removePastPlayer, removePastRound, setPastScore, sortPastTrips,
  type PastCourse, type PastTrip,
} from "@/lib/platform/golfTripHistory";
import { TripScheduleCoursePicker } from "./TripScheduleCoursePicker";
import tripStyles from "./GolfTripHome.module.css";
import settingsStyles from "./GolfTripSettingsPreview.module.css";
import styles from "./GolfTripHistory.module.css";

type Tab = "Leaderboard" | "Rounds" | "Players";

/** Players → Link to account: the screen asks; whoever owns the accounts (dev store now, server later) does the linking. */
export interface HistoryLinking {
  accounts: { id: string; name: string }[];
  statusFor: (trip: PastTrip, playerName: string) => { status: "pending" | "accepted"; accountName: string } | null;
  /** Returns an error message to show, or null when the request was sent. */
  request: (trip: PastTrip, playerName: string, profileId: string) => string | null;
}
const TABS: Tab[] = ["Leaderboard", "Rounds", "Players"];
const toParLabel = (value: number | null) => value === null ? "—" : value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
const shortDate = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const tripDates = (trip: PastTrip) => trip.arrival === trip.departure ? shortDate(trip.arrival) : `${shortDate(trip.arrival)} – ${shortDate(trip.departure)}`;
const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/**
 * Organizer settings → History: past trips the organizer enters (rounds, scores) → each trip's leaderboard and champion.
 * Dev preview: the parent keeps the trips in page memory. Courses come from the course search (API ref) or are typed.
 */
export function GolfTripHistory({ trips, onChange, tripPlayers, linking }: { trips: PastTrip[]; onChange: (trips: PastTrip[]) => void; tripPlayers: string[]; linking?: HistoryLinking }) {
  const [adding, setAdding] = useState(false);
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const openTrip = trips.find((trip) => trip.id === openTripId);
  const deleting = trips.find((trip) => trip.id === confirmDelete);
  const updateTrip = (next: PastTrip) => onChange(trips.map((trip) => trip.id === next.id ? next : trip));

  if (adding) return <AddPastTrip tripPlayers={tripPlayers} onCancel={() => setAdding(false)}
    onSave={(input) => { const next = addPastTrip(trips, input); onChange(next); setAdding(false); setOpenTripId(next[next.length - 1].id); }} />;
  if (openTrip) return <PastTripView trip={openTrip} onChange={updateTrip} onBack={() => setOpenTripId(null)} linking={linking} />;

  return <div className={styles.root}>
    <p className={styles.intro}>Add trips you&apos;ve already played. Tap a trip to add its rounds, scores and champion.</p>
    <section className={tripStyles.infoSection} aria-label="Past trips">
      <h2 className={tripStyles.eventsHeading}>Past Trips</h2>
      {trips.length === 0 && <p className={styles.empty}>No past trips yet.</p>}
      {trips.length > 0 && <div>{sortPastTrips(trips).map((trip) => <div key={trip.id} className={styles.tripRow}>
        {/* Arrival over departure, then the trip name with its location under it. Tap to open the trip's history page. */}
        <button type="button" className={styles.tripOpen} aria-label={`${trip.name}, ${tripDates(trip)}${trip.place ? `, ${trip.place}` : ""}`} onClick={() => setOpenTripId(trip.id)}>
          <span className={styles.tripDates} aria-hidden>
            <time dateTime={trip.arrival}>{shortDate(trip.arrival)}</time>
            <time dateTime={trip.departure}>{shortDate(trip.departure)}</time>
          </span>
          <span className={styles.tripText} aria-hidden>
            <strong>{trip.name}</strong>
            <span>{trip.place || "Location not set"}</span>
          </span>
        </button>
        <button type="button" className={styles.iconButton} aria-label={`Delete ${trip.name}`} onClick={() => setConfirmDelete(trip.id)}><Trash2 size={16} aria-hidden /></button>
      </div>)}</div>}
      <button type="button" className={styles.add} onClick={() => setAdding(true)}><Plus size={18} aria-hidden />Add past trip</button>
    </section>
    {deleting && <DeletePastTrip tripName={deleting.name} onCancel={() => setConfirmDelete(null)}
      onDelete={() => { onChange(trips.filter((trip) => trip.id !== deleting.id)); setConfirmDelete(null); }} />}
  </div>;
}

function ConfirmDelete({ label, onCancel, onDelete }: { label: string; onCancel: () => void; onDelete: () => void }) {
  return <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label={label}>
    <div className={tripStyles.deleteDialog}>
      <p className={tripStyles.deletePrompt}>Are you sure?</p>
      <button type="button" className={tripStyles.cancelButton} onClick={onCancel}>Keep editing</button>
      <button type="button" className={tripStyles.deleteButton} onClick={onDelete}>Delete</button>
    </div>
  </div>;
}

/**
 * Deleting a past trip wipes all of its history (rounds, scores, players, champion), so it takes two steps:
 * 1) Are you sure? → Go Back / Delete. 2) Type the trip's name → the red Delete button unlocks only on an exact match.
 */
function DeletePastTrip({ tripName, onCancel, onDelete }: { tripName: string; onCancel: () => void; onDelete: () => void }) {
  const [step, setStep] = useState<"confirm" | "type">("confirm");
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === tripName.trim();
  return <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label={`Delete ${tripName}`}>
    {step === "confirm" ? <div className={tripStyles.deleteDialog}>
      <p className={tripStyles.deletePrompt}>Are you sure?</p>
      <p className={styles.deleteNote}>All unsaved history will be lost.</p>
      <button type="button" className={tripStyles.cancelButton} onClick={onCancel}>Go Back</button>
      <button type="button" className={tripStyles.deleteButton} onClick={() => setStep("type")}>Delete</button>
    </div>
    : <form className={tripStyles.deleteDialog} onSubmit={(event) => { event.preventDefault(); if (matches) onDelete(); }}>
      <label className={styles.deleteNote} htmlFor="delete-past-trip-name">Type <strong>{tripName}</strong> to delete</label>
      <input id="delete-past-trip-name" className={styles.input} value={typed} autoFocus autoComplete="off" spellCheck={false}
        placeholder={tripName} onChange={(event) => setTyped(event.target.value)} />
      <button type="submit" className={tripStyles.deleteButton} disabled={!matches}>Delete</button>
      <button type="button" className={tripStyles.cancelButton} onClick={onCancel}>Go Back</button>
    </form>}
  </div>;
}

/** New past trip: name, arrival / departure dates, place, and who played (starts from this trip's players; edit later in Players). */
function AddPastTrip({ tripPlayers, onCancel, onSave }: {
  tripPlayers: string[]; onCancel: () => void; onSave: (input: { arrival: string; departure: string; name: string; place: string; players: string[] }) => void;
}) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [useTripPlayers, setUseTripPlayers] = useState(tripPlayers.length > 0);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    try { onSave({ arrival, departure, name, place, players: useTripPlayers ? tripPlayers : [] }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Check the details."); }
  };
  return <div className={styles.root}>
    <button type="button" className={styles.back} onClick={onCancel}><ChevronLeft size={18} aria-hidden />All past trips</button>
    <h2 className={tripStyles.eventsHeading}>Add past trip</h2>
    <label className={styles.field}>Trip name<input className={styles.input} value={name} maxLength={100} placeholder="e.g. Desert Classic" onChange={(event) => setName(event.target.value)} /></label>
    <div className={styles.dateFields}>
      <label className={styles.field}>Arrival<input type="date" className={styles.input} value={arrival} max={today}
        onChange={(event) => { setArrival(event.target.value); if (!departure || departure < event.target.value) setDeparture(event.target.value); }} /></label>
      <label className={styles.field}>Departure<input type="date" className={styles.input} value={departure} min={arrival || undefined} onChange={(event) => setDeparture(event.target.value)} /></label>
    </div>
    <label className={styles.field}>Where<input className={styles.input} value={place} maxLength={100} placeholder="City, state" onChange={(event) => setPlace(event.target.value)} /></label>
    {tripPlayers.length > 0 && <div className={styles.field}>Players
      <div className={styles.pickRow}>
        <button type="button" className={styles.pick} aria-pressed={useTripPlayers} onClick={() => setUseTripPlayers(true)}>This trip&apos;s {tripPlayers.length} players</button>
        <button type="button" className={styles.pick} aria-pressed={!useTripPlayers} onClick={() => setUseTripPlayers(false)}>Add them myself</button>
      </div>
    </div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button type="button" className={styles.primary} disabled={!name.trim() || !arrival || !departure} onClick={save}>Add trip</button>
  </div>;
}

/** One past trip: Leaderboard (built from the scores, champion pick) / Rounds (course + scores) / Players. */
function PastTripView({ trip, onChange, onBack, linking }: { trip: PastTrip; onChange: (trip: PastTrip) => void; onBack: () => void; linking?: HistoryLinking }) {
  const [tab, setTab] = useState<Tab>("Leaderboard");
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);
  const openRound = trip.rounds.find((round) => round.id === openRoundId);
  if (openRound) return <PastRoundScores trip={trip} roundId={openRound.id} onChange={onChange} onBack={() => setOpenRoundId(null)} />;

  return <div className={styles.root}>
    <button type="button" className={styles.back} onClick={onBack}><ChevronLeft size={18} aria-hidden />All past trips</button>
    <div>
      <h2 className={tripStyles.eventsHeading}>{trip.name}</h2>
      <p className={tripStyles.eventMeta}><Calendar size={14} aria-hidden />{tripDates(trip)}</p>
      {trip.place && <p className={tripStyles.eventMeta}><MapPin size={14} aria-hidden />{trip.place}</p>}
    </div>
    <div className={`${tripStyles.tabs} ${settingsStyles.tabs}`} aria-label="Past trip sections">
      {TABS.map((name) => <button key={name} type="button" aria-pressed={tab === name}
        className={`${tripStyles.tab} ${tab === name ? tripStyles.tabActive : ""} ${settingsStyles.tab}`} onClick={() => setTab(name)}>{name}</button>)}
    </div>
    {tab === "Leaderboard" && <PastLeaderboardTab trip={trip} onChange={onChange} />}
    {tab === "Rounds" && <PastRoundsTab trip={trip} onChange={onChange} onOpen={setOpenRoundId} />}
    {tab === "Players" && <PastPlayersTab trip={trip} onChange={onChange} linking={linking} />}
  </div>;
}

function PastLeaderboardTab({ trip, onChange }: { trip: PastTrip; onChange: (trip: PastTrip) => void }) {
  const rows = pastLeaderboard(trip);
  const champion = pastChampion(trip);
  return <section className={tripStyles.infoSection} aria-label="Leaderboard">
    {rows.length === 0 ? <p className={styles.empty}>Add rounds and scores to build the leaderboard.</p>
      : <table className={styles.board}>
        <thead><tr><th className={styles.place}>Pos</th><th>Player</th><th className={styles.num}>Total</th><th className={styles.num}>To par</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.player}>
          <td className={styles.place}>{row.place}</td>
          <td>{row.player}{row.player === champion && <Trophy size={14} className={styles.trophy} aria-label=" (champion)" style={{ marginLeft: 6, verticalAlign: -2 }} />}
            {row.roundsPlayed < trip.rounds.length && <span className={styles.note}> · {row.roundsPlayed} of {trip.rounds.length} rounds</span>}</td>
          <td className={styles.num}>{row.total}</td>
          <td className={styles.num}>{toParLabel(row.toPar)}</td>
        </tr>)}</tbody>
      </table>}
    {trip.players.length > 0 && <div className={styles.field}>Champion
      <div className={styles.pickRow}>
        <button type="button" className={styles.pick} aria-pressed={trip.championOverride === null} onClick={() => onChange({ ...trip, championOverride: null })}>From leaderboard</button>
        {trip.players.map((player) => <button key={player} type="button" className={styles.pick} aria-pressed={trip.championOverride === player}
          onClick={() => onChange({ ...trip, championOverride: player })}>{player}</button>)}
      </div>
      <p className={styles.note}>{trip.championOverride ? "You picked the champion." : champion ? "Lowest total wins." : "Tied or not scored yet — pick the champion if you know it."}</p>
    </div>}
  </section>;
}

function PastRoundsTab({ trip, onChange, onOpen }: { trip: PastTrip; onChange: (trip: PastTrip) => void; onOpen: (roundId: string) => void }) {
  const [adding, setAdding] = useState<"choose" | "search" | "type" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const add = (course: PastCourse) => { const next = addPastRound(trip, course); onChange(next); setAdding(null); onOpen(next.rounds[next.rounds.length - 1].id); };
  const label = `Round ${trip.rounds.length + 1}`;
  return <section className={tripStyles.infoSection} aria-label="Rounds">
    {trip.rounds.length === 0 && <p className={styles.empty}>No rounds yet.</p>}
    {trip.rounds.map((round) => <div key={round.id} className={settingsStyles.roundRow}>
      <button type="button" className={`${tripStyles.infoEntry} ${settingsStyles.roundEntry}`} onClick={() => onOpen(round.id)}>
        <span className={tripStyles.eventInfo}>
          <span className={tripStyles.eventHost}>Round {round.number}</span>
          <span className={tripStyles.eventTitle}>{round.course.name}</span>
          <span className={tripStyles.eventMeta}>
            {round.date && <><Calendar size={14} aria-hidden /><time dateTime={round.date}>{dateLabel(round.date)}</time> ·</>}
            {round.course.par !== null && <span>Par {round.course.par} ·</span>}
            <span>{Object.keys(round.scores).length} of {trip.players.length} scores</span>
          </span>
        </span>
      </button>
      <button type="button" className={`${tripStyles.entryDelete} ${settingsStyles.roundDelete}`} aria-label={`Delete Round ${round.number}`} onClick={() => setConfirmDelete(round.id)}><Trash2 size={16} aria-hidden /></button>
    </div>)}
    {adding === null && <button type="button" className={styles.add} onClick={() => setAdding("choose")}><Plus size={18} aria-hidden />Add round</button>}
    {adding === "choose" && <div className={styles.root} style={{ gap: 10 }}>
      <button type="button" className={styles.primary} onClick={() => setAdding("search")}>Search courses</button>
      <button type="button" className={styles.secondary} onClick={() => setAdding("type")}>Type the course name</button>
      <button type="button" className={styles.back} onClick={() => setAdding(null)}>Cancel</button>
    </div>}
    {adding === "type" && <TypedCourse onCancel={() => setAdding(null)} onSave={add} />}
    {adding === "search" && <TripScheduleCoursePicker roundLabel={label} askSettings={false} onClose={() => setAdding(null)}
      onPick={(course) => add({ ref: course.ref, name: course.name, place: course.place, par: course.par })} />}
    {confirmDelete && <ConfirmDelete label="Delete round confirmation" onCancel={() => setConfirmDelete(null)}
      onDelete={() => { onChange(removePastRound(trip, confirmDelete)); setConfirmDelete(null); }} />}
  </section>;
}

/** For a course the search can't find (closed, renamed, abroad): just a name and par. */
function TypedCourse({ onCancel, onSave }: { onCancel: () => void; onSave: (course: PastCourse) => void }) {
  const [name, setName] = useState("");
  const [par, setPar] = useState("72");
  const parValue = par ? Number(par) : null;
  const parOk = parValue === null || (parValue >= 27 && parValue <= 80);
  return <div className={styles.root} style={{ gap: 12 }}>
    <div className={styles.fields}>
      <label className={styles.field}>Par<input className={styles.input} inputMode="numeric" maxLength={2} value={par} onChange={(event) => setPar(event.target.value.replace(/\D/g, ""))} /></label>
      <label className={styles.field}>Course name<input className={styles.input} value={name} maxLength={100} autoFocus onChange={(event) => setName(event.target.value)} /></label>
    </div>
    {!parOk && <p className={styles.error} role="alert">Par should be between 27 and 80.</p>}
    <button type="button" className={styles.primary} disabled={!name.trim() || !parOk} onClick={() => onSave({ ref: null, name: name.trim(), place: "", par: parValue })}>Add round</button>
    <button type="button" className={styles.back} onClick={onCancel}>Cancel</button>
  </div>;
}

/** One past round: date + each player's total. A score saves as soon as it's a real number (18–200). */
function PastRoundScores({ trip, roundId, onChange, onBack }: { trip: PastTrip; roundId: string; onChange: (trip: PastTrip) => void; onBack: () => void }) {
  const round = trip.rounds.find((item) => item.id === roundId)!;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const typed = (player: string) => drafts[player] ?? (round.scores[player] !== undefined ? String(round.scores[player]) : "");
  const type = (player: string, text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, 3);
    setDrafts((current) => ({ ...current, [player]: clean }));
    const score = clean ? Number(clean) : null;
    if (score === null || (score >= 18 && score <= 200)) onChange(setPastScore(trip, round.id, player, score));
  };
  const invalid = trip.players.filter((player) => { const text = typed(player); return text.length >= 2 && (Number(text) < 18 || Number(text) > 200); });
  return <div className={styles.root}>
    <button type="button" className={styles.back} onClick={onBack}><ChevronLeft size={18} aria-hidden />{trip.name}</button>
    <div>
      <h2 className={tripStyles.eventsHeading}>Round {round.number} · {round.course.name}</h2>
      <p className={tripStyles.eventMeta}>{[round.course.place, round.course.par !== null ? `Par ${round.course.par}` : null].filter(Boolean).join(" · ") || "Course details not set"}</p>
    </div>
    <label className={styles.field}>Date played
      <input type="date" className={styles.input} value={round.date ?? ""} min={trip.arrival} max={trip.departure}
        onChange={(event) => onChange({ ...trip, rounds: trip.rounds.map((item) => item.id === round.id ? { ...item, date: event.target.value || null } : item) })} />
    </label>
    <section aria-label="Scores">
      <h3 className={styles.field} style={{ margin: "0 0 6px" }}>Total score</h3>
      {trip.players.length === 0 && <p className={styles.empty}>Add players first (Players tab).</p>}
      {trip.players.map((player) => <label key={player} className={styles.scoreRow}>
        <span>{player}</span>
        <input className={styles.input} inputMode="numeric" placeholder="—" value={typed(player)} aria-label={`${player}'s total`}
          onChange={(event) => type(player, event.target.value)} onBlur={() => setDrafts((current) => { const next = { ...current }; delete next[player]; return next; })} />
      </label>)}
    </section>
    {invalid.length > 0 && <p className={styles.error} role="alert">A round total should be between 18 and 200 ({invalid.join(", ")}).</p>}
    <p className={styles.note}>Total strokes for the round. Hole-by-hole scorecards come next.</p>
  </div>;
}

function PastPlayersTab({ trip, onChange, linking }: { trip: PastTrip; onChange: (trip: PastTrip) => void; linking?: HistoryLinking }) {
  const [name, setName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [linkingName, setLinkingName] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const add = () => { if (!name.trim()) return; onChange(addPastPlayer(trip, name)); setName(""); };
  return <section className={tripStyles.infoSection} aria-label="Players">
    {trip.players.length === 0 && <p className={styles.empty}>No players yet.</p>}
    <div>{trip.players.map((player) => {
      const link = linking?.statusFor(trip, player) ?? null;
      return <div key={player}>
        <div className={styles.playerRow}>
          <span>{player}{link && <span className={styles.linkStatus}>{link.status === "accepted" ? `Linked to ${link.accountName}` : `Waiting for ${link.accountName}`}</span>}</span>
          <span className={styles.rowActions}>
            {linking && !link && <button type="button" className={styles.pick} onClick={() => { setLinkError(null); setLinkingName(linkingName === player ? null : player); }}>Link to account</button>}
            <button type="button" className={styles.iconButton} aria-label={`Remove ${player}`} onClick={() => setConfirmRemove(player)}><Trash2 size={18} aria-hidden /></button>
          </span>
        </div>
        {linking && linkingName === player && <div className={styles.pickRow} role="group" aria-label={`Link ${player} to an account`}>
          {linking.accounts.map((account) => <button key={account.id} type="button" className={styles.pick}
            onClick={() => { const error = linking.request(trip, player, account.id); setLinkError(error); if (!error) setLinkingName(null); }}>{account.name}</button>)}
        </div>}
      </div>;
    })}</div>
    {linkError && <p className={styles.error} role="alert">{linkError}</p>}
    {linking && <p className={styles.note}>Linking sends that player a request. Their past rounds reach their profile only after they accept, and don&apos;t count toward handicap.</p>}
    <form className={styles.addRow} onSubmit={(event) => { event.preventDefault(); add(); }}>
      <input className={styles.input} value={name} maxLength={60} placeholder="Player name" aria-label="New player name" onChange={(event) => setName(event.target.value)} />
      <button type="submit" className={styles.primary} disabled={!name.trim()}>Add</button>
    </form>
    {confirmRemove && <ConfirmDelete label="Remove player confirmation" onCancel={() => setConfirmRemove(null)}
      onDelete={() => { onChange(removePastPlayer(trip, confirmRemove)); setConfirmRemove(null); }} />}
  </section>;
}
