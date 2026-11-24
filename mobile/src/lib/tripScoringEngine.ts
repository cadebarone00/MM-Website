import { createScoringSync, type QueueStorage, type SendBatch } from "@/lib/platform/scoringSync";
import type { QueueChange, QueueScope } from "@/lib/platform/scoringQueue";
import type { TripRoundScoring } from "@/lib/platform/tripScoring";

/** Serialize queue edits and synchronization so nothing is sent before the device confirms storage. */
export function tripScoringEngine(options: { scope: QueueScope; storage: QueueStorage; send: SendBatch; newId: () => string; now: () => string; onChange?: () => void; onScoring?: (scoring: TripRoundScoring) => void }) {
  const engine = createScoringSync(options);
  let work = Promise.resolve();
  let failed = false;
  const serialize = (action: () => Promise<void>) => {
    const next = work.then(async () => {
      if (failed) throw new Error("Scoring storage is unavailable");
      try { await action(); } catch (error) { failed = true; throw error; }
    });
    work = next.catch(() => {});
    return next;
  };
  return {
    load: () => serialize(() => engine.load()),
    edit: (change: QueueChange, version: number) => serialize(() => engine.edit(change, version)),
    resolve: (key: string, choice: "mine" | "saved") => serialize(() => engine.resolve(key, choice)),
    sync: () => serialize(() => engine.sync()),
    ops: engine.ops,
    status: engine.status,
    blocked: engine.blocked,
    storageFailed: () => failed,
  };
}
