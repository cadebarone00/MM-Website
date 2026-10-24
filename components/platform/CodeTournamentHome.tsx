"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Settings } from "lucide-react";
import { GolfTripLeaderboard } from "./GolfTripMatch";
import { CodeTournamentTeeSheet } from "./CodeTournamentTeeSheet";
import { GolfTripScoring } from "./GolfTripScoring";
import { cutSummary } from "./CodeTournamentCut";
import { CodeTournamentSettings } from "./CodeTournamentSettings";
import { applyChange, attestCard, attestPairs, cardFor, currentRound, cutFrom, cutLabel, cutStatus, submitted, tournamentDocUrl, tournamentPreview, type CodeRoundSetup, type CodeTournament, type TournamentChange, type TournamentDocKind } from "@/lib/platform/codeTournaments";
import type { SheetCard } from "@/lib/platform/liveCards";
import type { ScoredCard } from "@/lib/platform/playerRounds";
import homeStyles from "./GolfTripHome.module.css";
import styles from "./CodeTournament.module.css";

/** How often the page checks for everyone else's scores. */
const POLL_MS = 5000;
type Section = "Info" | "Leaderboard" | "Tee Sheet" | "Pin Sheet";
const today = () => new Date().toLocaleDateString("en-CA");
/** "2026-10-23" → "Fri, Oct 23". */
const roundDay = (date: string | undefined) => date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";
type PostResult = { ok: boolean; message?: string };
type Act = (body: TournamentChange) => Promise<PostResult>;
const post = (id: string, body: object): Promise<PostResult> => fetch(`/api/code-tournaments/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then(async (r) => ({ ...(await r.json().catch(() => ({}))) as PostResult, ok: r.ok })).catch(() => ({ ok: false, message: "No connection. Try again when you're back online." }));

/**
 * A tournament joined by code (/tournaments/code/<id>), kept bare on purpose: the round header, the golf trip's
 * individual leaderboard and tee sheet, and (for players) the trip's scoring slide-up with its Scorecard view, strokes only.
 * The organizer's settings wheel opens Tournament Settings (code, rounds, tee sheet, cut, public / private). Everyone's
 * scores refresh every few seconds.
 * `watchCode` / `publicView`: a spectator (no sign-in): the same header, leaderboard and tee sheet, nothing else; from a
 * watch code (/api/watch) or a public tournament (/tournaments/live/<id>, from the Tourneys search and live feed).
 * `sample` (app simulator only): a made-up tournament; changes stay on this page and nothing is sent.
 */
export function CodeTournamentHome({ id, meId, watchCode, publicView = false, sample }: { id: string; meId: string | null; watchCode?: string; publicView?: boolean; sample?: { tournament: CodeTournament; spectator: boolean } }) {
  const [t, setT] = useState<CodeTournament | null>(sample?.tournament ?? null);
  const spectating = Boolean(watchCode || publicView || sample?.spectator);
  const [problem, setProblem] = useState<string | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<Section>("Leaderboard");

  const load = useCallback(async () => {
    if (sample) return;
    const reply = await fetch(watchCode ? `/api/watch/${encodeURIComponent(watchCode)}` : publicView ? `/api/code-tournaments/public/${encodeURIComponent(id)}` : `/api/code-tournaments/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; tournament?: CodeTournament; code?: string }>).catch(() => null);
    if (reply?.ok && reply.tournament) { setT(reply.tournament); setProblem(null); return; }
    setProblem(reply === null ? "No connection. Scores will refresh when you're back online."
      : reply.code === "missing" ? "This event isn't available."
      : reply.code === "not_member" ? "You're not in this tournament. Join it with its code on Tourneys."
      : reply.code === "not_installed" ? "Tournaments aren't set up in the database yet (supabase/tournament_codes.sql)." : "Couldn't load the tournament. Trying again…");
  }, [id, watchCode, publicView, sample]);
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);

  const back = (!spectating || publicView) && <Link href="/tournaments/join" className={styles.back}><ChevronLeft size={18} aria-hidden="true" /> Tourneys</Link>;
  if (!t) return <main className={homeStyles.page}>
    {back}
    <p className={styles.status} role={problem ? "alert" : undefined}>{problem ?? "Loading the tournament…"}</p>
  </main>;

  const isOrganizer = !spectating && t.organizer === meId;
  const playing = !spectating && t.players.some((p) => p.profileId === meId);
  // Sample: apply the change here; otherwise send it to the tournament.
  const act: Act = async (body) => { if (!sample) return post(t.id, body); setT((current) => current && applyChange(current, meId ?? "", body)); return { ok: true }; };
  const live = t.status === "live";
  const scoringRound = currentRound(t, playing ? meId : null, today());
  const round = shown ?? scoringRound;
  const preview = tournamentPreview(t, round);
  const index = t.rounds.findIndex((r) => r.number === round);
  const scoring = t.rounds.find((r) => r.number === scoringRound)!;

  // Info PDF / Pin Sheet (Settings): uploaded or removed through the server; the sample keeps the picked file on this page.
  // A pin sheet belongs to one round (`round`); the Info PDF to the whole tournament.
  async function upload(kind: TournamentDocKind, file: File | null, round?: number): Promise<PostResult> {
    if (sample) {
      const value = file ? URL.createObjectURL(file) : null;
      setT((current) => current && (kind === "info" ? { ...current, infoPdf: value } : { ...current, rounds: current.rounds.map((r) => r.number === round ? { ...r, pinSheetPdf: value } : r) }));
      return { ok: true };
    }
    const form = new FormData();
    if (file) { form.set("kind", kind); if (round) form.set("round", String(round)); form.set("file", file); }
    const reply = await fetch(`/api/code-tournaments/${encodeURIComponent(t!.id)}/documents${file ? "" : `?kind=${kind}${round ? `&round=${round}` : ""}`}`, { method: file ? "POST" : "DELETE", body: file ? form : undefined })
      .then(async (r) => ({ ...(await r.json().catch(() => ({}))) as PostResult, ok: r.ok })).catch(() => ({ ok: false, message: "No connection. Try again when you're back online." }));
    if (reply.ok) await load();
    return reply;
  }

  // Tournament Settings: every change goes through the same `act`, then the page reloads the tournament.
  if (settingsOpen && isOrganizer) return <CodeTournamentSettings t={t} onClose={() => setSettingsOpen(false)} upload={upload}
    act={async (change) => { const result = await act(change); if (result.ok) await load(); return result; }} />;

  // Info (left of Leaderboard) shows once the organizer uploads it, and Pin Sheet (after Tee Sheet) once any round has
  // one (it shows the round being viewed). Info and Tee Sheet are for people in the tournament, not spectators.
  const member = !spectating;
  const pinSheet = t.rounds.find((r) => r.number === round)?.pinSheetPdf ?? null;
  const sections: Section[] = [...(member && t.infoPdf ? ["Info" as const] : []), "Leaderboard", ...(member ? ["Tee Sheet" as const] : []),
    ...(t.rounds.some((r) => r.pinSheetPdf) ? ["Pin Sheet" as const] : [])];
  const tab: Section = sections.includes(section) ? section : "Leaderboard";

  // The cut line on the leaderboard; past the cut round, those who missed it show CUT. Missing the cut ends my scoring.
  const cut = cutStatus(t);
  const cutLine = cut && { missed: new Set(t.players.filter((p) => cut.missed.has(p.profileId)).map((p) => p.name)), out: cut.final && round > cut.cut.after,
    label: `${cut.final ? "Cut" : "Projected cut"} · ${cut.cut.kind === "top" ? `Top ${cut.cut.value} & ties` : cutLabel(cut.cut.value)}` };
  const outOfScoring = cutFrom(t, meId, scoringRound);
  return <main className={`${homeStyles.page} ${playing && live && !outOfScoring ? homeStyles.pageWithScoring : ""}`}>
    {(back || isOrganizer) && <div className={styles.topBar}>{back || <span />}
      {isOrganizer && <button type="button" className={`${homeStyles.iconButton} ${styles.settingsButton}`} aria-label="Tournament settings" onClick={() => setSettingsOpen(true)}><Settings size={24} strokeWidth={1.75} aria-hidden /></button>}
    </div>}
    <h1 className={styles.name}>{t.name}</h1>
    {t.cut && <p className={styles.cutNote}>Cut: {cutSummary(t.cut)}</p>}
    {problem && <p className={styles.status} role="alert">{problem}</p>}
    {/* The round shown: Round N · Today (or its date), its course under it; arrows step through the rounds. */}
    <header className={styles.roundBar}>
      <button type="button" aria-label="Previous round" disabled={index <= 0} onClick={() => setShown(t.rounds[index - 1].number)}><ChevronLeft size={20} aria-hidden /></button>
      <div>
        <p>Round {round} · {t.rounds[index]?.date === today() ? "Today" : roundDay(t.rounds[index]?.date)}</p>
        <h2>{t.rounds[index]?.setup.course.name}</h2>
      </div>
      <button type="button" aria-label="Next round" disabled={index >= t.rounds.length - 1} onClick={() => setShown(t.rounds[index + 1].number)}><ChevronRight size={20} aria-hidden /></button>
    </header>
    <div className={`${homeStyles.tabs} ${homeStyles.sectionTabs} ${styles.tourneyTabs}`} role="tablist" aria-label="Tournament sections">
      {sections.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name}
        className={`${homeStyles.tab} ${tab === name ? homeStyles.tabActive : ""}`} onClick={() => setSection(name)}>{name}</button>)}
    </div>
    {tab === "Info" ? <DocView title="Info" url={tournamentDocUrl(t.infoPdf)} />
      : tab === "Pin Sheet" ? pinSheet ? <DocView key={round} title={`Round ${round} pin sheet`} url={tournamentDocUrl(pinSheet)} />
        : <p className={styles.status}>No pin sheet for Round {round} yet.</p>
      : !t.players.length ? <p className={styles.status}>No players yet.{isOrganizer ? " Send the code (Settings → Info) to your players so they can join." : ""}</p>
      : tab === "Tee Sheet" ? <CodeTournamentTeeSheet t={t} round={round} match={preview} />
      : <GolfTripLeaderboard key={`board-${round}`} match={preview} cut={cutLine || undefined} />}
    {playing && live && meId && outOfScoring && <p className={styles.status}>You missed the cut. Follow the rest of the tournament on the leaderboard.</p>}
    {playing && live && meId && !outOfScoring && <TournamentScoring key={`scoring-${scoringRound}`} t={t} act={act} meId={meId} round={scoringRound} setup={scoring.setup} sample={Boolean(sample)} onProblem={setProblem} onSaved={load} />}
  </main>;
}

/** The Info / Pin Sheet tab: the organizer's PDF on the page, and Open PDF (phones often show only its first page inline). */
function DocView({ title, url }: { title: string; url: string | null }) {
  if (!url) return <p className={styles.status}>This PDF isn&apos;t available right now.</p>;
  return <section className={styles.docView} aria-label={title}>
    <iframe src={url} title={title} className={styles.docFrame} />
    <a className={`${styles.organizerButton} ${styles.docOpen}`} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> Open PDF</a>
  </section>;
}

/** The scoring sheet compares all 18 holes, so a nine-hole card is padded with empty holes. */
const toEighteen = (card: (number | null)[]) => Array.from({ length: 18 }, (_, i) => card[i] ?? null);

/**
 * My scorecard for the round being played: every hole I enter goes to the tournament; Submit locks the card. Attesting
 * works like golf trips: the second column is the player I keep score for this round (from the tee sheet), and what I
 * enter there goes to the tournament too. My name turns green once my attester's entries match mine (red where they
 * don't), and Submit & Save waits for that; the column I keep is checked against that player's own card (never blocks
 * me). A single in their group has no attester and scores alone. `sample` (simulator): no real attester, so Submit opens.
 */
function TournamentScoring({ t, act, meId, round, setup, sample, onProblem, onSaved }: { t: CodeTournament; act: Act; meId: string; round: number; setup: CodeRoundSetup; sample: boolean; onProblem: (text: string | null) => void; onSaved: () => Promise<void> }) {
  const holes = setup.course.par.length;
  const mine = cardFor(t, meId, round);
  const locked = submitted(t, meId, round);
  const pairs = attestPairs(t, round);
  const attesteeId = pairs.attesteeOf(meId), attesterId = pairs.attesterOf(meId);
  const attestee = t.players.find((p) => p.profileId === attesteeId) ?? null;
  // What the tournament has for me (and for the player I keep), plus what I've sent since (so a hole isn't sent twice).
  const sent = useRef<(number | null)[]>(mine);
  const sentAttest = useRef<(number | null)[]>(attesteeId ? attestCard(t, meId, attesteeId, round) : []);
  const [start] = useState(() => ({ holes: mine, opponentHoles: attesteeId ? attestCard(t, meId, attesteeId, round) : [], putts: mine.map(() => null), fairways: mine.map(() => null), greens: mine.map(() => null), penalties: mine.map(() => ({ fairway: false, green: false })) }));
  const sending = useRef<Promise<unknown>>(Promise.resolve());
  const queue = (change: TournamentChange) => {
    sending.current = sending.current.then(() => act(change)
      .then((result) => onProblem(result.ok ? null : result.message ?? "A score didn't save. It will try again when you change it.")));
  };
  const send = (hole: number, strokes: number | null) => { sent.current[hole] = strokes; queue({ action: "strokes", round, hole: hole + 1, strokes }); };
  const onCardChange = (card: SheetCard) => card.strokes.forEach((s, h) => { if (h < holes && s !== sent.current[h]) send(h, s); });
  // My column for the player I keep: each hole I've entered (an untouched hole sends nothing).
  const onAttestChange = (strokes: (number | null)[], entered: boolean[]) => {
    if (!attesteeId) return;
    strokes.forEach((s, h) => {
      const value = entered[h] ? s : null;
      if (h >= holes || value === (sentAttest.current[h] ?? null)) return;
      sentAttest.current[h] = value;
      queue({ action: "attest", round, player: attesteeId, hole: h + 1, strokes: value });
    });
  };
  async function onSubmit(card: ScoredCard) {
    card.strokes.forEach((s, h) => { if (h < holes && s && s !== sent.current[h]) send(h, s); });
    await sending.current;
    const result = await act({ action: "submit", round });
    if (result.ok) await onSaved();
    return result.ok ? { ok: true } : { ok: false, message: result.message ?? "Couldn't submit. Try again." };
  }
  const submittedCard: ScoredCard | undefined = locked ? { strokes: mine.map((s) => s ?? 0), putts: mine.map(() => null), fairways: mine.map(() => null), greens: mine.map(() => null), penalties: mine.map(() => ({ fairway: false, green: false })) } : undefined;
  return <GolfTripScoring solo={!attestee} stats={false} gps={false} parIsReference holeRange={[0, holes]} par={setup.course.par} courseName={setup.course.name}
    playerName={t.players.find((p) => p.profileId === meId)?.name ?? "You"} attesteeName={attestee?.name} savedCard={start}
    submittedCard={submittedCard} onCardChange={onCardChange} onSubmit={onSubmit} onAttestChange={onAttestChange}
    attestedStrokes={attesterId ? toEighteen(attestCard(t, attesterId, meId, round)) : undefined} attesteeStrokes={attesteeId ? toEighteen(cardFor(t, attesteeId, round)) : undefined}
    opponentCardMatches={sample || !attesterId} />;
}
