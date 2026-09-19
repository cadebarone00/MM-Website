/**
 * A handicap round that was started but not submitted. Everything about it
 * already lives in this browser's localStorage (the hole-entry wizard saves
 * as you go); this file is the one place that knows the key names and how to
 * read, summarize, and delete that saved state, so the wizard, the hole
 * screen, and the My Handicap home page can never disagree about them.
 * Device-only: a round started on one device isn't visible on another.
 */

export const handicapWizardKey = (playerSlug: string) => `handicap-wizard:${playerSlug}`;
export const handicapHolesKey = (playerSlug: string, submissionId: string) => `handicap-holes:${playerSlug}:${submissionId}`;
export const handicapHoleKey = (playerSlug: string, submissionId: string) => `${handicapHolesKey(playerSlug, submissionId)}:hole`;

type StorageReader = Pick<Storage, "getItem">;
type StorageEraser = Pick<Storage, "removeItem">;

export interface RoundInProgress {
  submissionId: string;
  courseName: string;
  teeName: string;
  rating: number;
  slope: number;
  datePlayed: string;
  /** The hole the player was on when they left. */
  hole: number;
  /** Strokes over/under par through that hole, exactly as the hole screen's header shows it. */
  toPar: number | null;
}

/** The raw saved strings behind a round in progress; strings compare by value, which is what lets a UI subscribe to them cheaply. */
export interface RoundInProgressRaw {
  wizard: string | null;
  draft: string | null;
  hole: string | null;
}

/** Score and to-par through `selectedHole`, matching what the hole screen's Total / To Par header shows. */
export function runningTotals(
  holes: { number: number; par: number }[],
  draft: Record<number, { score: string } | undefined>,
  selectedHole: number
): { totalScore: number; toPar: number | null } {
  const entered = holes.filter((hole) => hole.number <= selectedHole && Number(draft[hole.number]?.score) > 0);
  const totalScore = entered.reduce((sum, hole) => sum + Number(draft[hole.number]!.score), 0);
  const toPar = entered.length > 0 ? totalScore - entered.reduce((sum, hole) => sum + hole.par, 0) : null;
  return { totalScore, toPar };
}

function savedValue(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    const stored = JSON.parse(raw);
    return stored?.version === 1 ? stored.value : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Null unless the wizard is on the hole-entry step with a complete setup. */
export function parseRoundInProgress(raw: RoundInProgressRaw): RoundInProgress | null {
  const wizard = savedValue(raw.wizard);
  if (!isRecord(wizard) || wizard.step !== "holes" || !isRecord(wizard.setup)) return null;
  const { submissionId, course, teeSet, datePlayed } = wizard.setup;
  if (typeof submissionId !== "string" || !isRecord(course) || !isRecord(teeSet) || typeof datePlayed !== "string") return null;
  if (typeof course.name !== "string" || typeof teeSet.name !== "string" || typeof teeSet.rating !== "number" || typeof teeSet.slope !== "number" || !Array.isArray(teeSet.holes)) return null;
  const holes = teeSet.holes as { number: number; par: number }[];
  if (holes.length === 0) return null;

  const savedHole = Number(savedValue(raw.hole));
  const hole = Math.min(Math.max(1, Math.trunc(savedHole) || 1), holes.length);

  // A hole's score starts at its par; the draft only exists once the player has tapped something.
  const savedDraft = savedValue(raw.draft);
  const draft: Record<number, { score: string }> = {};
  for (const h of holes) {
    const entry = isRecord(savedDraft) ? savedDraft[h.number] : undefined;
    draft[h.number] = { score: isRecord(entry) && typeof entry.score === "string" ? entry.score : String(h.par) };
  }

  return {
    submissionId,
    courseName: course.name,
    teeName: teeSet.name,
    rating: teeSet.rating,
    slope: teeSet.slope,
    datePlayed,
    hole,
    toPar: runningTotals(holes, draft, hole).toPar,
  };
}

/** Reads the three saved pieces for this player's round in progress. */
export function readRoundInProgressRaw(storage: StorageReader, playerSlug: string): RoundInProgressRaw {
  const wizard = storage.getItem(handicapWizardKey(playerSlug));
  const submissionId = (savedValue(wizard) as { setup?: { submissionId?: unknown } } | undefined)?.setup?.submissionId;
  if (typeof submissionId !== "string") return { wizard, draft: null, hole: null };
  return { wizard, draft: storage.getItem(handicapHolesKey(playerSlug, submissionId)), hole: storage.getItem(handicapHoleKey(playerSlug, submissionId)) };
}

/** Removes a round's hole draft and saved hole (used once it's submitted). */
export function clearHandicapDraft(storage: StorageEraser, playerSlug: string, submissionId: string) {
  storage.removeItem(handicapHolesKey(playerSlug, submissionId));
  storage.removeItem(handicapHoleKey(playerSlug, submissionId));
}

/** Throws the round in progress away entirely: wizard state, hole draft, and saved hole. */
export function deleteRoundInProgress(storage: StorageReader & StorageEraser, playerSlug: string) {
  const { wizard } = readRoundInProgressRaw(storage, playerSlug);
  const submissionId = (savedValue(wizard) as { setup?: { submissionId?: unknown } } | undefined)?.setup?.submissionId;
  if (typeof submissionId === "string") clearHandicapDraft(storage, playerSlug, submissionId);
  storage.removeItem(handicapWizardKey(playerSlug));
}
