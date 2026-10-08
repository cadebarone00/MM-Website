"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { GolfTripHome } from "./GolfTripHome";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SheetCard } from "@/lib/platform/liveCards";
import type { QueuedOp } from "@/lib/platform/scoringQueue";
import { idbQueueStorage } from "@/lib/platform/scoringQueueIdb";
import { createScoringSync, memoryQueueStorage, type SendBatch } from "@/lib/platform/scoringSync";
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
export function SavedGolfTripHome({ scoring, ...home }: ComponentProps<typeof GolfTripHome> & { scoring?: { tripId: string; profileId: string; scoring: TripRoundScoring } }) {
  const [live, setLive] = useState(scoring?.scoring ?? null);
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

  async function request(init?: RequestInit) {
    const n = gate.current.begin();
    const response = await fetch(`/api/golf-trips/${scoring?.tripId}/scoring${init ? "" : `?round=${live?.roundNumber}`}`, { cache: "no-store", ...init });
    return { n, response, body: await response.json().catch(() => ({})) as Record<string, unknown> };
  }

  // The network side of the queue: one POST per (group, golfer scored). Who queued it must still be who's signed in.
  const send: SendBatch = async (batch) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, reason: "offline" };
    try {
      const { n, response, body } = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        groupId: batch.groupId, scoredProfileId: batch.scoredProfileId, expectedProfileId: scoring?.profileId,
        ops: batch.ops.map((o) => ({ opId: o.opId, baseVersion: o.baseVersion, supersedes: o.supersedes, clientUpdatedAt: o.clientUpdatedAt, entry: o.entry })) }) });
      if (response.status === 401) return { ok: false, reason: "signed-out" };
      if (response.status === 409 && body.reason === "wrong-account") return { ok: false, reason: "wrong-account" };
      const answer = response.ok && body.ok ? opResultsFromJson(body) : null;
      if (!answer) return { ok: false, reason: "error" };
      if (answer.scoring && gate.current.accept(n)) setLive(answer.scoring);
      return { ok: true, results: answer.results, scoring: null };
    } catch {
      return { ok: false, reason: "offline" };
    }
  };
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });

  async function refresh() {
    try {
      const { n, response, body } = await request();
      if (!response.ok || !body.ok || !body.scoring) throw new Error(String(body.error ?? `HTTP ${response.status}`));
      if (gate.current.accept(n)) setLive(body.scoring as TripRoundScoring);
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
    void (async () => {
      for (const entry of changes) await run.edit({ profileId: scoring.profileId, tripId: scoring.tripId, roundNumber: live.roundNumber, groupId: current.groupId, scoredProfileId, kind, entry }, version(entry.hole));
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

  if (!scoring || !seat) return <GolfTripHome {...home} />;
  if (!startCard || !ops) return <GolfTripHome {...home} />; // the stored queue is loading (a moment)
  const status = ops.some((o) => o.status === "conflict") ? "conflict" : ops.length ? "pending" : "synced";
  const nameOf = (s: Seat, id: string) => id === scoring.profileId ? "Your score" : `${s.attesteeName ?? "Their"} score`;
  return <GolfTripHome {...home} roundLive scoringOwner={scoring.profileId} scoringPlayerName={seat.myName} attesteeName={seat.attesteeName ?? undefined}
    attestedStrokes={seat.attestedForMe} attesteeStrokes={seat.attesteeId ? seat.attesteeOwn : undefined}
    scoresVerified={scoresVerified({ connected, unsaved: status !== "synced", saving: 0 })}
    syncStatus={status}
    conflicts={ops.filter((o) => o.status === "conflict").map((o) => ({ key: o.key, label: `${nameOf(seat, o.scoredProfileId)}, hole ${o.entry.hole}`, mine: show(o.entry), saved: show(o.server?.entry) }))}
    onResolveConflict={resolve} resetScoringCard={reset}
    savedScoringCard={startCard}
    onScoringCardChange={(card) => queue("own", card.strokes.map((h, i) => card.entered?.[i] === false ? null : h), card)}
    onAttestChange={(strokes, entered) => queue("attest", strokes.map((h, i) => entered[i] ? h : null))} />;
}
