"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Plus, Share2 } from "lucide-react";
import { AddRound } from "./CodeTournamentCreate";
import { CutFields, cutSummary } from "./CodeTournamentCut";
import { TeeSheetEditor } from "./CodeTournamentTeeSheet";
import { formatCode, roundTeeSheet, type CodeTournament, type TournamentChange, type TournamentCut } from "@/lib/platform/codeTournaments";
import settingsStyles from "./GolfTripSettingsPreview.module.css";
import styles from "./CodeTournament.module.css";

type Panel = "Info" | "Rounds" | "Tee Sheet" | "Cut" | "Visibility";
const CARDS: Panel[] = ["Info", "Rounds", "Tee Sheet", "Cut", "Visibility"];
const roundDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * Tournament Settings (organizer only), opened from the settings wheel on the tournament page; the same look as Trip
 * Settings: a card for each part, each opening its own page. Info (join code, End tournament), Rounds (+ Add round),
 * Tee Sheet (each round's groups), Cut, and Public / Private (whether it shows in the Tourneys search and live feed).
 * `act` sends a change (or applies it, for the simulator's sample); the page reloads the tournament after each one.
 */
export function CodeTournamentSettings({ t, act, onClose }: { t: CodeTournament; act: (change: TournamentChange) => Promise<{ ok: boolean; message?: string }>; onClose: () => void }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const live = t.status === "live";
  async function send(change: TournamentChange, fallback: string) {
    const result = await act(change);
    setProblem(result.ok ? null : result.message ?? fallback);
    return result.ok;
  }
  const open = (next: Panel | null) => { setPanel(next); setProblem(null); };

  if (adding) return <AddRound minDate={t.rounds.at(-1)?.date} onCancel={() => setAdding(false)} onAdd={async (next) => {
    setAdding(false);
    await send({ action: "addRound", ...next }, "Couldn't add the round. Try again.");
  }} />;

  const detail: Record<Panel, string> = {
    Info: `Code ${formatCode(t.code)}${live ? "" : " · Final"}`,
    Rounds: `${t.rounds.length} ${t.rounds.length === 1 ? "round" : "rounds"}`,
    "Tee Sheet": t.rounds.some((r) => r.teeSheet) ? "Set by you" : "Automatic foursomes",
    Cut: t.cut ? cutSummary(t.cut) : "No cut",
    Visibility: t.isPublic ? "Public" : "Private",
  };

  return <main className={`${settingsStyles.page} ${panel ? settingsStyles.competitionPage : ""}`}>
    <div className={settingsStyles.content}>
      {panel ? <header className={settingsStyles.competitionHeader}>
        <button type="button" className={settingsStyles.close} aria-label="Back to tournament settings" onClick={() => open(null)}><ChevronLeft size={28} aria-hidden /></button>
        <h1>{panel === "Visibility" ? "Public or Private" : panel}</h1>
      </header> : <header className={settingsStyles.header}>
        <button type="button" className={`${settingsStyles.close} ${styles.plainButton}`} aria-label="Back to tournament" onClick={onClose}><ChevronLeft size={26} strokeWidth={1.75} aria-hidden /></button>
        <div className={settingsStyles.heading}><h1>{t.name}</h1><p>Tournament Settings</p></div>
      </header>}
      {problem && <p className={styles.status} role="alert">{problem}</p>}

      {!panel ? <section aria-label="Organizer settings" className={styles.settingsCards}>
        <h2 className={settingsStyles.settingsSectionHeading}>Organizer</h2>
        <div className={settingsStyles.grid}>
          {CARDS.map((title) => <button key={title} type="button" className={`${settingsStyles.card} ${settingsStyles.cardButton}`} onClick={() => open(title)}>
            <h2>{title === "Visibility" ? (t.isPublic ? "Public" : "Private") : title}</h2>
            <p className={styles.cardDetail}>{title === "Visibility" ? (t.isPublic ? "In the Tourneys search and live feed" : "Only players with the code") : detail[title]}</p>
          </button>)}
        </div>
      </section>
        : panel === "Info" ? <InfoPanel t={t} onEnd={async () => {
          if (!window.confirm(`End ${t.name} for everyone? Scores lock and it moves to Past Tournaments.`)) return;
          if (await send({ action: "end" }, "Couldn't end the tournament. Try again.")) onClose();
        }} />
        : panel === "Rounds" ? <section className={styles.settingsPanel} aria-label="Rounds">
          <ol className={styles.roundList}>{t.rounds.map((r) => <li key={r.number}>
            <span><b>Round {r.number}</b> · {r.setup.course.name}<small>{roundDate(r.date)}{r.setup.tee ? ` · ${r.setup.tee.name} tees` : ""} · {r.setup.course.par.length} holes</small></span>
          </li>)}</ol>
          {live && t.rounds.length < 10 && <button type="button" className={styles.settingsAction} onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Add a round</button>}
        </section>
        : panel === "Tee Sheet" ? <TeeSheetPanel t={t} live={live} onDone={() => open(null)}
          onSave={(round, teeSheet) => send({ action: "teeSheet", round, teeSheet }, "Couldn't save the tee sheet. Try again.")} />
        : panel === "Cut" ? <CutPanel t={t} live={live} onCancel={() => open(null)}
          onSave={async (cut) => { if (await send({ action: "cut", cut }, "Couldn't save the cut. Try again.")) open(null); }} />
        : <VisibilityPanel isPublic={Boolean(t.isPublic)} onChange={(isPublic) => send({ action: "public", isPublic }, "Couldn't change it. Try again.")} />}
    </div>
  </main>;
}

/** Info: the join code (copy / share), the tournament at a glance, and End tournament. */
function InfoPanel({ t, onEnd }: { t: CodeTournament; onEnd: () => void }) {
  const [copied, setCopied] = useState(false);
  const shown = formatCode(t.code);
  const message = `Join ${t.name} on The Maroon: open Tourneys and enter code ${shown}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const live = t.status === "live";
  return <section className={styles.settingsPanel} aria-label="Info">
    <div className={styles.watchRow}>
      <p>Players join with this code on Tourneys.</p>
      <p className={styles.bigCode} aria-label={`Join code ${shown.split("").join(" ")}`}>{shown}</p>
      <div className={styles.organizer}>
        <button type="button" className={styles.organizerButton} onClick={() => navigator.clipboard?.writeText(shown).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => {})}>
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? "Copied" : "Copy code"}</button>
        {canShare && <button type="button" className={styles.organizerButton} onClick={() => navigator.share({ title: t.name, text: message }).catch(() => {})}><Share2 size={15} aria-hidden="true" /> Share</button>}
      </div>
    </div>
    <dl className={styles.infoList}>
      <div><dt>Scoring</dt><dd>{t.scoring}</dd></div>
      <div><dt>Players</dt><dd>{t.players.length}</dd></div>
      <div><dt>Status</dt><dd>{live ? "Live" : "Final"}</dd></div>
    </dl>
    {t.players.length > 0 && <ul className={styles.infoPlayers}>{t.players.map((p) => <li key={p.profileId}><span>{p.name}</span>{p.handicap !== null && <small>HCP {p.handicap}</small>}</li>)}</ul>}
    {live && <button type="button" className={`${styles.settingsAction} ${styles.endButton}`} onClick={onEnd}>End tournament</button>}
  </section>;
}

/** Tee Sheet: pick the round, then edit its groups. */
function TeeSheetPanel({ t, live, onDone, onSave }: { t: CodeTournament; live: boolean; onDone: () => void; onSave: (round: number, sheet: ReturnType<typeof roundTeeSheet>) => Promise<boolean> }) {
  const [index, setIndex] = useState(0);
  const round = t.rounds[index];
  if (!live) return <p className={styles.status}>This tournament has ended, so its tee sheets can&apos;t change.</p>;
  if (!t.players.length) return <p className={styles.status}>No players yet. Once players join, set their groups here.</p>;
  return <section className={styles.settingsPanel} aria-label="Tee sheet">
    <div className={styles.roundStepper}>
      <button type="button" aria-label="Previous round" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
      <span><b>Round {round.number}</b><small>{round.setup.course.name} · {roundDate(round.date)}</small></span>
      <button type="button" aria-label="Next round" disabled={index >= t.rounds.length - 1} onClick={() => setIndex(index + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
    </div>
    <TeeSheetEditor key={round.number} t={t} sheet={roundTeeSheet(t, round.number)} holes={round.setup.course.par.length} onCancel={onDone}
      onSave={async (sheet) => { if (await onSave(round.number, sheet)) onDone(); }} />
  </section>;
}

/** Cut: the same questions as Create. */
function CutPanel({ t, live, onCancel, onSave }: { t: CodeTournament; live: boolean; onCancel: () => void; onSave: (cut: TournamentCut | null) => Promise<void> }) {
  const [draft, setDraft] = useState<TournamentCut | null | undefined>(t.cut ?? null);
  const [saving, setSaving] = useState(false);
  if (!live) return <p className={styles.status}>{t.cut ? `Cut: ${cutSummary(t.cut)}.` : "No cut."} This tournament has ended, so it can&apos;t change.</p>;
  return <section className={`${styles.settingsPanel} ${styles.cutEditor}`} aria-label="Cut">
    <CutFields initial={t.cut ?? null} rounds={t.rounds.length} net={t.scoring === "Net"} onChange={setDraft}
      css={{ field: styles.cutField, choices: styles.cutChoices, blurb: styles.cutBlurb }} />
    <div className={styles.organizer}>
      <button type="button" className={styles.organizerButton} onClick={onCancel}>Cancel</button>
      <button type="button" className={`${styles.organizerButton} ${styles.teeSave}`} disabled={draft === undefined || saving}
        onClick={async () => { setSaving(true); await onSave(draft ?? null); setSaving(false); }}>{saving ? "Saving…" : "Save cut"}</button>
    </div>
  </section>;
}

/** Public or Private: saved as soon as it's tapped. */
function VisibilityPanel({ isPublic, onChange }: { isPublic: boolean; onChange: (isPublic: boolean) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const choose = async (next: boolean) => { if (next === isPublic) return; setBusy(true); await onChange(next); setBusy(false); };
  return <section className={`${styles.settingsPanel} ${styles.cutEditor}`} aria-label="Public or private">
    <div className={styles.cutChoices}>
      {([[false, "Private"], [true, "Public"]] as const).map(([value, label]) =>
        <button key={label} type="button" aria-pressed={isPublic === value} disabled={busy} onClick={() => void choose(value)}>{label}</button>)}
    </div>
    <p className={styles.cutBlurb}>{isPublic
      ? "Anyone can find this tournament in the Tourneys search and the Live Tournaments feed, and follow its leaderboard and tee sheet. Only players with the code can join."
      : "Only people with the code can find this tournament. It doesn't show in the Tourneys search or the Live Tournaments feed."}</p>
  </section>;
}
