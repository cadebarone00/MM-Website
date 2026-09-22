export type ArchiveRow = Record<string, unknown> & { id: string };
export type ArchiveBackup = { rounds: ArchiveRow[]; holes: ArchiveRow[]; videos: ArchiveRow[]; setups: Record<string, unknown>[] };
export type ArchiveRepair = { survivor: ArchiveRow; duplicates: ArchiveRow[]; target: Record<string, unknown> };

/** One transaction, exact preconditions, retained recovery data, and an idempotent second run. */
export function archiveRepairSql(backup: ArchiveBackup, plan: ArchiveRepair[]): string {
  const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const removed = new Set(plan.flatMap(entry => entry.duplicates.map(row => row.id)));
  const targets = new Map(plan.map(entry => [entry.survivor.id, entry.target]));
  const repaired = {
    rounds: backup.rounds.filter(row => !removed.has(row.id)).map(row => ({ ...row, ...targets.get(row.id) })),
    holes: backup.holes.filter(row => !removed.has(String(row.round_id))),
    videos: backup.videos,
    setups: backup.setups,
  };
  const snapshot = `jsonb_build_object(
    'rounds', (select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]') from archived_scorecard_rounds r),
    'holes', (select coalesce(jsonb_agg(to_jsonb(h) order by id), '[]') from archived_scorecard_holes h),
    'videos', (select coalesce(jsonb_agg(to_jsonb(v) order by id), '[]') from archived_shot_videos v),
    'setups', (select coalesce(jsonb_agg(to_jsonb(s) order by season_year, round), '[]') from round_format_setups s))`;
  return `-- Generated from a read-only full export. Run as database owner in Supabase SQL Editor.
-- Aborts before changing scores if ANY exported row has changed. Recovery data remains private.
begin;
lock table archived_scorecard_rounds, archived_scorecard_holes, archived_shot_videos, round_format_setups in share row exclusive mode;
create table if not exists public.archive_repair_backups (created_at timestamptz not null default now(), original jsonb not null, repaired jsonb not null);
alter table public.archive_repair_backups enable row level security;
revoke all on public.archive_repair_backups from public, anon, authenticated;
do $repair$
declare
  original jsonb := ${literal(backup)};
  repaired jsonb := ${literal(repaired)};
  actual jsonb;
  entry jsonb;
  temporary_round integer := -10000;
begin
  actual := ${snapshot};
  if actual = repaired then return; end if;
  if actual <> original then raise exception 'Archive changed since backup. Generate a fresh repair plan; nothing repaired.'; end if;
  insert into public.archive_repair_backups(original, repaired) values (original, repaired);
  for entry in select value from jsonb_array_elements(${literal(plan)}) loop
    update archived_scorecard_rounds set round = temporary_round where id = (entry->'survivor'->>'id')::uuid;
    temporary_round := temporary_round - 1;
  end loop;
  delete from archived_scorecard_rounds where id in (select value::uuid from jsonb_array_elements_text(${literal([...removed])}));
  for entry in select value from jsonb_array_elements(${literal(plan)}) loop
    update archived_scorecard_rounds set
      round = (entry->'target'->>'round')::integer,
      course = entry->'target'->>'course',
      format = entry->'target'->>'format',
      handicap_setup = case when entry->'target' ? 'handicap_setup' then nullif(entry->'target'->'handicap_setup', 'null'::jsonb) else handicap_setup end,
      played_on = case when entry->'target' ? 'played_on' then (entry->'target'->>'played_on')::date else played_on end
    where id = (entry->'survivor'->>'id')::uuid;
  end loop;
  actual := ${snapshot};
  if actual <> repaired then raise exception 'Repair verification failed; transaction rolled back.'; end if;
end $repair$;
commit;
`;
}
