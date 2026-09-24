import { PGlite } from "@electric-sql/pglite";

export type ArchiveRow = Record<string, unknown> & { id: string };
export type ArchiveBackup = { rounds: ArchiveRow[]; holes: ArchiveRow[]; videos: ArchiveRow[]; setups: Record<string, unknown>[] };
export type ArchiveRepair = { survivor: ArchiveRow; duplicates: ArchiveRow[]; target: Record<string, unknown> };

/** One transaction, exact preconditions, retained recovery data, and an idempotent second run. */
export async function archiveRepairSql(backup: ArchiveBackup, plan: ArchiveRepair[]): Promise<string> {
  const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const removed = new Set(plan.flatMap(entry => entry.duplicates.map(row => row.id)));
  const targets = new Map(plan.map(entry => [entry.survivor.id, entry.target]));
  const repaired = {
    rounds: backup.rounds.filter(row => !removed.has(row.id)).map(row => ({ ...row, ...targets.get(row.id) })),
    holes: backup.holes.filter(row => !removed.has(String(row.round_id))),
    videos: backup.videos,
    setups: backup.setups,
  };
  // PostgreSQL itself supplies the canonical JSONB representation for both hashes.
  const db = new PGlite();
  let originalHash: string;
  let repairedHash: string;
  try {
    const fingerprint = async (value: unknown) => (await db.query<{ hash: string }>(
      "select encode(sha256(convert_to($1::jsonb::text, 'UTF8')), 'hex') as hash",
      [JSON.stringify(value)],
    )).rows[0].hash;
    originalHash = await fingerprint(backup);
    repairedHash = await fingerprint(repaired);
  } finally { await db.close(); }
  const definitions: Record<string, unknown>[] = [];
  const definitionKeys = new Map<string, number>();
  const moves = plan.map(entry => {
    const key = JSON.stringify(entry.target);
    let index = definitionKeys.get(key);
    if (index === undefined) {
      index = definitions.length;
      definitionKeys.set(key, index);
      definitions.push(entry.target);
    }
    return { id: entry.survivor.id, target: index };
  });
  const snapshot = `jsonb_build_object(
    'rounds', (select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]') from archived_scorecard_rounds r),
    'holes', (select coalesce(jsonb_agg(to_jsonb(h) order by id), '[]') from archived_scorecard_holes h),
    'videos', (select coalesce(jsonb_agg(to_jsonb(v) order by id), '[]') from archived_shot_videos v),
    'setups', (select coalesce(jsonb_agg(to_jsonb(s) order by season_year, round), '[]') from round_format_setups s))`;
  return `-- Generated from a read-only full export. Run as database owner in Supabase SQL Editor.
-- Aborts before changing scores if ANY exported row has changed. Recovery data remains private.
begin;
set local timezone = 'UTC';
lock table archived_scorecard_rounds, archived_scorecard_holes, archived_shot_videos, round_format_setups in share row exclusive mode;
create table if not exists public.archive_repair_backups (created_at timestamptz not null default now(), original jsonb not null, repaired jsonb not null);
alter table public.archive_repair_backups enable row level security;
revoke all on public.archive_repair_backups from public, anon, authenticated;
do $repair$
declare
  original jsonb;
  moves jsonb := ${literal(moves)};
  definitions jsonb := ${literal(definitions)};
  actual jsonb;
  entry jsonb;
  target jsonb;
  fingerprint text;
  temporary_round integer := -10000;
begin
  actual := ${snapshot};
  fingerprint := encode(sha256(convert_to(actual::text, 'UTF8')), 'hex');
  if fingerprint = '${repairedHash}' then return; end if;
  if fingerprint <> '${originalHash}' then raise exception 'Archive changed since backup. Generate a fresh repair plan; nothing repaired.'; end if;
  original := actual;
  for entry in select value from jsonb_array_elements(moves) loop
    update archived_scorecard_rounds set round = temporary_round where id = (entry->>'id')::uuid;
    temporary_round := temporary_round - 1;
  end loop;
  delete from archived_scorecard_rounds where id in (select value::uuid from jsonb_array_elements_text(${literal([...removed])}));
  for entry in select value from jsonb_array_elements(moves) loop
    target := definitions->(entry->>'target')::integer;
    update archived_scorecard_rounds set
      round = (target->>'round')::integer,
      course = target->>'course',
      format = target->>'format',
      handicap_setup = case when target ? 'handicap_setup' then nullif(target->'handicap_setup', 'null'::jsonb) else handicap_setup end,
      played_on = case when target ? 'played_on' then (target->>'played_on')::date else played_on end
    where id = (entry->>'id')::uuid;
  end loop;
  actual := ${snapshot};
  if encode(sha256(convert_to(actual::text, 'UTF8')), 'hex') <> '${repairedHash}' then raise exception 'Repair verification failed; transaction rolled back.'; end if;
  insert into public.archive_repair_backups(original, repaired) values (original, actual);
end $repair$;
commit;
`;
}
