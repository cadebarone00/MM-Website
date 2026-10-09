import type { HoleEntryInput } from "./tripScoring";

/**
 * Offline scoring queue (Player & Attest Step 4). Every score change waits here until the server confirms it. One entry
 * per (signed-in golfer, group, golfer scored, hole): my own card and my attest column are always separate entries.
 * Each entry carries a stable op id (a retry of the same op is a harmless duplicate on the server) and the server
 * version it was based on (if the saved score moved on in the meantime, the server answers "conflict" instead of
 * overwriting, and my entry is kept until I choose). Pure: storage and network live in scoringSync.ts.
 */

export interface QueueScope { profileId: string; tripId: string; roundNumber: number }
export interface QueuedOp extends QueueScope {
  key: string;
  opId: string;
  groupId: string;
  scoredProfileId: string;
  kind: "own" | "attest";
  entry: HoleEntryInput;
  /** The server's version of this hole when I started editing it (0 = nothing saved yet). */
  baseVersion: number;
  /** My earlier ops for this hole the server may already have (a lost answer): finding one of them isn't a conflict. */
  supersedes: string[];
  clientUpdatedAt: string;
  /** rejected = the card was submitted (locked), or the hole isn't part of an approved correction, before this reached the server: kept on the phone, never resent. */
  status: "pending" | "conflict" | "rejected";
  /** On conflict: what the server has now. */
  server?: { version: number; entry: HoleEntryInput };
}
export interface OpResult { opId: string; status: "applied" | "duplicate" | "conflict" | "locked"; version: number; server?: HoleEntryInput }
export type QueueChange = QueueScope & { groupId: string; scoredProfileId: string; kind: "own" | "attest"; entry: HoleEntryInput };

export const opKey = (o: { profileId: string; groupId: string; scoredProfileId: string; entry: { hole: number } }) => `${o.profileId}|${o.groupId}|${o.scoredProfileId}|${o.entry.hole}`;

/** Queue a change. A second change to the same hole replaces the first (new op id, same base version). */
export function enqueue(ops: QueuedOp[], change: QueueChange, serverVersion: number, newId: () => string, now: string): QueuedOp[] {
  const key = opKey(change);
  // A change refused because the card was locked doesn't carry over: after a reopen, start from the server's version.
  const prev = ops.find((o) => o.key === key && o.status !== "rejected");
  const next: QueuedOp = {
    ...change, key, opId: newId(), clientUpdatedAt: now,
    baseVersion: prev ? prev.baseVersion : serverVersion,
    supersedes: prev ? [...prev.supersedes, prev.opId].slice(-20) : [],
    status: prev?.status === "conflict" ? "conflict" : "pending",
    ...(prev?.server ? { server: prev.server } : {}),
  };
  return [...ops.filter((o) => o.key !== key), next];
}

/** Server answers: applied / duplicate leave the queue; conflict keeps my entry and records the server's. */
export function applyResults(ops: QueuedOp[], results: OpResult[]): QueuedOp[] {
  let out = ops;
  for (const r of results) {
    const op = out.find((o) => o.opId === r.opId);
    if (!op) continue; // already replaced by a newer edit, which stays queued
    out = r.status === "conflict"
      ? out.map((o) => o.opId === r.opId ? { ...o, status: "conflict" as const, server: { version: r.version, entry: r.server ?? { hole: o.entry.hole, strokes: null } } } : o)
      : r.status === "locked" ? markRejected(out, [r.opId]) // the hole isn't part of an approved correction
      : out.filter((o) => o.opId !== r.opId);
  }
  return out;
}

/** The golfer settles a conflict: keep mine (resent on top of the saved version) or use the saved score (mine dropped). */
export function resolveConflict(ops: QueuedOp[], key: string, choice: "mine" | "saved", newId: () => string): QueuedOp[] {
  const op = ops.find((o) => o.key === key);
  if (!op || op.status !== "conflict" || !op.server) return ops;
  if (choice === "saved") return ops.filter((o) => o.key !== key);
  const { server, ...rest } = op;
  return ops.map((o) => o.key === key ? { ...rest, opId: newId(), baseVersion: server.version, supersedes: [], status: "pending" as const } : o);
}

export const queueStatus = (ops: QueuedOp[]): "synced" | "pending" | "conflict" =>
  ops.some((o) => o.status === "conflict") ? "conflict" : ops.some((o) => o.status === "pending") ? "pending" : "synced";

/** The card these ops are for was submitted: keep them on the phone, stop sending them. */
export const markRejected = (ops: QueuedOp[], opIds: string[]): QueuedOp[] =>
  ops.map((o) => opIds.includes(o.opId) ? { ...o, status: "rejected" as const } : o);

/** Pending ops grouped into one request per (group, golfer scored). Conflicts wait for the golfer. */
export function batches(ops: QueuedOp[]): { groupId: string; scoredProfileId: string; ops: QueuedOp[] }[] {
  const out = new Map<string, { groupId: string; scoredProfileId: string; ops: QueuedOp[] }>();
  for (const o of ops.filter((x) => x.status === "pending")) {
    const id = `${o.groupId}|${o.scoredProfileId}`;
    out.set(id, { groupId: o.groupId, scoredProfileId: o.scoredProfileId, ops: [...(out.get(id)?.ops ?? []), o] });
  }
  return [...out.values()];
}
