import { startFakeSupabase } from "./fake-supabase.mjs";
const fake = await startFakeSupabase({ port: 54409 });
const cols = await fake.db.query("select table_name, column_name, is_nullable, column_default from information_schema.columns where table_name in ('live_match_boxes','live_round_state','live_active_season') order by table_name, ordinal_position");
for (const r of cols.rows) console.log(r.table_name, r.column_name, r.is_nullable, r.column_default ?? "");
console.log((await fake.db.query("select * from live_active_season")).rows);
console.log((await fake.db.query("select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid in ('live_match_boxes'::regclass,'live_round_state'::regclass) and contype='c'")).rows.map(r=>r.d).join("\n"));
await fake.close(); process.exit(0);
