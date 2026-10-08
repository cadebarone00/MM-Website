import { applyResults, batches, enqueue, queueStatus, resolveConflict, type OpResult, type QueueChange, type QueuedOp, type QueueScope } from "./scoringQueue";
import type { TripRoundScoring } from "./tripScoring";

/**
 * The offline sync engine (Player & Attest Step 4): every change is written to durable storage first (IndexedDB in the
 * browser, see scoringQueueIdb.ts), then sent when the network allows. Storage is scoped to the signed-in golfer, trip
 * and round, so another account's queue is never loaded or sent. A failed / offline / signed-out send keeps everything.
 */

export interface QueueStorage {
  load(scope: QueueScope): Promise<QueuedOp[]>;
  /** Replace everything stored for this scope with `ops`. */
  replace(scope: QueueScope, ops: QueuedOp[]): Promise<void>;
}
export type SendResult =
  | { ok: true; results: OpResult[]; scoring: TripRoundScoring | null }
  | { ok: false; reason: "offline" | "signed-out" | "wrong-account" | "error" };
export type SendBatch = (batch: { groupId: string; scoredProfileId: string; ops: QueuedOp[] }) => Promise<SendResult>;

export function createScoringSync({ storage, send, scope, newId, now, onChange, onScoring }: {
  storage: QueueStorage; send: SendBatch; scope: QueueScope; newId: () => string; now: () => string;
  onChange?: () => void; onScoring?: (scoring: TripRoundScoring) => void;
}) {
  let ops: QueuedOp[] = [];
  let running: Promise<void> | null = null;
  let blockedBy: "signed-out" | "wrong-account" | null = null;
  // Writes go one after another, so a slow write can never land after (and undo) a newer one.
  let writing: Promise<void> = Promise.resolve();
  const persist = () => { const snapshot = ops; writing = writing.then(() => storage.replace(scope, snapshot)); return writing; };
  const mine = (o: QueuedOp) => o.profileId === scope.profileId && o.tripId === scope.tripId && o.roundNumber === scope.roundNumber;

  async function syncOnce() {
    for (const batch of batches(ops)) {
      const result = await send(batch);
      if (!result.ok) {
        if (result.reason === "signed-out" || result.reason === "wrong-account") blockedBy = result.reason;
        break; // keep everything; try again on the next sync
      }
      blockedBy = null;
      ops = applyResults(ops, result.results);
      await persist();
      if (result.scoring) onScoring?.(result.scoring);
      onChange?.();
    }
  }

  return {
    async load() { ops = (await storage.load(scope)).filter(mine); onChange?.(); },
    /** Queue a change (saved to storage before anything is sent). */
    async edit(change: QueueChange, serverVersion: number) { ops = enqueue(ops, change, serverVersion, newId, now()); onChange?.(); await persist(); },
    async resolve(key: string, choice: "mine" | "saved") { ops = resolveConflict(ops, key, choice, newId); onChange?.(); await persist(); },
    /** Send what's pending. Calls while a sync is running join it instead of sending twice. */
    sync(): Promise<void> {
      if (!running) running = syncOnce().finally(() => { running = null; });
      return running;
    },
    ops: () => ops,
    status: () => queueStatus(ops),
    blocked: () => blockedBy,
  };
}

/** In-memory storage (tests, and a fallback where IndexedDB is unavailable). */
export function memoryQueueStorage(): QueueStorage {
  const all = new Map<string, QueuedOp[]>();
  const id = (s: QueueScope) => `${s.profileId}|${s.tripId}|${s.roundNumber}`;
  return {
    async load(scope) { return structuredClone(all.get(id(scope)) ?? []); },
    async replace(scope, ops) { all.set(id(scope), structuredClone(ops)); },
  };
}
