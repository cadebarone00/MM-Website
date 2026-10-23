"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, Copy, Plus } from "lucide-react";
import { GolfRoundHeader, GolfTripLeaderboard } from "./GolfTripMatch";
import { GolfTripScoring } from "./GolfTripScoring";
import { AddRound } from "./CodeTournamentCreate";
import { cardFor, currentRound, formatCode, submitted, tournamentPreview, type CodeRoundSetup, type CodeTournament } from "@/lib/platform/codeTournaments";
import type { SheetCard } from "@/lib/platform/liveCards";
import type { ScoredCard } from "@/lib/platform/playerRounds";
import homeStyles from "./GolfTripHome.module.css";
import styles from "./CodeTournament.module.css";

/** How often the page checks for everyone else's scores. */
const POLL_MS = 5000;
const today = () => new Date().toLocaleDateString("en-CA");
type PostResult = { ok: boolean; message?: string };
const post = (id: string, body: object): Promise<PostResult> => fetch(`/api/code-tournaments/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => ({ ...(await r.json().catch(() => ({}))) as PostResult, ok: r.ok })).catch(() => ({ ok: false, message: "No connection. Try again when you're back online." }));

/**
 * A tournament joined by code (/tournaments/code/<id>), kept bare on purpose: the round header, the golf trip's
 * individual leaderboard, and (for players) the trip's scoring slide-up with its Scorecard view, strokes only. The
 * organizer also gets the join code, Add round and End tournament. Everyone's scores refresh every few seconds.
 */
export function CodeTournamentHome({ id, meId }: { id: string; meId: string }) {
  const [t, setT] = useState<CodeTournament | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const reply = await fetch(`/api/code-tournaments/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; tournament?: CodeTournament; code?: string }>).catch(() => null);
    if (reply?.ok && reply.tournament) { setT(reply.tournament); setProblem(null); return; }
    setProblem(reply === null ? "No connection. Scores will refresh when you're back online."
      : reply.code === "not_member" ? "You're not in this tournament. Join it with its code on Tourneys."
      : reply.code === "not_installed" ? "Tournaments aren't set up in the database yet (supabase/tournament_codes.sql)." : "Couldn't load the tournament. Trying again…");
  }, [id]);
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  if (!t) return <main className={homeStyles.page}>
    <Link href="/tournaments/join" className={styles.back}><ChevronLeft size={18} aria-hidden="true" /> Tourneys</Link>
    <p className={styles.status} role={problem ? "alert" : undefined}>{problem ?? "Loading the tournament…"}</p>
  </main>;

  const isOrganizer = t.organizer === meId;
  const playing = t.players.some((p) => p.profileId === meId);
  const live = t.status === "live";
  const scoringRound = currentRound(t, playing ? meId : null, today());
  const round = shown ?? scoringRound;
  const preview = tournamentPreview(t, round);
  const index = t.rounds.findIndex((r) => r.number === round);
  const scoring = t.rounds.find((r) => r.number === scoringRound)!;

  if (adding) return <AddRound minDate={t.rounds.at(-1)?.date} onCancel={() => setAdding(false)} onAdd={async (next) => {
    const result = await post(t.id, { action: "addRound", ...next });
    setAdding(false);
    if (!result.ok) setProblem(result.message ?? "Couldn't add the round. Try again.");
    await load();
  }} />;

  const copy = () => navigator.clipboard?.writeText(formatCode(t.code)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  async function end() {
    if (!window.confirm(`End ${t!.name} for everyone? Scores lock and it moves to Past Tournaments.`)) return;
    const result = await post(t!.id, { action: "end" });
    if (!result.ok) setProblem(result.message ?? "Couldn't end the tournament. Try again.");
    await load();
  }

  return <main className={`${homeStyles.page} ${playing && live ? homeStyles.pageWithScoring : ""}`}>
    <Link href="/tournaments/join" className={styles.back}><ChevronLeft size={18} aria-hidden="true" /> Tourneys</Link>
    <h1 className={styles.name}>{t.name}</h1>
    <p className={styles.sub}>{t.scoring} · {t.players.length} {t.players.length === 1 ? "player" : "players"}{live ? "" : " · Final"}</p>
    {isOrganizer && <div className={styles.organizer} role="group" aria-label="Organizer">
      <button type="button" className={styles.codeChip} onClick={copy} aria-label={`Join code ${formatCode(t.code)}, copy`}>
        <span>Code</span><b>{formatCode(t.code)}</b>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      </button>
      {live && t.rounds.length < 10 && <button type="button" className={styles.organizerButton} onClick={() => setAdding(true)}><Plus size={15} aria-hidden="true" /> Round</button>}
      {live && <button type="button" className={styles.organizerButton} onClick={end}>End</button>}
    </div>}
    {problem && <p className={styles.status} role="alert">{problem}</p>}
    <GolfRoundHeader match={preview} previousDisabled={index <= 0} nextDisabled={index >= t.rounds.length - 1}
      onPrevious={() => index > 0 && setShown(t.rounds[index - 1].number)} onNext={() => index < t.rounds.length - 1 && setShown(t.rounds[index + 1].number)} />
    {t.players.length ? <GolfTripLeaderboard key={`board-${round}`} match={preview} /> : <p className={styles.status}>No players yet. Send the code to your players so they can join.</p>}
    {playing && live && <TournamentScoring key={`scoring-${scoringRound}`} t={t} meId={meId} round={scoringRound} setup={scoring.setup} onProblem={setProblem} onSaved={load} />}
  </main>;
}

/** My scorecard for the round being played: every hole I enter goes to the tournament; Submit locks the card. */
function TournamentScoring({ t, meId, round, setup, onProblem, onSaved }: { t: CodeTournament; meId: string; round: number; setup: CodeRoundSetup; onProblem: (text: string | null) => void; onSaved: () => Promise<void> }) {
  const holes = setup.course.par.length;
  const mine = cardFor(t, meId, round);
  const locked = submitted(t, meId, round);
  // What the tournament has for me, hole by hole, plus what I've sent since (so a hole isn't sent twice).
  const sent = useRef<(number | null)[]>(mine);
  const [initialHoles] = useState(() => mine);
  const sending = useRef<Promise<unknown>>(Promise.resolve());
  const send = (hole: number, strokes: number | null) => {
    sent.current[hole] = strokes;
    sending.current = sending.current.then(() => post(t.id, { action: "strokes", round, hole: hole + 1, strokes })
      .then((result) => onProblem(result.ok ? null : result.message ?? "A score didn't save. It will try again when you change it.")));
  };
  const onCardChange = (card: SheetCard) => card.strokes.forEach((s, h) => { if (h < holes && s !== sent.current[h]) send(h, s); });
  async function onSubmit(card: ScoredCard) {
    card.strokes.forEach((s, h) => { if (h < holes && s && s !== sent.current[h]) send(h, s); });
    await sending.current;
    const result = await post(t.id, { action: "submit", round });
    if (result.ok) await onSaved();
    return result.ok ? { ok: true } : { ok: false, message: result.message ?? "Couldn't submit. Try again." };
  }
  const submittedCard: ScoredCard | undefined = locked ? { strokes: mine.map((s) => s ?? 0), putts: mine.map(() => null), fairways: mine.map(() => null), greens: mine.map(() => null), penalties: mine.map(() => ({ fairway: false, green: false })) } : undefined;
  return <GolfTripScoring solo stats={false} parIsReference holeRange={[0, holes]} par={setup.course.par} courseName={setup.course.name}
    initialHoles={initialHoles} submittedCard={submittedCard} onCardChange={onCardChange} onSubmit={onSubmit} />;
}
