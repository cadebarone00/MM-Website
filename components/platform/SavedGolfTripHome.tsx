"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { GolfTripHome } from "./GolfTripHome";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SheetCard } from "@/lib/platform/liveCards";
import { queueStatus, type QueuedOp } from "@/lib/platform/scoringQueue";
import { idbQueueStorage } from "@/lib/platform/scoringQueueIdb";
import { createScoringSync, memoryQueueStorage, type SendBatch } from "@/lib/platform/scoringSync";
import { correctionView, correctionsFromJson, openCorrectionHoles, type TripCorrections } from "@/lib/platform/tripCorrections";
import { cardVersion, submissionCheck, submitBodyFrom, submitRefusal, submitResultFromJson } from "@/lib/platform/tripSubmission";
import type { ScoredCard } from "@/lib/platform/playerRounds";
import { cardFromEntries, changedEntries, latestGate, mergeSent, myScoringSeat, opResultsFromJson, scoresVerified, type HoleEntryInput, type TripRoundScoring } from "@/lib/platform/tripScoring";

/** How long after the last tap queued changes are sent (one request for a burst of taps). */
const SYNC_DELAY_MS = 600;
/** Fallback reload while the round is open (also how scores stay current where Realtime isn't configured). */
const POLL_MS = 10_000;
/** Realtime needs the public Supabase keys in the browser; without them the page reloads on the poll instead. */
const REALTIME = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type Seat = NonNullable<ReturnType<typeof myScoringSeat>>;
const show = (e?: HoleEntryInput) => e?.strokes == null ? "—" : String(e.strokes);

/**
 * A saved trip's Golf Trip Home with real scoring (Player & Attest Steps 2–4).
 *
 * Every change is queued first (scoringSync + IndexedDB, scoped to the signed-in golfer, trip and round) and survives
 * closing the app or losing signal; the queue sends itself when the connection is back. Each queued op has a stable id
 * and the server version it was based on, so retries apply once and an older offline edit can't overwrite a newer
 * saved score (the server answers "conflict"; the golfer's entry stays until they choose). My own card and my attest
 * column are separate queue entries. Live sync (Step 3) is unchanged: Realtime / tab return / reconnect / poll reload
 * the round, newest answer wins. Verified (green / red, Submit) only while nothing is pending or in conflict and the
 * connection is live. The sheet looks as before, plus one status line and conflict rows on the Card.
 */
export function SavedGolfTripHome({ scoring, ...home }: ComponentProps<typeof GolfTripHome> & { scoring?: { tripId: string; profileId: string; scoring: TripRoundScoring; corrections?: TripCorrections | null } }) {
  const [live, setLive] = useState(scoring?.scoring ?? null);
  // Step 6: correction requests + submission history (null until golf_trip_scoring_corrections.sql is installed).
  const [corrections, setCorrections] = useState(scoring?.corrections ?? null);
  const seat = live && scoring ? myScoringSeat(live, scoring.profileId) : null;
  const seatRef = useRef(seat);
  useEffect(() => { seatRef.current = seat; });
  const [connected, setConnected] = useState(true);
  const [ops, setOps] = useState<QueuedOp[] | null>(null); // null until the stored queue is loaded
  const [startCard, setStartCard] = useState<ReturnType<typeof cardFromEntries> | null>(null);
  const [reset, setReset] = useState<{ token: number; card: ReturnType<typeof cardFromEntries> } | undefined>(undefined);
  // The latest values I've entered (saved + queued), so only real changes are queued.
  const known = useRef<{ own: HoleEntryInput[]; attest: HoleEntryInput[] }>({ own: [], attest: [] });
  const gate = useRef(latestGate());
  const timer = useRef<number | undefined>(undefined);
  const engine = useRef<ReturnType<typeof createScoringSync> | null>(null);
  const [locked, setLocked] = useState<{ key: string | null; card: ScoredCard | undefined }>({ key: null, card: undefined });

  async function request(init?: RequestInit) {
    const n = gate.current.begin();
    const response = await fetch(`/api/golf-trips/${scoring?.tripId}/scoring${init ? "" : `?round=${live?.roundNumber}`}`, { cache: "no-store", ...init });
    return { n, response, body: await response.json().catch(() => ({})) as Record<string, unknown> };
  }

  // Put the server's saved values back on the card (plus my changes still waiting to send), dropping `refused` ops.
  function snapBack(server: TripRoundScoring, refused: string[]) {
    const current = scoring ? myScoringSeat(server, scoring.profileId) : null, run = engine.current;
    if (!current || !run) return;
    const waiting = (kind: "own" | "attest") => run.ops().filter((o) => o.kind === kind && o.status !== "rejected" && !refused.includes(o.opId)).map((o) => o.entry);
    known.current = { own: mergeSent(current.sentOwn, waiting("own")), attest: mergeSent(current.sentAttest, waiting("attest")) };
    setReset((r) => ({ token: (r?.token ?? 0) + 1, card: cardFromEntries(known.current.own, known.current.attest) }));
  }

  // The network side of the queue: one POST per (group, golfer scored). Who queued it must still be who's signed in.
  const send: SendBatch = async (batch) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, reason: "offline" };
    try {
      const { n, response, body } = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        groupId: batch.groupId, scoredProfileId: batch.scoredProfileId, expectedProfileId: scoring?.profileId,
        ops: batch.ops.map((o) => ({ opId: o.opId, baseVersion: o.baseVersion, supersedes: o.supersedes, clientUpdatedAt: o.clientUpdatedAt, entry: o.entry,
          ...(o.correctionRequestId ? { correctionRequestId: o.correctionRequestId } : {}) })) }) });
      if (response.status === 401) return { ok: false, reason: "signed-out" };
      if (response.status === 409 && body.reason === "wrong-account") return { ok: false, reason: "wrong-account" };
      if (response.status === 403 && body.reason === "locked") return { ok: false, reason: "locked" };
      const answer = response.ok && body.ok ? opResultsFromJson(body) : null;
      if (!answer) return { ok: false, reason: "error" };
      if (answer.scoring && gate.current.accept(n)) setLive(answer.scoring);
      // Step 6: a change the server refused (a locked hole, or not a fresh attestation) never stays on screen as if saved.
      const refused = answer.results.filter((r) => r.status === "locked").map((r) => r.opId);
      if (refused.length && answer.scoring) snapBack(answer.scoring, refused);
      return { ok: true, results: answer.results, scoring: null };
    } catch {
      return { ok: false, reason: "offline" };
    }
  };
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });

  async function refreshCorrections(): Promise<TripCorrections | null> {
    if (!scoring || !live) return null;
    try {
      const response = await fetch(`/api/golf-trips/${scoring.tripId}/scoring/corrections?round=${live.roundNumber}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      const parsed = response.ok && body.ok ? correctionsFromJson(body.corrections) : null;
      if (parsed) setCorrections(parsed);
      return parsed;
    } catch { return null; /* offline: keep what's on screen */ }
  }

  // Step 6: the approved corrections on screen (mine, or the golfer I attest). A new one reopened holes and cleared the
  // old attestation, so the card is rebuilt from the server once both have reloaded.
  const approvedKey = (c: TripCorrections | null) => (c?.requests ?? []).filter((r) => r.status === "approved").map((r) => r.id).sort().join(",");
  const shownApprovals = useRef(approvedKey(scoring?.corrections ?? null));

  async function refresh() {
    const corrected = refreshCorrections();
    try {
      const { n, response, body } = await request();
      if (!response.ok || !body.ok || !body.scoring) throw new Error(String(body.error ?? `HTTP ${response.status}`));
      if (gate.current.accept(n)) setLive(body.scoring as TripRoundScoring);
      const latest = await corrected;
      if (latest && approvedKey(latest) !== shownApprovals.current) {
        shownApprovals.current = approvedKey(latest);
        snapBack(body.scoring as TripRoundScoring, []);
      }
      if (!REALTIME) setConnected(true);
    } catch (error) {
      setConnected(false);
      console.error("Loading scores failed:", error);
    }
  }
  const syncSoon = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void engine.current?.sync(), SYNC_DELAY_MS); };
  // After a reconnect: send what's queued, then reload both score sources (mine and my attester's) and re-verify.
  const catchUp = async () => { await engine.current?.sync(); await refresh(); };
  const sync = useRef({ catchUp, refresh });
  useEffect(() => { sync.current = { catchUp, refresh }; });

  // Load this golfer's stored queue for this trip round (never anyone else's), then put saved + queued on the card.
  const profileId = scoring?.profileId, tripId = scoring?.tripId, roundNumber = live?.roundNumber;
  useEffect(() => {
    if (!profileId || !tripId || !roundNumber) return;
    const created = createScoringSync({
      storage: idbQueueStorage() ?? memoryQueueStorage(), send: (b) => sendRef.current(b),
      scope: { profileId, tripId, roundNumber }, newId: () => crypto.randomUUID(), now: () => new Date().toISOString(),
      onChange: () => setOps([...created.ops()]),
    });
    engine.current = created;
    void created.load().then(() => {
      const current = seatRef.current;
      if (!current) return;
      const queued = (kind: "own" | "attest") => created.ops().filter((o) => o.kind === kind).map((o) => o.entry);
      known.current = { own: mergeSent(current.sentOwn, queued("own")), attest: mergeSent(current.sentAttest, queued("attest")) };
      setStartCard(cardFromEntries(known.current.own, known.current.attest));
      void sync.current.catchUp();
    });
    return () => { if (engine.current === created) engine.current = null; };
  }, [profileId, tripId, roundNumber]);

  // Live sync (Step 3): one subscription per group, removed on unmount / group change; plus tab return, reconnect, poll.
  const groupId = seat?.groupId;
  useEffect(() => {
    if (!scoring || !groupId) return;
    let reloadTimer: number | undefined;
    const reload = () => { window.clearTimeout(reloadTimer); reloadTimer = window.setTimeout(() => void sync.current.refresh(), 250); };
    const supabase = REALTIME ? createSupabaseBrowserClient() : null;
    const channel = supabase?.channel(`trip-scoring-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hole_score_entries", filter: `group_id=eq.${groupId}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "scoring_group_players", filter: `group_id=eq.${groupId}` }, reload)
      // Correction requests and decisions anywhere on this trip (the organizer decides for every group).
      .on("postgres_changes", { event: "*", schema: "public", table: "scorecard_correction_requests", filter: `golf_trip_id=eq.${scoring.tripId}` }, reload)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") { setConnected(true); void sync.current.catchUp(); }
        else setConnected(false); // not live, so nothing counts as verified
      });
    const visible = () => { if (document.visibilityState === "visible") void sync.current.catchUp(); };
    const online = () => void sync.current.catchUp();
    const offline = () => setConnected(false);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const poll = window.setInterval(visible, POLL_MS);
    return () => {
      window.clearTimeout(reloadTimer);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [scoring, groupId]);

  // Queue the holes that changed (my own card and my attest column separately), based on the server version I last saw.
  function queue(kind: "own" | "attest", holes: (number | null)[], sheet?: SheetCard) {
    const current = seatRef.current, run = engine.current;
    if (!scoring || !current || !run || !live) return;
    const scoredProfileId = kind === "own" ? scoring.profileId : current.attesteeId;
    if (!scoredProfileId) return;
    const changes = kind === "own" && sheet
      ? changedEntries({ holes, putts: sheet.putts, fairways: sheet.fairways, greens: sheet.greens, penalties: sheet.penalties }, true, known.current.own)
      : changedEntries({ holes }, false, known.current.attest);
    if (!changes.length) return;
    known.current[kind] = mergeSent(known.current[kind], changes);
    const version = (hole: number) => live.entries.find((e) => e.scoredProfileId === scoredProfileId && e.enteredByProfileId === scoring.profileId && e.hole === hole)?.version ?? 0;
    // Step 6: re-attesting a reopened golfer. Only an entry made now, for their approved correction, carries its id.
    const open = openCorrectionHoles(corrections, scoring.profileId, current.attesteeId);
    const madeFor = (hole: number) => kind === "attest" && open.attestRequestId && open.attest?.includes(hole) ? { correctionRequestId: open.attestRequestId } : {};
    void (async () => {
      for (const entry of changes) await run.edit({ profileId: scoring.profileId, tripId: scoring.tripId, roundNumber: live.roundNumber, groupId: current.groupId, scoredProfileId, kind, entry, ...madeFor(entry.hole) }, version(entry.hole));
      syncSoon();
    })();
  }

  function resolve(key: string, choice: "mine" | "saved") {
    const run = engine.current, op = run?.ops().find((o) => o.key === key);
    if (!run || !op) return;
    if (choice === "saved" && op.server) {
      // Put the saved score back on my card and keep it as what I last entered.
      known.current[op.kind] = mergeSent(known.current[op.kind], [op.kind === "own" ? op.server.entry : { hole: op.entry.hole, strokes: op.server.entry.strokes }]);
      setReset((r) => ({ token: (r?.token ?? 0) + 1, card: cardFromEntries(known.current.own, known.current.attest) }));
    }
    void run.resolve(key, choice).then(() => run.sync());
  }

  // Submit & Save (Step 5): only once every change is synced; the server re-checks everything and locks the card.
  async function submit(): Promise<{ ok: boolean; message?: string }> {
    const run = engine.current;
    if (!scoring || !run) return { ok: false, message: "Scores are still loading." };
    await run.sync();
    if (run.status() !== "synced") return { ok: false, message: run.status() === "conflict" ? "Settle the score conflicts first." : "Your scores haven't synced yet. Try again when you're back online." };
    const latest = await (async () => { try { const { response, body } = await request(); return response.ok && body.ok ? body.scoring as TripRoundScoring : null; } catch { return null; } })();
    const current = latest ?? live;
    if (!current) return { ok: false, message: "Couldn't load your card. Try again." };
    if (latest) setLive(latest);
    const check = submissionCheck(current, scoring.profileId, scoring.profileId, openCorrectionHoles(corrections, scoring.profileId, null).own ?? []);
    if (!check.ok) return { ok: false, message: "holes" in check ? submitRefusal({ status: "rejected", reason: check.reason, holes: check.holes, scoring: null }) : "You can only submit your own card." };
    const group = myScoringSeat(current, scoring.profileId)?.groupId;
    if (!group) return { ok: false, message: "Couldn't find your group." };
    try {
      const response = await fetch(`/api/golf-trips/${scoring.tripId}/scoring/submit`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitBodyFrom(group, scoring.profileId, cardVersion(current, scoring.profileId))) });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      const result = response.ok && body.ok ? submitResultFromJson(body) : null;
      if (!result) return { ok: false, message: String(body.error ?? "Couldn't submit the card. Try again.") };
      if (result.scoring) setLive(result.scoring);
      return result.status === "rejected" ? { ok: false, message: submitRefusal(result) } : { ok: true };
    } catch {
      return { ok: false, message: "You're offline. Submit when you're back online." };
    }
  }

  // Step 6: ask to correct my submitted card / decide a request (organizer). The database enforces who may do what.
  async function correctionAction(body: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> {
    if (!scoring) return { ok: false };
    try {
      const response = await fetch(`/api/golf-trips/${scoring.tripId}/scoring/corrections`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, expectedProfileId: scoring.profileId }) });
      const answer = await response.json().catch(() => ({})) as Record<string, unknown>;
      await sync.current.refresh(); // the card may have reopened; reload scores and corrections
      return response.ok && answer.ok ? { ok: true } : { ok: false, message: String(answer.error ?? "Couldn't save that. Try again.") };
    } catch {
      return { ok: false, message: "You're offline. Try again when you're back online." };
    }
  }

  if (!scoring || !seat) return <GolfTripHome {...home} />;
  if (!startCard || !ops) return <GolfTripHome {...home} />; // the stored queue is loading (a moment)
  const status = queueStatus(ops);
  // The server says this card is submitted (after a refresh, sign-in, reconnect or a live update): show it locked.
  const lockedKey = seat.submitted ? JSON.stringify(seat.card) : null;
  if (lockedKey !== locked.key) setLocked({ key: lockedKey, card: lockedKey
    ? { strokes: seat.card.holes.map((h) => h ?? 0), putts: seat.card.putts, fairways: seat.card.fairways, greens: seat.card.greens, penalties: seat.card.penalties } : undefined });
  const nameOf = (s: Seat, id: string) => id === scoring.profileId ? "Your score" : `${s.attesteeName ?? "Their"} score`;
  return <GolfTripHome {...home} roundLive scoringOwner={scoring.profileId} scoringPlayerName={seat.myName} attesteeName={seat.attesteeName ?? undefined}
    attestedStrokes={seat.attestedForMe} attesteeStrokes={seat.attesteeId ? seat.attesteeOwn : undefined}
    scoresVerified={scoresVerified({ connected, unsaved: status !== "synced", saving: 0 })}
    syncStatus={status}
    conflicts={ops.filter((o) => o.status === "conflict").map((o) => ({ key: o.key, label: `${nameOf(seat, o.scoredProfileId)}, hole ${o.entry.hole}`, mine: show(o.entry), saved: show(o.server?.entry) }))}
    onResolveConflict={resolve} resetScoringCard={reset}
    onScoringSubmit={submit} submittedCard={locked.card}
    corrections={corrections ? correctionView(corrections, scoring.profileId) : undefined}
    correctionOpen={openCorrectionHoles(corrections, scoring.profileId, seat.attesteeId)}
    onRequestCorrection={corrections ? (holes, reason) => correctionAction({ action: "request", groupId: seat.groupId, golferProfileId: scoring.profileId, holes, reason }) : undefined}
    onDecideCorrection={corrections?.requests.some((r) => r.canDecide) ? (requestId, approve, note) => correctionAction({ action: "decide", requestId, approve, note }) : undefined}
    savedScoringCard={startCard}
    onScoringCardChange={(card) => queue("own", card.strokes.map((h, i) => card.entered?.[i] === false ? null : h), card)}
    onAttestChange={(strokes, entered) => queue("attest", strokes.map((h, i) => entered[i] ? h : null))} />;
}
