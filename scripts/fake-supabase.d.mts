import type { PGlite } from "@electric-sql/pglite";

export const MIGRATIONS: string[];

export type FakeUser = { id: string; token: string; email: string };
export type FakeCall = { at: string; kind: "rpc" | "table" | "auth" | "unsupported"; name: string; ok: boolean; error?: string };

export type FakeSupabase = {
  db: PGlite;
  url: string;
  dump(): ReturnType<PGlite["dumpDataDir"]>;
  restoreTokens(): Promise<void>;
  addUser(o: { name: string; platformRole?: string | null; approved?: boolean; isHost?: boolean }): Promise<FakeUser>;
  unsupported: string[];
  sessionCookie(user: { token: string }): { name: string; value: string };
  close(): Promise<void>;
};

export function startFakeSupabase(options: {
  port: number;
  root?: string;
  migrations?: string[];
  loadDataDir?: Blob | File;
  onCall?: (call: FakeCall) => void;
}): Promise<FakeSupabase>;
