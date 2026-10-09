"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useRecordMyStats } from "@/lib/platform/playerStatsSetting";
import { createPortal } from "react-dom";
import { LockKeyhole, LockKeyholeOpen, Minus, Plus } from "lucide-react";
import { useScoringView } from "@/lib/platform/scoringViewPreference";
import type { ScoreEdit, ScoredCard, ShotResult } from "@/lib/platform/playerRounds";
import { sheetCardFromScoring, type SheetCard } from "@/lib/platform/liveCards";
import { holeEditable, type RevisionHole } from "@/lib/platform/tripCorrections";
import { GolfGpsScreen } from "./gps/GolfGpsScreen";
import { SubmitCelebration } from "./SubmitCelebration";
import styles from "./GolfTripScoring.module.css";

const HOLES = 18;
/** How far a drag has to travel before it counts as a drag rather than a tap on the handle. */
const TAP_SLOP = 6;
/** "Hold for scoring": how long a press must last, and how far the finger may wander, before scoring opens. */
const HOLD_MS = 2000;
const HOLD_SLOP = 10;

/**
 * Golf Trip Home, Scoring: a pull-up sheet that runs to the bottom of the screen under the floating bottom menu.
 * Collapsed, just its "Scoring" handle shows above the menu; drag it
 * up (or tap it) to open score entry, drag it down (or tap) to tuck it away again. Look only for now: strokes live in
 * this page only and are never saved. `par` (holes 1–18) and `initialHoles` (strokes, null = not played) come from
 * the /dev/tournament preview; supplied scores are retained; untouched holes display par but remain unrecorded until submission.
 * Submit & Save (on the Scorecard view) lights up once every hole has both scores and my stats (fairway not needed on
 * par 3s) and each player's scores agree with the other phone (names turn green; a red name shows whose scores differ);
 * submitting locks the card until the page reloads. Submit & Save calls `onSubmit` with the card (the dev preview saves it
 * as the player's round); `submittedCard` reopens a saved round locked.
 */
export function GolfTripScoring({ par, initialHoles, playerName = "You", opponentCardMatches = false, courseName, prefill, onSubmit, submittedCard, attesteeName, edits, onCardChange, attestedStrokes, onAttestChange, savedCard, attesteeStrokes, scoresVerified = true, syncStatus, conflicts, onResolveConflict, resetCard, corrections, onRequestCorrection, onDecideCorrection, correctionOpen }: {
  par?: number[]; initialHoles?: (number | null)[]; playerName?: string; opponentCardMatches?: boolean; courseName?: string;
  /** Dev preview only: a finished card (opponent scores, putts, fairways, greens) to start from. */
  prefill?: { opponentHoles: (number | null)[]; putts: (number | null)[]; fairways: (Direction | null)[]; greens: (Direction | null)[];
    /** Where the opponent's own phone disagrees with this starting card ("scores don't match"); none means it agrees. */
    otherCardDiff?: { player: "me" | "opponent"; hole: number; delta: number } };
  /** Saved trips return the server's answer: the card only locks (and celebrates) when it says ok. */
  onSubmit?: (card: ScoredCard) => void | Promise<{ ok: boolean; message?: string }>;
  /** A round already saved for this player: the card opens locked as Submitted. */
  submittedCard?: ScoredCard;
  /** Player & Attest: whose score I keep (the second column); without it a made-up opponent name shows. */
  attesteeName?: string;
  /** A saved round's organizer changes: the Card marks those holes and shows the reason when tapped. */
  edits?: ScoreEdit[];
  /** Every change to an unsubmitted card (the dev preview keeps it as the live card the attester and organizer see). */
  onCardChange?: (card: SheetCard) => void;
  /** Player & Attest, the second phone: what my attester entered for me (wins over the simulator stand-in once they've entered any). */
  attestedStrokes?: (number | null)[];
  /** My entries for the player I keep score for, sent to their card. */
  onAttestChange?: (strokes: (number | null)[], entered: boolean[]) => void;
  /** A saved trip's card in progress (my strokes + stats, and what I entered for the player I attest): the sheet starts from it. */
  /** My attestee's own strokes (saved trips): what the column I keep is checked against. */
  attesteeStrokes?: (number | null)[];
  /** Saved trips: false while a change of mine is unsaved or the connection is down, so nothing shows as matched / mismatched and Submit stays off. */
  scoresVerified?: boolean;
  /** Saved trips (offline scoring): where my entries stand. Shown as one status line on the Card. */
  syncStatus?: "pending" | "synced" | "conflict";
  /** Holes where the saved score changed while mine waited to sync: mine is kept until I choose. */
  conflicts?: { key: string; label: string; mine: string; saved: string }[];
  onResolveConflict?: (key: string, choice: "mine" | "saved") => void;
  /** A new token puts this card on screen (e.g. after choosing the saved score in a conflict). */
  resetCard?: { token: number; card: { holes: (number | null)[]; opponentHoles: (number | null)[]; putts: (number | null)[]; fairways: (Direction | null)[]; greens: (Direction | null)[]; penalties: { fairway: boolean; green: boolean }[] } };
  /** Saved trips (Step 6): my latest correction request, my submission history, and (organizer) pending requests to decide. */
  corrections?: { myRequest: { status: "pending" | "approved" | "denied" | "resubmitted"; holes: number[]; decisionNote: string | null; decidedByName: string | null } | null;
    revisions: { revision: number; submittedAt: string; submittedByName: string; reason: string | null; isCurrent: boolean; card: RevisionHole[] }[];
    pending: { id: string; name: string; holes: number[]; reason: string }[] };
  onRequestCorrection?: (holes: number[], reason: string) => Promise<{ ok: boolean; message?: string }>;
  /** Approve, or deny with a reason (required). */
  onDecideCorrection?: (requestId: string, approve: boolean, note: string | null) => Promise<{ ok: boolean; message?: string }>;
  /** Saved trips (Step 6): holes reopened by an approved correction. own = my card (only these can change); attest = the
   *  golfer I attest (only these of my column can change, even after I've submitted my own card). Null = none. */
  correctionOpen?: { own: number[] | null; attest: number[] | null };
  savedCard?: { holes: (number | null)[]; opponentHoles: (number | null)[]; putts: (number | null)[]; fairways: (Direction | null)[]; greens: (Direction | null)[]; penalties: { fairway: boolean; green: boolean }[] };
}) {
  const [open, updateOpen] = useState(false);
  // Stats on my card: required by the organizer, or (when optional) I chose to record them.
  const playerStats = useRecordMyStats();
  const [holes, setHoles] = useState<(number | null)[]>(() => Array.from({ length: HOLES }, (_, i) => submittedCard?.strokes[i] ?? savedCard?.holes[i] ?? initialHoles?.[i] ?? null));
  const [holesCompetitor, setHolesCompetitor] = useState<(number | null)[]>(() => Array.from({ length: HOLES }, (_, i) => prefill?.opponentHoles[i] ?? savedCard?.opponentHoles[i] ?? initialHoles?.[i] ?? null));
  const [current, setCurrent] = useState(() => { const next = Array.from({ length: HOLES }, (_, i) => savedCard?.holes[i] ?? initialHoles?.[i] ?? null).findIndex((h) => h === null); return next === -1 ? HOLES - 1 : next; });
  // My stats for each hole: putts, and where the drive (fairway) and approach (green) finished; "center" = hit.
  const [putts, setPutts] = useState<(number | null)[]>(() => Array.from({ length: HOLES }, (_, i) => submittedCard?.putts[i] ?? savedCard?.putts[i] ?? prefill?.putts[i] ?? null));
  const [fairways, setFairways] = useState<(Direction | null)[]>(() => Array.from({ length: HOLES }, (_, i) => submittedCard?.fairways[i] ?? savedCard?.fairways[i] ?? prefill?.fairways[i] ?? null));
  const [greens, setGreens] = useState<(Direction | null)[]>(() => Array.from({ length: HOLES }, (_, i) => submittedCard?.greens[i] ?? savedCard?.greens[i] ?? prefill?.greens[i] ?? null));
  const [penalties, setPenalties] = useState(() => Array.from({ length: HOLES }, (_, i) => savedCard?.penalties[i] ?? { fairway: false, green: false }));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(submittedCard));
  const [resetToken, setResetToken] = useState(resetCard?.token);
  if (resetCard && resetCard.token !== resetToken) {
    setResetToken(resetCard.token);
    setHoles(resetCard.card.holes); setHolesCompetitor(resetCard.card.opponentHoles); setPutts(resetCard.card.putts);
    setFairways(resetCard.card.fairways); setGreens(resetCard.card.greens); setPenalties(resetCard.card.penalties);
  }
  // A saved round can arrive after the first render (the dev store loads after hydration): take it in once, locked.
  const [loadedCard, setLoadedCard] = useState(submittedCard);
  if (submittedCard !== loadedCard) {
    setLoadedCard(submittedCard);
    // Also after submit: an organizer change to the saved round shows on the locked card right away.
    if (submittedCard) {
      setHoles(submittedCard.strokes); setPutts(submittedCard.putts); setFairways(submittedCard.fairways); setGreens(submittedCard.greens); setSubmitted(true);
      if (submittedCard.penalties) setPenalties(submittedCard.penalties);
    } else if (loadedCard) setSubmitted(false); // the server reopened it (an approved correction)
  }
  // Request Correction (saved trips): which holes, and why.
  const [requesting, setRequesting] = useState(false);
  const [correctionHoles, setCorrectionHoles] = useState<number[]>([]);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  async function sendCorrection() {
    if (!onRequestCorrection) return;
    setCorrectionBusy(true); setCorrectionError(null);
    const answer = await onRequestCorrection(correctionHoles, correctionReason).catch(() => ({ ok: false, message: "Couldn't send the request. Try again." }));
    setCorrectionBusy(false);
    if (!answer.ok) { setCorrectionError(answer.message ?? "Couldn't send the request. Try again."); return; }
    setRequesting(false); setCorrectionHoles([]); setCorrectionReason("");
  }
  const [madeUpName] = useState(() => randomOpponentName());
  const opponentName = attesteeName ?? madeUpName;
  // The GPS and Scorecard pills swap the pulled-up sheet to their own view (same sheet, no page change); tapping again returns to scoring.
  const [view, setView] = useState<"scoring" | "gps" | "scorecard">("scoring");
  const [lockedView, setLockedView] = useState<"gps" | "scorecard" | null>(() => {
    try { const saved = localStorage.getItem("golfTripScoringLockedView"); return saved === "gps" || saved === "scorecard" ? saved : null; } catch { return null; }
  });
  const setOpen = useCallback((next: boolean | ((value: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (value && !open) setView(lockedView ?? "scoring");
    updateOpen(value);
  }, [open, lockedView]);
  function toggleLock(next: "gps" | "scorecard") {
    const value = lockedView === next ? null : next;
    setLockedView(value);
    if (value) setView(value);
    try { if (value) localStorage.setItem("golfTripScoringLockedView", value); else localStorage.removeItem("golfTripScoringLockedView"); } catch { /* Keep the preference in memory for this mount. */ }
  }
  const toggleView = (next: "gps" | "scorecard") => setView((value) => value === next ? "scoring" : next);
  const sheetRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const spacerRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ startY: number; startOffset: number; closedOffset: number; moved: boolean; onLabel: boolean } | null>(null);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  // Tapping the bar to tuck the sheet away slides it down fast (100 ms); opening and dragging keep the normal speed.
  const [fastClose, setFastClose] = useState(false);
  const tapToggle = () => { setFastClose(open); setOpen(!open); };
  /** How far the sheet travels between open and closed, for the grow-to-full-screen progress while dragging. */
  const [dragRange, setDragRange] = useState(0);
  const chipsRef = useRef<HTMLDivElement>(null);
  // The player's scorecard view (General settings). "slide" is the pull-up sheet; the others open scoring full screen.
  const scoringView = useScoringView();
  const fullScreen = scoringView !== "slide";

  // Hold for scoring: pressing an empty spot anywhere on the page for HOLD_MS opens scoring. Buttons, links, fields
  // and scrolling still work normally; moving the finger or lifting it early cancels.
  useEffect(() => {
    if (scoringView !== "hold" || open) return;
    let timer: number | undefined, start: { x: number; y: number } | null = null;
    const cancel = () => { window.clearTimeout(timer); timer = undefined; start = null; };
    const down = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea, label, [role=switch], [role=tab], [role=dialog]")) return;
      start = { x: event.clientX, y: event.clientY };
      timer = window.setTimeout(() => { cancel(); setView("scoring"); setOpen(true); }, HOLD_MS);
    };
    const move = (event: globalThis.PointerEvent) => { if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > HOLD_SLOP) cancel(); };
    const menu = (event: Event) => { if (timer !== undefined) event.preventDefault(); }; // no phone long-press menu mid-hold
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", cancel);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("scroll", cancel, true);
    document.addEventListener("contextmenu", menu);
    return () => {
      cancel();
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", cancel);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("scroll", cancel, true);
      document.removeEventListener("contextmenu", menu);
    };
  }, [scoringView, open, setOpen]);

  // Keep the current hole's chip in view in the sideways hole picker (on open and whenever the hole changes).
  useEffect(() => {
    const strip = chipsRef.current;
    const chip = strip?.children[current] as HTMLElement | undefined;
    if (strip && chip) strip.scrollTo({ left: chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  }, [current, open]);

  // Collapsed, the sheet is pushed down so only its handle shows above the strip the bottom menu covers.
  const closedOffset = () => (sheetRef.current?.offsetHeight ?? 0) - (handleRef.current?.offsetHeight ?? 0) - (spacerRef.current?.offsetHeight ?? 0);

  const suppressDragClickUntil = useRef(0);
  // A brief stationary press arms page-wide touch dragging in Slide mode without taking over quick scrolling.
  useEffect(() => {
    if (fullScreen || confirmOpen) return;
    let gesture: { id: number; x: number; y: number; armed: boolean; moved: boolean; offset: number; closed: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { clearTimeout(timer); gesture = null; };
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1 || (event.target instanceof Element && (handleRef.current?.contains(event.target) || event.target.closest('[role="dialog"], input, textarea, select')))) { clear(); return; }
      const t = event.touches[0];
      const closed = closedOffset();
      gesture = { id: t.identifier, x: t.clientX, y: t.clientY, armed: false, moved: false, offset: open ? 0 : closed, closed };
      timer = setTimeout(() => { if (gesture) gesture.armed = true; }, 200);
    };
    const move = (event: TouchEvent) => {
      const g = gesture;
      if (!g) return;
      if (event.touches.length !== 1) { clear(); setDragOffset(null); return; }
      const t = Array.from(event.touches).find(touch => touch.identifier === g.id);
      if (!t) return;
      const dy = t.clientY - g.y, dx = t.clientX - g.x;
      if (!g.armed) { if (Math.hypot(dx, dy) > TAP_SLOP) clear(); return; }
      if (!g.moved && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > TAP_SLOP) { clear(); return; }
      if (Math.abs(dy) < TAP_SLOP && !g.moved) return;
      if (!event.cancelable) { clear(); setDragOffset(null); return; }
      event.preventDefault();
      g.moved = true;
      suppressDragClickUntil.current = Date.now() + 800;
      g.offset = Math.min(Math.max((open ? 0 : g.closed) + dy, 0), g.closed);
      setDragRange(g.closed);
      setDragOffset(g.offset);
    };
    const end = () => {
      if (gesture?.moved) { setFastClose(false); setOpen(gesture.offset < gesture.closed / 2); }
      clear(); setDragOffset(null);
    };
    const cancel = () => { clear(); setDragOffset(null); };
    const click = (event: MouseEvent) => { if (Date.now() < suppressDragClickUntil.current) { event.preventDefault(); event.stopImmediatePropagation(); suppressDragClickUntil.current = 0; } };
    const menu = (event: Event) => { if (gesture?.armed) event.preventDefault(); };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', cancel);
    document.addEventListener('click', click, true);
    document.addEventListener('contextmenu', menu);
    return () => {
      clear();
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', cancel);
      document.removeEventListener('click', click, true);
      document.removeEventListener('contextmenu', menu);
    };
  }, [fullScreen, confirmOpen, open, setOpen]);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    const closed = closedOffset();
    drag.current = { startY: event.clientY, startOffset: open ? 0 : closed, closedOffset: closed, moved: false, onLabel: !!(event.target as Element).closest("." + styles.handleLabel) };
    setDragRange(closed);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < TAP_SLOP) return;
    d.moved = true;
    setDragOffset(Math.min(Math.max(d.startOffset + dy, 0), d.closedOffset));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // While open, a tap on the Scoring pill is a view button like GPS / Card (back to score entry), not a collapse.
    if (!d.moved && open && d.onLabel) setView("scoring");
    else if (!d.moved) tapToggle(); // a tap toggles
    else { setFastClose(false); setOpen((dragOffset ?? d.startOffset) < d.closedOffset / 2); } // a drag snaps to whichever end is closer
    setDragOffset(null);
  }

  const strokes = holes[current];
  const holePar = par?.[current];
  const played = holes.map((h, i) => ({ h, p: par?.[i] })).filter((x): x is { h: number; p: number | undefined } => x.h !== null);
  const thru = played.length;
  const toPar = par ? played.reduce((sum, x) => sum + x.h - (x.p ?? 0), 0) : null;

  // Step 6: with an open correction only its holes can change (the database refuses the rest too).
  const ownEditable = holeEditable(correctionOpen?.own, submitted, current + 1);
  const attestEditable = holeEditable(correctionOpen?.attest, submitted, current + 1);
  function step(delta: number) {
   if (!ownEditable) return;
   setHoles((current_) => current_.map((h, i) => {
     if (i !== current) return h;
     const start = h ?? holePar ?? 4; // untouched scores display par until edited or submitted
     return Math.min(Math.max(start + delta, 1), 15);
   }));
  }

  function stepCompetitor(delta: number) {
   if (!attestEditable) return;
   setHolesCompetitor((current_) => current_.map((h, i) => {
     if (i !== current) return h;
     const start = h ?? holePar ?? 4;
     return Math.min(Math.max(start + delta, 1), 15);
   }));
  }

  const setForHole = <T,>(setter: (update: (values: T[]) => T[]) => void, value: T) => setter((values) => values.map((v, i) => i === current ? value : v));
  const submittedHoles = holes.map((h, i) => h ?? par?.[i] ?? null);
  const submittedOpponentHoles = holesCompetitor.map((h, i) => h ?? par?.[i] ?? null);
  // Player Stats off (Organizer → Player Scoring): a hole only needs the two scores.
  const holeFilled = (i: number) => submittedHoles[i] !== null && submittedOpponentHoles[i] !== null && (!playerStats || (putts[i] !== null && greens[i] !== null && (par?.[i] === 3 || fairways[i] !== null)));
  const complete = submittedHoles.every((_, i) => holeFilled(i));
  // The last hole has no next hole: its button opens the Card (where Submit & Save is) once that hole is filled in.
  const lastHole = current === HOLES - 1;
  // Each player is checked against the other phone: my scores for myself vs what my opponent entered for me, and what I
  // entered for my opponent vs what they entered for themselves. With a dev prefill the other phone's card is the starting
  // card (plus any otherCardDiff); otherwise opponentCardMatches stands in for both. Green = agrees, red = needs fixing.
  const [otherCard] = useState(() => {
    if (!prefill) return null;
    const card = { me: Array.from({ length: HOLES }, (_, i) => initialHoles?.[i] ?? par?.[i] ?? null), opponent: Array.from({ length: HOLES }, (_, i) => prefill.opponentHoles[i] ?? par?.[i] ?? null) };
    const diff = prefill.otherCardDiff;
    if (diff) card[diff.player][diff.hole] = Math.max(1, (card[diff.player][diff.hole] ?? par?.[diff.hole] ?? 4) + diff.delta);
    return card;
  });
  const sameAs = (mine: (number | null)[], theirs: (number | null)[]) => mine.every((value, i) => value === theirs[i]);
  // My score vs what my attester entered for me: their real entries once there are any, else the simulator stand-in.
  // Someone else's untouched hole counts as par, same as mine.
  const parFilled = (values: (number | null)[]) => values.map((h, i) => h ?? par?.[i] ?? null);
  const fromAttester = attestedStrokes?.some((h) => h !== null) ? parFilled(attestedStrokes) : null;
  const meMatches = fromAttester ? sameAs(submittedHoles, fromAttester) : otherCard ? sameAs(submittedHoles, otherCard.me) : opponentCardMatches;
  const opponentMatches = attesteeStrokes ? sameAs(submittedOpponentHoles, parFilled(attesteeStrokes)) : otherCard ? sameAs(submittedOpponentHoles, otherCard.opponent) : opponentCardMatches;
  // Only my own score has to match my attester's (owner decision): the column I keep for someone else is shown, never blocks me.
  // Step 6: corrected holes whose old attestation was cleared and my attester hasn't entered again yet.
  const awaitingAttest = (correctionOpen?.own ?? []).filter((h) => (attestedStrokes?.[h - 1] ?? null) === null);
  const readyToSubmit = complete && meMatches && awaitingAttest.length === 0 && scoresVerified && (syncStatus === undefined || syncStatus === "synced");
  // Saved trips: one status line. Verified only when everything of mine is synced and my attester agrees on all 18.
  const statusLabel = syncStatus === undefined ? null : submitted ? "Submitted" : syncStatus === "conflict" ? "Conflict"
    : syncStatus === "pending" ? "Saved locally · Pending sync" : complete && meMatches && scoresVerified ? "Verified" : "Synced";
  // The live card (dev): reported only when something changed, so the store isn't written on every render. My
  // attester's strokes for me come from the other phone (otherCard), or stand in from the simulator's card setting.
  const attestStrokes = fromAttester ?? (otherCard ? otherCard.me : submittedHoles.map((h) => opponentCardMatches ? h : null));
  const liveKey = !submitted && (thru > 0 || putts.some((p) => p !== null)) ? JSON.stringify(sheetCardFromScoring({ holes, par, putts, fairways, greens, penalties, attestStrokes })) : null;
  const reportCard = useRef(onCardChange);
  useEffect(() => { reportCard.current = onCardChange; }, [onCardChange]);
  useEffect(() => { if (liveKey) reportCard.current?.(JSON.parse(liveKey) as SheetCard); }, [liveKey]);
  // The second phone: once I've entered anything for the player I attest, my column (untouched holes = par) goes to their card.
  const attestKey = (!submitted || correctionOpen?.attest) && holesCompetitor.some((h) => h !== null) ? JSON.stringify({ strokes: submittedOpponentHoles, entered: holesCompetitor.map((h) => h !== null) }) : null;
  const reportAttest = useRef(onAttestChange);
  useEffect(() => { reportAttest.current = onAttestChange; }, [onAttestChange]);
  useEffect(() => { if (!attestKey) return; const sent = JSON.parse(attestKey) as { strokes: (number | null)[]; entered: boolean[] }; reportAttest.current?.(sent.strokes, sent.entered); }, [attestKey]);
  // Submit Score plays the full-screen moment over the now-locked card.
  const [celebration, setCelebration] = useState<{ total: number; toPar: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Colours show once the card is complete (or submitted): green when that player's scores agree, red when they don't.
  const check = (matches: boolean) => (complete || submitted) && (scoresVerified || submitted) ? matches ? "ok" as const : "wrong" as const : null;

  // While dragging, the sheet follows the finger and grows toward full screen as it rises (--sheet-open: 0 closed → 1 open).
  const style = dragOffset !== null
    ? { transform: `translateY(${dragOffset}px)`, transition: "none", "--sheet-open": dragRange > 0 ? 1 - dragOffset / dragRange : 1 } as CSSProperties
    : undefined;

  // Full-screen views: closed shows nothing ("hold") or a Scoring button where Next hole sits ("button").
  if (fullScreen && !open) return scoringView === "button"
    ? <div className={styles.frame}><button type="button" className={`${styles.nextHoleButton} ${styles.openScoringButton}`} onClick={() => { setView("scoring"); setOpen(true); }}>Scoring</button></div>
    : null;

  // Pulled up (or being dragged), a dimmed layer covers the rest of the page, bottom menu included, so nothing
  // behind the sheet can be tapped; the sheet sits above it.
  const blocking = !fullScreen && (open || dragOffset !== null);
  // The GPS prototype (dev only): its satellite map fills the whole sheet, with the handle, pills and yardages on top.
  const showGpsMap = view === "gps" && process.env.NODE_ENV === "development";
  return <>{blocking && <div className={styles.backdrop} aria-hidden />}<div className={`${styles.frame} ${fullScreen ? styles.frameFull : ""} ${blocking ? styles.frameAbove : ""}`}><section ref={sheetRef} className={`${styles.sheet} ${open ? styles.open : ""} ${dragOffset !== null ? styles.dragging : ""} ${fastClose ? styles.fastClose : ""} ${fullScreen ? styles.sheetFull : ""} ${fullScreen && view === "gps" ? styles.gpsFullScreen : ""} ${!fullScreen && showGpsMap ? styles.gpsOverlay : ""}`} style={style} aria-label="Scoring">
    {/* GPS pill (left, red) mirrors the Scorecard pill (right); both show while the sheet is pulled up. */}
    {open && (["gps", "scorecard"] as const).map((target) => {
      const label = target === "gps" ? "GPS" : "Card";
      const locked = lockedView === target;
      const Icon = locked ? LockKeyhole : LockKeyholeOpen;
      return <div key={target} className={[styles.scorecardButton, target === "gps" ? styles.scorecardButtonLeft + " " + styles.gpsButton : ""].join(" ")} data-active={view === target}>
        <button type="button" className={styles.pillLabel} aria-pressed={view === target} aria-label={view === target ? "Back to scoring" : "Open " + label} onClick={() => toggleView(target)}>{label}</button>
        <button type="button" className={styles.pillLock} aria-pressed={locked} aria-label={locked ? "Unlock " + label + " default scoring view" : "Lock " + label + " as default scoring view"} onClick={() => toggleLock(target)}><Icon size={14} aria-hidden="true" /></button>
      </div>;
    })}
    {open && <button type="button" className={styles.exitButton} onClick={() => setOpen(false)}>EXIT</button>}
    {fullScreen ? <div className={styles.fullTopBar}><button type="button" className={styles.handleLabel} onClick={() => setView("scoring")}>Scoring</button></div> : <button ref={handleRef} type="button" className={styles.handle} aria-expanded={open} aria-controls="trip-scoring-body"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); tapToggle(); } }}>
      <span className={styles.grabber} aria-hidden />
      <span className={styles.handleMeta}>
        {/* The score line hides while open so it doesn't sit under the left Scorecard pill. */}
        {thru > 0 && !open && <>
          <span>{toPar !== null ? formatToPar(toPar) : "—"}</span>
          <span aria-hidden>•</span>
          <span>Thru {thru}</span>
        </>}
      </span>
      <span className={styles.handleLabel}>Scoring</span>
    </button>}

    <div id="trip-scoring-body" className={styles.body} inert={!open}>
      {/* GPS prototype (satellite map, live yardages, mock hole) in development; real trips keep the placeholder until course data exists. */}
      {view === "gps" ? showGpsMap ? <GolfGpsScreen holeNumber={current + 1} className={`${styles.gpsMap} ${fullScreen ? styles.gpsMapFull : styles.gpsMapFill}`} /> : <GpsSection hole={current + 1} holePar={holePar} />
        : view === "scorecard" ? <>
          {courseName && <h3 className={styles.scorecardCourse}>{courseName}</h3>}
          <ScorecardSection par={par} holes={holes} opponentHoles={holesCompetitor} playerName={playerName} opponentName={opponentName} putts={putts} fairways={fairways} greens={greens}
            myTotal={sumOf(submittedHoles)} opponentTotal={sumOf(submittedOpponentHoles)} myCheck={check(meMatches)} opponentCheck={check(opponentMatches)} edits={edits} />
          {/* Always shown; only lights up once both cards are complete and the opponent's card agrees. */}
          {conflicts && conflicts.length > 0 && <div className={styles.conflicts} role="group" aria-label="Score conflicts">
            {conflicts.map((c) => <div key={c.key} className={styles.conflictRow}><span>{c.label}: yours {c.mine} · saved {c.saved}</span>
              <button type="button" onClick={() => onResolveConflict?.(c.key, "mine")}>Keep mine</button>
              <button type="button" onClick={() => onResolveConflict?.(c.key, "saved")}>Use saved</button></div>)}
          </div>}
          {statusLabel && <p className={styles.syncStatus} data-state={statusLabel.split(" ")[0].toLowerCase()} role="status">{statusLabel === "Submitted" && <LockKeyhole size={11} aria-hidden="true" />} {statusLabel}</p>}
          {submitError && <p className={styles.syncStatus} data-state="conflict" role="alert">{submitError}</p>}
          <CorrectionNotes open={correctionOpen} awaiting={awaitingAttest} attesteeName={opponentName} />
          {corrections && <CorrectionsPanel corrections={corrections} submitted={submitted} requesting={requesting} busy={correctionBusy} error={correctionError}
            holes={correctionHoles} reason={correctionReason} canRequest={Boolean(onRequestCorrection)} onDecide={onDecideCorrection}
            onOpen={() => { setRequesting(true); setCorrectionError(null); }} onCancel={() => setRequesting(false)} onSend={() => void sendCorrection()}
            onToggleHole={(h) => setCorrectionHoles((list) => list.includes(h) ? list.filter((x) => x !== h) : [...list, h].sort((a, b) => a - b))}
            onReason={setCorrectionReason} />}
          <button type="button" className={`${styles.nextHoleButton} ${styles.submitSave}`} disabled={!readyToSubmit || submitted || submitting} onClick={() => setConfirmOpen(true)}>{submitted ? "Submitted" : submitting ? "Submitting…" : "Submit & Save"}</button>
        </>
        : <>
      {/* One row: Thru on the left, the hole in the middle, To Par on the right, all lined up vertically. */}
      <div className={styles.holeSelection}>
      <div className={styles.holeHeader}>
        <dl className={styles.holeStat}><dt>Thru</dt><dd>{thru}</dd></dl>
        <div className={styles.holeTitle}>
          <span className={styles.holeNumber}>Hole {current + 1}</span>
          <span className={styles.holePar}>Par {holePar ?? "—"}</span>
        </div>
        <dl className={styles.holeStat}><dt>To Par</dt><dd>{toPar !== null && thru ? formatToPar(toPar) : "—"}</dd></dl>
      </div>

      <div ref={chipsRef} className={styles.holes} role="group" aria-label="Holes">
        {holes.map((h, i) => { const correctable = Boolean(correctionOpen?.own?.includes(i + 1) || correctionOpen?.attest?.includes(i + 1));
          return <button key={i} type="button" aria-pressed={i === current} aria-label={`Hole ${i + 1}${h !== null ? `, ${h} strokes` : ""}${correctable ? ", can be corrected" : ""}`}
          data-correctable={correctable || undefined}
          className={`${styles.holeChip} ${h !== null ? styles.holeChipFilled : ""} ${i === current ? styles.holeChipActive : ""}`} onClick={() => setCurrent(i)}>
          <span className={styles.holeChipNumber}>{i + 1}</span>
        </button>; })}
      </div>
      <CorrectionNotes open={correctionOpen} awaiting={awaitingAttest} attesteeName={opponentName} />

      </div>

      <div className={styles.stepperWrap}>

        <div className={styles.scoreSplit}>
          <ScoreCard label="My Score" strokes={strokes} holePar={holePar} step={step} disabled={!ownEditable} compact />
          <ScoreCard label={`${opponentName} Score`} strokes={holesCompetitor[current]} holePar={holePar} step={stepCompetitor} disabled={!attestEditable} compact />
        </div>
      </div>

      {playerStats && <>
      <div className={styles.puttsWrap} aria-label="Putts">
        <span className={styles.puttsLabel}>Putts</span>
        <div className={styles.putts} role="group" aria-label="Putts selector">
          {[0, 1, 2, 3, 4].map((value) => <button key={value} type="button" className={styles.puttOption} aria-pressed={putts[current] === value} disabled={!ownEditable}
            onClick={() => setForHole(setPutts, value)}>{value === 4 ? "4+" : value}</button>)}
        </div>
      </div>

      <div className={styles.compassRow} aria-label="Shot direction">
        {/* No fairway to hit on a par 3. */}
        <Compass label="FWY" value={fairways[current]} onChange={(value) => setForHole(setFairways, value)} disabled={!ownEditable || holePar === 3} />
        <div className={styles.penaltyColumn} role="group" aria-label="Penalties">
          <span className={styles.compassLabel}>PEN</span>
          <div className={styles.penaltyButtons}>
            {([['fairway', 'FWY'], ['green', 'GRN']] as const).map(([key, label]) => <button key={key} type="button"
              className={`${styles.compassCenter} ${styles.penaltyButton}`} aria-label={`${label} penalty`} aria-pressed={penalties[current][key]}
              disabled={!ownEditable || (key === "fairway" && holePar === 3)}
              onClick={() => setPenalties((values) => values.map((value, i) => i === current ? { ...value, [key]: !value[key] } : value))}>{label}</button>)}
          </div>
        </div>
        <Compass label="GIR" value={greens[current]} onChange={(value) => setForHole(setGreens, value)} disabled={!ownEditable} />
      </div>
      </>}

      {lastHole ? <button type="button" className={styles.nextHoleButton} disabled={!holeFilled(current)} onClick={() => setView("scorecard")}>
        Scorecard
      </button> : <button type="button" className={styles.nextHoleButton} aria-label="Next hole" onClick={() => setCurrent((value) => Math.min(value + 1, HOLES - 1))}>
        Next hole
      </button>}
      </>}
      <span ref={spacerRef} className={styles.navSpacer} aria-hidden />
    </div>
    {confirmOpen && createPortal(<div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-label="Submit score confirmation">
      <div className={styles.confirmDialog}>
        <p className={styles.confirmPrompt}>Are you sure?</p>
        <button type="button" className={styles.keepEditingButton} onClick={() => setConfirmOpen(false)}>Keep Editing</button>
        <button type="button" className={styles.submitScoreButton} onClick={async () => {
          setConfirmOpen(false); setSubmitError(null);
          // Saved trips: the server decides. Nothing locks or celebrates until it says the card is submitted.
          const outcome = onSubmit?.({ strokes: submittedHoles.map((h) => h ?? 0), putts, fairways, greens, penalties });
          if (outcome instanceof Promise) {
            setSubmitting(true);
            const answer = await outcome.catch(() => ({ ok: false, message: "Couldn't submit the card. Try again." }));
            setSubmitting(false);
            if (!answer.ok) { setSubmitError(answer.message ?? "Couldn't submit the card. Try again."); return; }
          }
          setHoles(submittedHoles); setHolesCompetitor(submittedOpponentHoles); setSubmitted(true);
          const total = submittedHoles.reduce<number>((sum, h) => sum + (h ?? 0), 0);
          setCelebration({ total, toPar: par ? formatToPar(total - par.reduce((sum, p) => sum + p, 0)) : "" }); }}>Submit Score</button>
      </div>
    </div>, document.body)}
    {celebration && <SubmitCelebration total={celebration.total} toPar={celebration.toPar} onDone={() => setCelebration(null)} />}
  </section></div></>;
}

const CORRECTION_LABEL = { pending: "Correction pending", approved: "Correction approved · card reopened", denied: "Correction denied", resubmitted: "Resubmitted" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Saved trips (Step 6), under Submit & Save on the Card: Request Correction on a submitted card (pick holes, say why),
 * my request's status, the organizer's pending requests with Approve / Deny, and a read-only submission history.
 */
function CorrectionsPanel({ corrections, submitted, requesting, busy, error, holes, reason, canRequest, onDecide, onOpen, onCancel, onSend, onToggleHole, onReason }: {
  corrections: NonNullable<Parameters<typeof GolfTripScoring>[0]["corrections"]>; submitted: boolean; requesting: boolean; busy: boolean; error: string | null;
  holes: number[]; reason: string; canRequest: boolean; onDecide?: (id: string, approve: boolean, note: string | null) => Promise<{ ok: boolean; message?: string }>;
  onOpen: () => void; onCancel: () => void; onSend: () => void; onToggleHole: (hole: number) => void; onReason: (reason: string) => void;
}) {
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const mine = corrections.myRequest;
  const open = mine?.status === "pending" || mine?.status === "approved";
  async function decide(id: string, approve: boolean, note: string | null) {
    if (!onDecide) return false;
    setDeciding(id); setDecideError(null);
    const answer = await onDecide(id, approve, note).catch(() => ({ ok: false, message: "Couldn't save the decision." }));
    setDeciding(null);
    if (!answer.ok) setDecideError(answer.message ?? "Couldn't save the decision.");
    return answer.ok;
  }
  return <div className={styles.corrections}>
    {mine && <p className={styles.syncStatus} data-state={mine.status === "denied" ? "conflict" : mine.status === "pending" ? "saved" : "verified"} role="status">
      {CORRECTION_LABEL[mine.status]} · hole {mine.holes.join(", ")}{mine.status === "denied" && mine.decisionNote ? ` · ${mine.decidedByName ? `${mine.decidedByName}: ` : ""}${mine.decisionNote}` : ""}</p>}
    {submitted && canRequest && !open && !requesting && <button type="button" className={styles.correctionButton} onClick={onOpen}>Request Correction</button>}
    {requesting && <div className={styles.correctionForm} role="group" aria-label="Request a correction">
      <span className={styles.correctionLabel}>Holes to correct</span>
      <div className={styles.correctionHoles}>{Array.from({ length: 18 }, (_, i) => i + 1).map((h) =>
        <button key={h} type="button" aria-pressed={holes.includes(h)} onClick={() => onToggleHole(h)}>{h}</button>)}</div>
      <textarea aria-label="Why the card needs correcting" placeholder="What's wrong? (required)" maxLength={500} value={reason} onChange={(e) => onReason(e.target.value)} />
      {error && <p className={styles.syncStatus} data-state="conflict" role="alert">{error}</p>}
      <div className={styles.correctionActions}>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" disabled={busy || holes.length === 0 || reason.trim().length < 3} onClick={onSend}>{busy ? "Sending…" : "Send request"}</button>
      </div>
    </div>}
    {corrections.pending.length > 0 && onDecide && <div className={styles.correctionForm} role="group" aria-label="Correction requests">
      <span className={styles.correctionLabel}>Correction requests</span>
      {corrections.pending.map((p) => <DecideRow key={p.id} label={`${p.name} · hole ${p.holes.join(", ")} · ${p.reason}`} busy={deciding === p.id}
        onApprove={() => decide(p.id, true, null)} onDeny={(note) => decide(p.id, false, note)} />)}
      {decideError && <p className={styles.syncStatus} data-state="conflict" role="alert">{decideError}</p>}
    </div>}
    {corrections.revisions.length > 0 && <RevisionHistory revisions={corrections.revisions} />}
  </div>;
}

/** One request to decide: Approve, or Deny, which first asks why (a reason is required, here and in the database). */
export function DecideRow({ label, busy, onApprove, onDeny }: { label: string; busy: boolean; onApprove: () => Promise<boolean | undefined>; onDeny: (note: string) => Promise<boolean | undefined> }) {
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState("");
  return <div className={styles.decideRow}>
    <div className={styles.conflictRow}>
      <span>{label}</span>
      <button type="button" disabled={busy} onClick={() => void onApprove()}>Approve</button>
      <button type="button" disabled={busy} aria-expanded={denying} onClick={() => setDenying((v) => !v)}>Deny</button>
    </div>
    {denying && <div className={styles.correctionForm} role="group" aria-label="Deny the request">
      <textarea aria-label="Why the request is denied" placeholder="Why is it denied? (required, shown to the golfer)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className={styles.correctionActions}>
        <button type="button" onClick={() => { setDenying(false); setNote(""); }}>Cancel</button>
        <button type="button" disabled={busy || note.trim().length === 0} onClick={async () => { if (await onDeny(note.trim())) { setDenying(false); setNote(""); } }}>{busy ? "Saving…" : "Deny request"}</button>
      </div>
    </div>}
  </div>;
}

/** Read-only submission history: each revision with its stored hole-by-hole snapshot (never recalculated). */
export function RevisionHistory({ revisions }: { revisions: { revision: number; submittedAt: string; submittedByName: string; reason: string | null; isCurrent: boolean; card: RevisionHole[] }[] }) {
  return <details className={styles.history}>
    <summary>Submission history</summary>
    <ol>{[...revisions].sort((a, b) => b.revision - a.revision).map((r) => <li key={r.revision} data-current={r.isCurrent || undefined}>
      <details>
        <summary>Submission {r.revision} · {r.isCurrent ? "Current official" : "Superseded"} · {r.submittedByName} · {when(r.submittedAt)}{r.reason ? ` · Correction: ${r.reason}` : ""}</summary>
        <RevisionSnapshot card={r.card} />
      </details>
    </li>)}</ol>
  </details>;
}

function RevisionSnapshot({ card }: { card: RevisionHole[] }) {
  const mark = (value: string | null) => value && value in DIRECTION_MARK ? DIRECTION_MARK[value as Direction] : "—";
  const rows = [...card].sort((a, b) => a.hole - b.hole);
  const total = (pick: (h: RevisionHole) => number | null) => sumOf(rows.map(pick));
  return <table className={`${styles.scorecardTable} ${styles.snapshotTable}`} aria-label="Submitted scores">
    <thead><tr>{["Hole", "Score", "PUT", "FWY", "GRN", "Attest"].map((h) => <th key={h} scope="col" className={styles.section}>{h}</th>)}</tr></thead>
    <tbody>
      {rows.map((h) => <tr key={h.hole}><th scope="row" className={styles.section}>{h.hole}</th><td className={`${styles.section} ${styles.myScore}`}>{h.strokes ?? "—"}</td>
        <td className={styles.section}>{h.putts ?? "—"}</td><td className={styles.section}>{mark(h.fairway)}</td><td className={styles.section}>{mark(h.green)}</td>
        <td className={styles.section}>{h.attestStrokes ?? "—"}</td></tr>)}
      <tr className={styles.totalRow}><th scope="row" className={styles.section}>Total</th><td className={`${styles.section} ${styles.myScore}`}>{total((h) => h.strokes)}</td>
        <td className={styles.section}>{total((h) => h.putts)}</td><td className={styles.section} /><td className={styles.section} /><td className={styles.section}>{total((h) => h.attestStrokes)}</td></tr>
    </tbody>
  </table>;
}

/** Step 6: which holes an approved correction reopened, and what the golfer is still waiting for. */
function CorrectionNotes({ open, awaiting, attesteeName }: { open?: { own: number[] | null; attest: number[] | null }; awaiting: number[]; attesteeName: string }) {
  if (!open?.own && !open?.attest) return null;
  return <>
    {open.own && <p className={styles.syncStatus} data-state="saved" role="status">Correction open · only hole {open.own.join(", ")} can change{awaiting.length ? ` · waiting for your attester to re-attest hole ${awaiting.join(", ")}` : ""}</p>}
    {open.attest && <p className={styles.syncStatus} data-state="saved" role="status">Re-attest {attesteeName}: enter hole {open.attest.join(", ")} again</p>}
  </>;
}

type Direction = ShotResult;
const DIRECTION_MARK: Record<Direction, string> = { up: "↑", left: "←", center: "✓", right: "→", down: "↓" };

/** A score total, or "—" until any hole has a number. */
function sumOf(values: (number | null | undefined)[]): number | "—" {
  return values.some((v) => v != null) ? values.reduce<number>((total, v) => total + (v ?? 0), 0) : "—";
}

/** The GPS section of the scoring sheet: the current hole's yardages. Look only for now: no GPS data yet, so distances show "—". */
function GpsSection({ hole, holePar }: { hole: number; holePar: number | undefined }) {
  return <section className={styles.gps} aria-label="GPS">
    <div className={styles.holeTitle}>
      <span className={styles.holeNumber}>Hole {hole}</span>
      <span className={styles.holePar}>Par {holePar ?? "—"}</span>
    </div>
    <dl className={styles.summary}>
      <div><dt>Front</dt><dd>—</dd></div>
      <div><dt>Middle</dt><dd>—</dd></div>
      <div><dt>Back</dt><dd>—</dd></div>
    </dl>
    <p className={styles.gpsNote}>Yards to the green will show here once GPS is connected.</p>
  </section>;
}

/**
 * The Scorecard section of the scoring sheet, one row per hole (Out after 9, In after 18, then Total). Columns, left to right:
 * the hole (number, yardage, par), my round (score, fairway, green, putts), then the opponent's score; lines split the three groups.
 * Fairway / green show ✓ for a hit or an arrow for the miss (blank fairway on par 3s); totals count hits. Yardage isn't known yet ("—").
 */
/** Scorecard shapes, as on the leaderboard card: birdie circle, eagle-or-better double circle, bogey box,
 *  double-bogey-or-worse double box; par has none. */
function scoreShape(toPar: number): string {
  const shape = toPar <= -2 ? `${styles.shapeCircle} ${styles.shapeDouble}` : toPar === -1 ? styles.shapeCircle
    : toPar === 1 ? styles.shapeBox : toPar >= 2 ? `${styles.shapeBox} ${styles.shapeDouble}` : "";
  return `${styles.shape} ${shape}`;
}

/** A name's last word, at most 8 letters, for a scorecard column heading. */
const shortName = (name: string) => (name.trim().split(/\s+/).at(-1) ?? name).slice(0, 8);

/**
 * Three sections, each lightly tinted maroon with a narrow clear gap between them: the hole (Hole · Yds · Par, against the
 * left edge), your stats (FWY · GRN · PUT), then the scores (your last name · the opponent's last name, up to 8 letters).
 */
function ScorecardSection({ par, holes, opponentHoles, playerName, opponentName, putts, fairways, greens, myTotal, opponentTotal, myCheck, opponentCheck, edits }: {
  par?: number[]; holes: (number | null)[]; opponentHoles: (number | null)[]; playerName: string; opponentName: string;
  myTotal: number | "—"; opponentTotal: number | "—"; myCheck: "ok" | "wrong" | null; opponentCheck: "ok" | "wrong" | null;
  putts: (number | null)[]; fairways: (Direction | null)[]; greens: (Direction | null)[]; edits?: ScoreEdit[];
}) {
  // Organizer changes (add-on decision 9): a gold mark on the hole; tapping it shows the reason under the card.
  const [shownEdit, setShownEdit] = useState<number | null>(null);
  const editsFor = (hole: number) => (edits ?? []).filter((e) => e.hole === hole);
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
  const mark = (value: Direction | null) => value ? DIRECTION_MARK[value] : "—";
  const hits = (values: (Direction | null)[], index: number[]) => index.some((i) => values[i] !== null) ? index.filter((i) => values[i] === "center").length : "—";
  const gap = <td className={styles.sectionGap} aria-hidden />;
  // An untouched hole counts as par (as on the scoring screen), shown faded until it's entered.
  const scoreCell = (strokes: number | null, i: number) => strokes === null
    ? par?.[i] !== undefined ? <span className={styles.untouchedScore}>{par[i]}</span> : "—"
    : par?.[i] === undefined ? strokes : <span className={scoreShape(strokes - par[i])}>{strokes}</span>;
  const holeRow = (i: number) => <tr key={i}>
    <th scope="row" className={styles.section}>{i + 1}{editsFor(i + 1).length > 0 && <button type="button" className={styles.editMark} aria-label={`Hole ${i + 1} edited by organizer`} onClick={() => setShownEdit(shownEdit === i + 1 ? null : i + 1)}>✎</button>}</th><td className={styles.section}>—</td><td className={styles.section}>{par?.[i] ?? "—"}</td>{gap}
    <td className={styles.section}>{par?.[i] === 3 ? "" : mark(fairways[i])}</td><td className={styles.section}>{mark(greens[i])}</td><td className={styles.section}>{putts[i] ?? "—"}</td>{gap}
    <td className={`${styles.section} ${styles.myScore}`}>{scoreCell(holes[i], i)}</td><td className={styles.section}>{scoreCell(opponentHoles[i], i)}</td>
  </tr>;
  const totalRow = (label: string, index: number[]) => <tr key={label} className={styles.totalRow}>
    <th scope="row" className={styles.section}>{label}</th><td className={styles.section}>—</td><td className={styles.section}>{sumOf(index.map((i) => par?.[i]))}</td>{gap}
    <td className={styles.section}>{hits(fairways, index)}</td><td className={styles.section}>{hits(greens, index)}</td><td className={styles.section}>{sumOf(index.map((i) => putts[i]))}</td>{gap}
    <td className={`${styles.section} ${styles.myScore}`}>{sumOf(index.map((i) => holes[i] ?? par?.[i]))}</td><td className={styles.section}>{sumOf(index.map((i) => opponentHoles[i] ?? par?.[i]))}</td>
  </tr>;
  return <section className={styles.scorecardView} aria-label="Scorecard">
    <table className={styles.scorecardTable}>
      <colgroup>{["10%", "10%", "9%", "3%", "10%", "10%", "9%", "3%", "18%", "18%"].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
      <thead><tr>
        <th scope="col" className={styles.section}>Hole</th><th scope="col" className={styles.section}>Yds</th><th scope="col" className={styles.section}>Par</th><th className={styles.sectionGap} aria-hidden />
        <th scope="col" className={styles.section}>FWY</th><th scope="col" className={styles.section}>GRN</th><th scope="col" className={styles.section}>PUT</th><th className={styles.sectionGap} aria-hidden />
        <th scope="col" className={`${styles.section} ${styles.nameHead}`} title={playerName}>{shortName(playerName)}</th>
        <th scope="col" className={`${styles.section} ${styles.nameHead}`} title={opponentName}>{shortName(opponentName)}</th>
      </tr></thead>
      <tbody>
        {range(0, 9).map(holeRow)}
        {totalRow("Out", range(0, 9))}
        {range(9, 18).map(holeRow)}
        {totalRow("In", range(9, 18))}
        {totalRow("Total", range(0, 18))}
      </tbody>
    </table>
    {shownEdit !== null && editsFor(shownEdit).map((e, k) => <p key={k} className={styles.editNote}>Hole {e.hole} edited by organizer{e.kind === "pushThrough" ? " (push-through)" : ""}: {String(e.from ?? "—")} → {String(e.to ?? "—")}. {e.reason}</p>)}
    {/* Under Total: each player's last name and total score, centered in their half; a long name shrinks to fit. */}
    <dl className={styles.scorecardTotals}>
      <div data-check={myCheck ?? undefined} aria-label={myCheck === "wrong" ? `${playerName}: scores don't match` : undefined}><dt title={playerName} style={{ "--chars": shortName(playerName).length } as CSSProperties}>{shortName(playerName)}</dt><dd>{myTotal}</dd></div>
      <div data-check={opponentCheck ?? undefined} aria-label={opponentCheck === "wrong" ? `${opponentName}: scores don't match` : undefined}><dt title={opponentName} style={{ "--chars": shortName(opponentName).length } as CSSProperties}>{shortName(opponentName)}</dt><dd>{opponentTotal}</dd></div>
    </dl>
  </section>;
}

function ScoreCard({ label, strokes, holePar, step, disabled = false, compact = false }: { label: string; strokes: number | null; holePar: number | undefined; step: (delta: number) => void; disabled?: boolean; compact?: boolean }) {
  return <div className={`${styles.scoreCard} ${compact ? styles.scoreCardCompact : ""}`}>
    <span className={styles.scoreCardLabel}>{label}</span>
    <div className={styles.stepper}>
      <button type="button" className={styles.stepButton} aria-label={`One less stroke for ${label}`} disabled={disabled} onClick={() => step(-1)}><Minus size={compact ? 20 : 26} strokeWidth={2.5} aria-hidden /></button>
      <div className={`${styles.strokes} ${compact ? styles.strokesCompact : ""}`} aria-live="polite">
        <span className={strokes === null && holePar === undefined ? styles.strokesEmpty : ""}>{strokes ?? holePar ?? "—"}</span>
      </div>
      <button type="button" className={styles.stepButton} aria-label={`One more stroke for ${label}`} disabled={disabled} onClick={() => step(1)}><Plus size={compact ? 20 : 26} strokeWidth={2.5} aria-hidden /></button>
    </div>
  </div>;
}

/** Where the shot finished: ✓ in the middle for a hit, or the arrow for the miss. Tapping the picked one again clears it. */
function Compass({ label, value, onChange, disabled = false }: { label: string; value: Direction | null; onChange: (value: Direction | null) => void; disabled?: boolean }) {
  const button = (direction: Direction, className: string, name: string) => <button type="button" className={className} aria-label={`${label} ${name}`}
    aria-pressed={value === direction} disabled={disabled} onClick={() => onChange(value === direction ? null : direction)}>
    <span>{DIRECTION_MARK[direction]}</span>
  </button>;
  return <div className={styles.compass} aria-label={label}>
    <span className={styles.compassLabel}>{label}</span>
    <div className={styles.compassDial}>
      {button("up", `${styles.compassButton} ${styles.directionUp}`, "long")}
      {button("left", `${styles.compassButton} ${styles.directionLeft}`, "left")}
      {button("center", styles.compassCenter, "hit")}
      {button("right", `${styles.compassButton} ${styles.directionRight}`, "right")}
      {button("down", `${styles.compassButton} ${styles.directionDown}`, "short")}
    </div>
  </div>;
}

function randomOpponentName(): string {
  const names = ["Higgins", "Mason", "Patel", "Nguyen", "Bennett", "Walters", "Miller", "Chavez"];
  return names[Math.floor(Math.random() * names.length)];
}

function formatToPar(value: number): string {
  return value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
}

