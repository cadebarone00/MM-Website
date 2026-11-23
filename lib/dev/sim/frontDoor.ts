/** Pure helpers for the Scoring Simulator's front door. */

/** "cam.localhost:3005" -> "cam". Plain "localhost" (or an IP) -> null. */
export function personFromHost(host: string): string | null {
  const name = (host || "").split(":")[0].toLowerCase();
  if (!name.endsWith(".localhost")) return null;
  const person = name.slice(0, -".localhost".length);
  return /^[a-z0-9-]+$/.test(person) ? person : null;
}

/** A tiny page that wipes this phone's browser storage, then goes to `next`. */
export function loginPage(next: string): string {
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") && !/[\x00-\x1f\x7f]/.test(next) ? next : "/";
  const target = JSON.stringify(safe).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Signing in</title></head><body><script>localStorage.clear(); sessionStorage.clear(); location.replace(${target});</script></body></html>`;
}

export type LogEntry = {
  n: number;
  at: string;
  person: string | null;
  kind: "api" | "rpc" | "table" | "auth" | "unsupported" | "note";
  text: string;
  ok: boolean;
};

const LOG_LIMIT = 2000;

export class SimLog {
  private entries: LogEntry[] = [];
  private next = 1;

  add(e: Omit<LogEntry, "n" | "at">): void {
    this.entries.push({ ...e, n: this.next++, at: new Date().toISOString() });
    if (this.entries.length > LOG_LIMIT) this.entries.splice(0, this.entries.length - LOG_LIMIT);
  }

  /** Entries with n greater than `n`. */
  since(n: number): LogEntry[] {
    return this.entries.filter((e) => e.n > n);
  }
}
