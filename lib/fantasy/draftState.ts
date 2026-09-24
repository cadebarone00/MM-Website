//
// A fantasy lineup being drafted but not yet submitted. Held in
// sessionStorage, keyed by tournament, so it survives navigating away to a
// player's profile page (to tap "Draft") and back - that's a real route
// change that unmounts the Fantasy page entirely. Device-only, cleared on a
// successful submit. Mirrors the {version, value} wrapper and injectable-
// storage convention lib/handicap/roundInProgress.ts already uses.

export type FantasySlot = "maroon" | "white" | "wildcard";
export type DraftPicks = Record<FantasySlot, string | null>;

export const EMPTY_DRAFT_PICKS: DraftPicks = { maroon: null, white: null, wildcard: null };

const SLOTS: FantasySlot[] = ["maroon", "white", "wildcard"];

/** Type guard for the three valid slot values - the one place that list is defined, reused anywhere a slot arrives as untyped input (e.g. a query param). */
export function isFantasySlot(value: unknown): value is FantasySlot {
  return typeof value === "string" && (SLOTS as string[]).includes(value);
}

export function draftStateKey(tournamentSlug: string): string {
  return `fantasy-draft:${tournamentSlug}`;
}

export function draftTeamNameKey(tournamentSlug: string): string {
  return `fantasy-draft-name:${tournamentSlug}`;
}

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const safeSessionStorage: StorageLike = {
  getItem(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Private browsing or storage disabled - the draft just won't survive a refresh this session.
    }
  },
  removeItem(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing to clear.
    }
  },
};

function isDraftPicks(value: unknown): value is DraftPicks {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return SLOTS.every((slot) => record[slot] === null || typeof record[slot] === "string");
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

function save(storage: StorageLike, tournamentSlug: string, picks: DraftPicks): void {
  storage.setItem(draftStateKey(tournamentSlug), JSON.stringify({ version: 1, value: picks }));
}

/** Whether a draft (started via "Make Your Selections" or "Edit Lineup") exists at all, even one with nothing picked yet. */
export function hasDraftInProgress(storage: StorageLike, tournamentSlug: string): boolean {
  return storage.getItem(draftStateKey(tournamentSlug)) !== null;
}

/** The picks drafted so far - all null if no draft has been started. */
export function readDraftPicks(storage: StorageLike, tournamentSlug: string): DraftPicks {
  const value = savedValue(storage.getItem(draftStateKey(tournamentSlug)));
  return isDraftPicks(value) ? value : { ...EMPTY_DRAFT_PICKS };
}

/** Records one slot's pick, keeping whatever else was already drafted. Returns the resulting picks. */
export function writeDraftPick(storage: StorageLike, tournamentSlug: string, slot: FantasySlot, player: string): DraftPicks {
  const next = { ...readDraftPicks(storage, tournamentSlug), [slot]: player };
  save(storage, tournamentSlug, next);
  return next;
}

/** Starts (or restarts) a draft from a known set of picks - used to begin an empty draft, or to seed "Edit Lineup" from the saved server picks. */
export function seedDraftPicks(storage: StorageLike, tournamentSlug: string, picks: DraftPicks): void {
  save(storage, tournamentSlug, picks);
}

/** Throws away the in-progress draft (picks and team name) - used once a submit succeeds, or the draft is cancelled. */
export function clearDraftPicks(storage: StorageLike, tournamentSlug: string): void {
  storage.removeItem(draftStateKey(tournamentSlug));
  storage.removeItem(draftTeamNameKey(tournamentSlug));
}

/** The team name typed so far in the in-progress draft - empty string if nothing's been typed. */
export function readDraftTeamName(storage: StorageLike, tournamentSlug: string): string {
  const value = savedValue(storage.getItem(draftTeamNameKey(tournamentSlug)));
  return typeof value === "string" ? value : "";
}

/** Records the team name typed so far - same {version, value} wrapper the picks use. */
export function writeDraftTeamName(storage: StorageLike, tournamentSlug: string, teamName: string): void {
  storage.setItem(draftTeamNameKey(tournamentSlug), JSON.stringify({ version: 1, value: teamName }));
}

export function isDraftComplete(picks: DraftPicks): picks is Record<FantasySlot, string> {
  return picks.maroon !== null && picks.white !== null && picks.wildcard !== null;
}

/** The earliest of Maroon/White/Wildcard that isn't picked yet, or null once all three are. */
export function nextEmptySlot(picks: DraftPicks): FantasySlot | null {
  return SLOTS.find((slot) => !picks[slot]) ?? null;
}
