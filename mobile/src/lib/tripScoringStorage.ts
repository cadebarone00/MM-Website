import type { QueueScope, QueuedOp } from "@/lib/platform/scoringQueue";
import type { QueueStorage } from "@/lib/platform/scoringSync";

type Store = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
const keyFor = (scope: QueueScope) => `maroon.tripScoring.v1:${encodeURIComponent(scope.profileId)}:${encodeURIComponent(scope.tripId)}:${scope.roundNumber}`;

/** Keep pending changes separate for each account, trip and round. Never hide storage failures. */
export function tripScoringStorage(store: Store): QueueStorage {
  return {
    async load(scope) {
      const raw = await store.getItem(keyFor(scope));
      if (raw === null) return [];
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) throw new Error("Invalid saved scoring queue");
      return (value as QueuedOp[]).filter(op => op && op.profileId === scope.profileId && op.tripId === scope.tripId && op.roundNumber === scope.roundNumber);
    },
    async replace(scope, ops) {
      if (ops.some(op => op.profileId !== scope.profileId || op.tripId !== scope.tripId || op.roundNumber !== scope.roundNumber)) throw new Error("Scoring queue scope mismatch");
      await store.setItem(keyFor(scope), JSON.stringify(ops));
    },
  };
}
