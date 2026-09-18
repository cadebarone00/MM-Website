"use client";

import { Check, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Pencil, type LucideIcon } from "lucide-react";
import { firstIncompleteHole, isRoundComplete, type RecapHoleRow, type RecapShotDirection } from "@/lib/portal/roundRecap";
import { ScoreBubble } from "./ScorePicker";

function formatToPar(toPar: number | null): string {
  if (toPar == null) return "—";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

const PUTTS_OPTIONS = [0, 1, 2, 3, 4] as const;

function PuttsDots({ value }: { value: number | null }) {
  if (value == null) return <span className="font-sans text-sm text-ink-400">N/A</span>;
  return (
    <div className="flex gap-1.5">
      {PUTTS_OPTIONS.map((n) => {
        const selected = n === 4 ? value >= 4 : value === n;
        return (
          <span key={n} className={`flex h-8 w-8 items-center justify-center rounded-full border font-sans text-xs font-semibold ${selected ? "border-maroon-700 bg-maroon-700 text-white" : "border-ink-200 text-ink-500"}`}>
            {n === 4 ? "4+" : n}
          </span>
        );
      })}
    </div>
  );
}

const DIRECTION_ICONS: { key: RecapShotDirection | "hit"; icon: LucideIcon; label: string }[] = [
  { key: "long", icon: ArrowUp, label: "missed long" },
  { key: "left", icon: ArrowLeft, label: "missed left" },
  { key: "hit", icon: Check, label: "hit" },
  { key: "right", icon: ArrowRight, label: "missed right" },
  { key: "short", icon: ArrowDown, label: "missed short" },
];

/** Read-only compass strip: 4 miss-direction icons + a center check, matching ShotDirectionPicker's icon set. GIR also shows a Penalty pill when that's what was recorded. */
function DirectionDots({ hit, direction, penaltyOption }: { hit: boolean | null; direction: RecapShotDirection | null; penaltyOption?: boolean }) {
  if (hit == null) return <span className="font-sans text-sm text-ink-400">N/A</span>;
  const selectedKey: RecapShotDirection | "hit" | null = hit ? "hit" : direction === "penalty" ? null : direction;
  return (
    <div className="flex items-center gap-1.5">
      {DIRECTION_ICONS.map(({ key, icon: Icon, label }) => {
        const selected = key === selectedKey;
        return (
          <span key={key} aria-label={label} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${selected ? "border-maroon-700 bg-maroon-700 text-white" : "border-ink-200 text-ink-300"}`}>
            <Icon size={14} />
          </span>
        );
      })}
      {penaltyOption && (
        <span className={`whitespace-nowrap rounded-full border px-2 py-1 font-condensed text-2xs font-bold uppercase tracking-wide ${direction === "penalty" ? "border-maroon-700 bg-maroon-700 text-white" : "border-ink-200 text-ink-300"}`}>
          Pen
        </span>
      )}
    </div>
  );
}

function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-3">
      <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</span>
      {children}
    </div>
  );
}

function PlayerStatLines({ row }: { row: RecapHoleRow }) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <StatRow label="Score"><ScoreBubble score={row.score!} par={row.par} tone="light" /></StatRow>
      <StatRow label="Putts"><PuttsDots value={row.putts} /></StatRow>
      <StatRow label="Green In Regulation"><DirectionDots hit={row.gir} direction={row.girDirection} penaltyOption /></StatRow>
      <StatRow label="Fairway Hit"><DirectionDots hit={row.fir} direction={row.firDirection} /></StatRow>
    </div>
  );
}

function HoleRecapRow({ row, competitor, onEdit }: {
  row: RecapHoleRow;
  competitor?: { label: string; row?: RecapHoleRow; statusLabel?: string | null };
  onEdit: () => void;
}) {
  return (
    <div className="px-4 py-3">
      <button type="button" onClick={onEdit} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="font-condensed text-sm font-bold uppercase tracking-wide text-maroon-800">
          Hole {row.hole} &middot; Par {row.par} &middot; {row.yards} yds
        </span>
        <Pencil size={16} aria-hidden className="shrink-0 text-ink-400" />
        <span className="sr-only">Edit hole {row.hole}</span>
      </button>
      {row.score == null ? (
        <p className="mt-1 font-sans text-sm italic text-ink-400">Not entered yet</p>
      ) : (
        <>
          <PlayerStatLines row={row} />
          {competitor && (
            <div className="mt-3 border-t border-dashed border-ink-100 pt-2">
              <p className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-400">
                {competitor.label}
                {competitor.statusLabel ? ` · ${competitor.statusLabel}` : ""}
              </p>
              {competitor.row?.score == null ? (
                <p className="mt-1 font-sans text-sm italic text-ink-400">Not entered yet</p>
              ) : (
                <PlayerStatLines row={competitor.row} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export interface RoundRecapCompetitor {
  label: string;
  rows: RecapHoleRow[];
  /** e.g. "Confirmed" / "Scores disagree" per hole, from the live-scoring confirm/dispute status. */
  statusLabel?: (hole: number) => string | null;
}

/**
 * Scrollable hole-by-hole recap: one block per hole (score/putts/GIR/fairway),
 * tap a hole to jump back and fix it. Shared by the handicap "Submit a
 * score" flow and live scoring — live scoring passes `competitor` to show
 * the playing partner's entries in a second row per hole, and omits
 * `onSubmit` since it still submits hole-by-hole as it does today.
 */
export function RoundRecapCard({
  rows,
  totalScore,
  toPar,
  onEditHole,
  onBack,
  competitor,
  onSubmit,
  submitting,
  submitError,
}: {
  rows: RecapHoleRow[];
  totalScore: number;
  toPar: number | null;
  onEditHole: (hole: number) => void;
  onBack: () => void;
  competitor?: RoundRecapCompetitor;
  onSubmit?: () => void;
  submitting?: boolean;
  submitError?: string | null;
}) {
  const complete = isRoundComplete(rows);
  const nextIncomplete = firstIncompleteHole(rows);

  return (
    <div className="rounded-md border border-ink-100 bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <div>
          <h1 className="font-serif text-xl font-bold text-ink-900">Round Recap</h1>
          <p className="font-condensed text-sm font-semibold uppercase tracking-wide text-maroon-700">
            Total {totalScore} &middot; To par {formatToPar(toPar)}
          </p>
        </div>
        <button type="button" onClick={onBack} disabled={submitting} className="font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Back</button>
      </div>

      {!complete && nextIncomplete != null && (
        <div className="flex items-center justify-between gap-3 bg-gold-100 px-4 py-2">
          <span className="font-sans text-sm text-ink-700">Not every hole is entered yet.</span>
          <button type="button" onClick={() => onEditHole(nextIncomplete)} className="shrink-0 font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700 underline">
            Go to hole {nextIncomplete}
          </button>
        </div>
      )}

      <div className="max-h-[60vh] divide-y divide-ink-100 overflow-y-auto">
        {rows.map((row) => (
          <HoleRecapRow
            key={row.hole}
            row={row}
            competitor={competitor ? { label: competitor.label, row: competitor.rows.find((r) => r.hole === row.hole), statusLabel: competitor.statusLabel?.(row.hole) } : undefined}
            onEdit={() => onEditHole(row.hole)}
          />
        ))}
      </div>

      {onSubmit && (
        <div className="p-4">
          {submitError && <p aria-live="polite" className="mb-2 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{submitError}</p>}
          <button
            type="button"
            disabled={!complete || submitting}
            onClick={onSubmit}
            className="w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
          >
            {submitting ? "Submitting…" : complete ? "Submit Round" : "Finish all 18 holes to submit"}
          </button>
        </div>
      )}
    </div>
  );
}
