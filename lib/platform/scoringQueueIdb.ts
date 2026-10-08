import type { QueuedOp, QueueScope } from "./scoringQueue";
import type { QueueStorage } from "./scoringSync";

/**
 * Browser storage for the offline scoring queue (Step 4): IndexedDB, so queued scores survive closing the app,
 * refreshing and reopening. Every record is stamped with its scope (signed-in golfer + trip + round) and only that
 * scope is ever read, so one account's queue is never loaded under another. Client-only.
 */
const DB_NAME = "maroon-scoring-queue";
const STORE = "ops";
type Row = QueuedOp & { scope: string };
const scopeId = (s: QueueScope) => `${s.profileId}|${s.tripId}|${s.roundNumber}`;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "key" });
      store.createIndex("scope", "scope");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });

/** IndexedDB queue storage, or null where the browser has none (then the caller keeps the queue in memory). */
export function idbQueueStorage(): QueueStorage | null {
  if (typeof indexedDB === "undefined") return null;
  let db: Promise<IDBDatabase> | null = null;
  const database = () => (db ??= open());
  return {
    async load(scope) {
      const tx = (await database()).transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).index("scope").getAll(scopeId(scope));
      await done(tx);
      return (request.result as Row[]).map(({ scope: _scope, ...op }) => { void _scope; return op; });
    },
    async replace(scope, ops) {
      // One transaction: the old rows for this scope go and the new ones land together, or nothing changes.
      const tx = (await database()).transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const keys = store.index("scope").getAllKeys(scopeId(scope));
      keys.onsuccess = () => {
        for (const key of keys.result) store.delete(key);
        for (const op of ops) store.put({ ...op, scope: scopeId(scope) } satisfies Row);
      };
      await done(tx);
    },
  };
}
