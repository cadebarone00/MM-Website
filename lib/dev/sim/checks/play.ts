import type { SimCheck, SimCheckResult, SimDb, SimSeeded } from "../types";

/** Checks for Play rounds. Read-only SQL, except the one change in "ended", which is undone inside the same statement. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pass = (detail: string): SimCheckResult => ({ status: "pass", detail });
const fail = (detail: string): SimCheckResult => ({ status: "fail", detail });
const waiting = (detail: string): SimCheckResult => ({ status: "waiting", detail });

type Player = { id: string; name: string };
type RoundRow = { host: string; status: string };

const count = async (db: SimDb, sql: string, params: unknown[]) => Number((await db.query<{ n: string | number }>(sql, params)).rows[0]?.n ?? 0);

async function roundRow(db: SimDb, round: string): Promise<RoundRow | null> {
  return (await db.query<RoundRow>("select host, status from shared_rounds where id = $1", [round])).rows[0] ?? null;
}

/** The host plus everyone who joined, read from the database so a phone that joins later counts. */
async function playersOf(db: SimDb, round: string, host: string): Promise<Player[]> {
  const { rows } = await db.query<Player>(
    `select p.id, coalesce(p.display_name, p.username) as name from profiles p
     where p.id = $2 or p.id in (select profile_id from shared_round_players where round_id = $1 and status = 'joined')
     order by (p.id = $2) desc, name`, [round, host]);
  return rows;
}

const SHARED_TABLES = ["shared_rounds", "shared_round_players", "shared_round_holes", "shared_round_guest_holes", "shared_round_picks"];
async function leftoverRows(db: SimDb, round: string): Promise<number> {
  let total = 0;
  for (const table of SHARED_TABLES) {
    total += await count(db, `select count(*) as n from ${table} where ${table === "shared_rounds" ? "id" : "round_id"} = $1`, [round]);
  }
  return total;
}

/** Finds the round a check is about; null while there is none. */
export type Resolve = (db: SimDb, seeded: SimSeeded) => Promise<string | null>;

/** Old scenarios: the round is seeded and named in refs. */
export const seededRound: Resolve = async (_db, seeded) => seeded.refs.round ?? null;

/**
 * Custom setups: the phones start the round themselves, so follow the newest round the host created. Once found it sticks
 * (so "deleted" can see it vanish) until a newer round by the host appears. Make one per setup; a Reset makes a new one.
 */
export function hostsNewestRound(): Resolve {
  let known: string | null = null;
  return async (db, seeded) => {
    const host = seeded.refs.host;
    if (!host || !UUID.test(host)) return known;
    const newest = (await db.query<{ id: string }>("select id from shared_rounds where host = $1 order by started_at desc, id desc limit 1", [host])).rows[0]?.id ?? null;
    if (newest) known = newest;
    return known;
  };
}

const hostOf = (seeded: SimSeeded) => seeded.refs.host ?? seeded.people.find((p) => p.key === "cam")?.id ?? seeded.people[0].id;

async function savedHoles(db: SimDb, round: string): Promise<{ n: number; names: string[] }> {
  const people = await db.query<{ name: string; n: string | number }>(
    `select coalesce(p.display_name, p.username) as name, count(*) as n from shared_round_holes h join profiles p on p.id = h.profile_id
     where h.round_id = $1 and h.strokes is not null group by 1 order by 1`, [round]);
  const guests = await db.query<{ name: string; n: string | number }>(
    `select coalesce((select x->>'name' from shared_rounds r, jsonb_array_elements(coalesce(r.setup->'guests', '[]'::jsonb)) x
                      where r.id = g.round_id and x->>'id' = g.guest_id limit 1), g.guest_id) as name, count(*) as n
     from shared_round_guest_holes g where g.round_id = $1 and g.strokes is not null group by g.round_id, g.guest_id order by 1`, [round]);
  const rows = [...people.rows, ...guests.rows];
  return { n: rows.reduce((sum, r) => sum + Number(r.n), 0), names: rows.map((r) => r.name) };
}

const linked = (r: Resolve): SimCheck => ({
  id: "linked", label: "Card linked to the round",
  async run(db, seeded) {
    const round = await r(db, seeded);
    if (!round) return waiting("No round yet");
    const row = await roundRow(db, round);
    if (!row) return (await leftoverRows(db, round)) === 0 ? pass("Round deleted") : fail("The round is gone but some of its rows are left");
    return row.host === hostOf(seeded) ? pass(`The round exists and ${seeded.people.find((p) => p.id === hostOf(seeded))?.name ?? "the host"} is the host`) : fail("The round has the wrong host");
  },
});

const saved = (r: Resolve): SimCheck => ({
  id: "saved", label: "Scores saved",
  async run(db, seeded) {
    const round = await r(db, seeded);
    if (!round) return waiting("No round yet");
    const { n, names } = await savedHoles(db, round);
    return n === 0 ? waiting("No scores yet") : pass(`${n} holes saved (${names.join(", ")})`);
  },
});

/**
 * Tries to change a score and always undoes it. One statement, so it is as short as it can be and a failure can't leave the
 * connection mid-transaction: the inner block's exception handler rolls the change back, then the outer block reports what happened.
 */
async function lockAttempt(db: SimDb, round: string, host: string): Promise<{ locked: boolean; detail: string }> {
  if (!UUID.test(round) || !UUID.test(host)) throw new Error("Round and host ids must be uuids");
  const sql = `do $$ declare msg text; begin
    begin perform set_shared_round_strokes('${host}', '${round}', '${host}', 1, 3); raise exception 'sim_lock_open';
    exception when others then msg := sqlerrm; end;
    raise exception 'sim_result:%', msg; end $$`;
  let message = "";
  try { await db.query(sql); } catch (err) { message = err instanceof Error ? err.message : String(err); }
  const result = message.includes("sim_result:") ? message.slice(message.indexOf("sim_result:") + "sim_result:".length) : message;
  // Only the real refusal counts as a lock; any other error means the attempt never tested the lock.
  if (result.includes("This round has ended")) return { locked: true, detail: "Round ended; changing a score is refused" };
  if (result.includes("sim_lock_open")) return { locked: false, detail: "Round ended but a score could still be changed" };
  return { locked: false, detail: `The lock test hit a different error: ${result || "no error and no refusal"}` };
}

const ended = (r: Resolve): SimCheck => ({
  id: "ended", label: "Submitted and locked",
  async run(db, seeded) {
    const round = await r(db, seeded);
    if (!round) return waiting("No round yet");
    const row = await roundRow(db, round);
    if (!row || row.status === "live") return waiting("Round is still live");
    const attempt = await lockAttempt(db, round, row.host);
    return attempt.locked ? pass(attempt.detail) : fail(attempt.detail);
  },
});

const profileOnce = (r: Resolve): SimCheck => ({
  id: "profile-once", label: "On each player's profile, once",
  async run(db, seeded) {
    const round = await r(db, seeded);
    if (!round) return waiting("No round yet");
    const row = await roundRow(db, round);
    if (!row) return waiting("Round is gone");
    const counts: { name: string; n: number }[] = [];
    for (const p of await playersOf(db, round, row.host)) {
      const n = await count(db, "select count(*) as n from player_rounds where profile_id = $1 and source = 'personal' and source_key like '%' || $2 || '%'", [p.id, round]);
      counts.push({ name: p.name, n });
    }
    const text = counts.map((c) => `${c.name} ${c.n}`).join(", ");
    if (counts.some((c) => c.n > 1)) return fail(`Saved more than once: ${text}`);
    if (counts.some((c) => c.n === 0)) return row.status === "ended" ? fail(`Missing from a profile: ${text}`) : waiting(`Not saved yet: ${text}`);
    return pass(text);
  },
});

/** Each saved profile card's per-hole strokes must equal what the shared round holds for that player (pure comparison of stored values). */
const cardMatches = (r: Resolve): SimCheck => ({
  id: "card-matches", label: "Profile card matches the round",
  async run(db, seeded) {
    const round = await r(db, seeded);
    if (!round) return waiting("No round yet");
    const row = await roundRow(db, round);
    if (!row) return waiting("Round is gone");
    const lines: string[] = [];
    for (const p of await playersOf(db, round, row.host)) {
      const card = (await db.query<{ holes: { number: number; strokes: number }[] }>(
        "select holes from player_rounds where profile_id = $1 and source = 'personal' and source_key like '%' || $2 || '%' limit 1", [p.id, round])).rows[0];
      if (!card) continue;
      const shared = (await db.query<{ hole: number; strokes: number | null }>("select hole, strokes from shared_round_holes where round_id = $1 and profile_id = $2", [round, p.id])).rows;
      const saved = new Map((card.holes ?? []).map((h) => [Number(h.number), h.strokes ?? null]));
      const live = new Map(shared.map((h) => [Number(h.hole), h.strokes ?? null]));
      const holes = [...new Set([...saved.keys(), ...live.keys()])].sort((a, b) => a - b);
      const bad = holes.find((h) => (saved.get(h) ?? null) !== (live.get(h) ?? null));
      if (bad !== undefined) return fail(`${p.name}, hole ${bad}: saved ${saved.get(bad) ?? "none"}, round ${live.get(bad) ?? "none"}`);
      lines.push(`${p.name} ${holes.length} holes`);
    }
    return lines.length === 0 ? waiting("No saved cards yet") : pass(lines.join(", "));
  },
});

const handicapCheck = (r: Resolve, expectCounted: boolean): SimCheck => ({
  id: "handicap", label: "Handicap",
  async run(db, seeded) {
    const round = await r(db, seeded);
    if (!round) return waiting("No round yet");
    const row = await roundRow(db, round);
    const players = row ? await playersOf(db, round, row.host) : [];
    const lines: string[] = [];
    let wrong = false, missing = false;
    for (const p of players) {
      const found = (await db.query<{ counts_for_handicap: boolean; differential: string | number | null; not_counted_reason: string | null }>(
        `select counts_for_handicap, differential, not_counted_reason from player_rounds
         where profile_id = $1 and source = 'personal' and source_key like '%' || $2 || '%' limit 1`, [p.id, round])).rows[0];
      if (!found) { missing = true; continue; }
      lines.push(`${p.name}: ${found.counts_for_handicap ? `Counts · differential ${found.differential}` : `Not counted: ${found.not_counted_reason}`}`);
      if (found.counts_for_handicap !== expectCounted) wrong = true;
    }
    if (missing || lines.length === 0) return waiting(lines.length ? `Waiting for every player's round (${lines.join("; ")})` : "Waiting for a saved round");
    return wrong ? fail(`${lines.join("; ")} (expected ${expectCounted ? "counted" : "not counted"})`) : pass(lines.join("; "));
  },
});

const guest = (r: Resolve): SimCheck => ({
  id: "guest", label: "Guest never reaches a profile",
  async run(db, seeded) {
    const round = await r(db, seeded);
    if (!round) return waiting("No round yet");
    const row = await roundRow(db, round);
    if (!row) return waiting("Round is gone");
    const players = await playersOf(db, round, row.host);
    const n = await count(db, "select count(*) as n from player_rounds where source = 'personal' and source_key like '%' || $1 || '%'", [round]);
    if (n === 0) return waiting("Nothing saved yet");
    return n === players.length ? pass(`${n} profile rounds for ${players.length} players`) : fail(`${n} profile rounds but ${players.length} players`);
  },
});

const deleted = (r: Resolve): SimCheck => ({
  id: "deleted", label: "Delete round removes everything",
  async run(db, seeded) {
    const round = await r(db, seeded);
    if (!round) return waiting("No round yet");
    if (await roundRow(db, round)) return waiting("The round still exists");
    const left = await leftoverRows(db, round);
    return left === 0 ? pass("Nothing left of the round") : fail(`${left} rows left behind`);
  },
});

/** The checks a Play scenario shows; the unrated one expects the round not to count toward handicap. */
export function playChecks(opts: { expectCounted: boolean; withGuest?: boolean; round?: Resolve }): SimCheck[] {
  const r = opts.round ?? seededRound;
  return [linked(r), saved(r), ended(r), profileOnce(r), cardMatches(r), handicapCheck(r, opts.expectCounted), ...(opts.withGuest ? [guest(r)] : []), deleted(r)];
}
