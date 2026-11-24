export type SimDb = { query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };

export type SimPerson = { key: string; name: string; id: string; token: string };
export type SimPhone = { person: string; label: string; startPath: string };
export type SimFake = { db: SimDb; addUser(o: { name: string }): Promise<{ id: string; token: string }> };
export type SimSeeded = { people: SimPerson[]; phones: SimPhone[]; refs: Record<string, string> };
export type SimCheckResult = { status: "pass" | "fail" | "waiting"; detail: string };
export type SimCheck = { id: string; label: string; run(db: SimDb, seeded: SimSeeded): Promise<SimCheckResult> };

export type SimScenario = {
  id: string;
  simulator: "scoring";
  feature: "Play" | "Trip" | "Tourney" | "League";
  label: string;
  seed(fake: SimFake): Promise<SimSeeded>;
  checks: SimCheck[];
};
