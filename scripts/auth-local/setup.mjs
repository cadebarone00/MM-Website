// Builds and starts the ISOLATED local Supabase used for account testing (Accounts Step 2c).
//   node scripts/auth-local/setup.mjs          build out/auth-local and start it (fresh database every time)
//   node scripts/auth-local/setup.mjs stop     stop it and delete its data
// It runs in Docker under its own project id ("maroon-auth-test") on ports 55xxx, so it never touches the main
// local stack (54xxx) or any hosted project. Nothing here reads .env files or production keys.
//   AUTH_LOCAL_STACK=main node scripts/auth-local/setup.mjs   a SECOND isolated stack ("maroon-auth-main", ports 56xxx),
//     so this checkout can be tested without wiping the shared 55xxx stack another checkout / terminal may be using.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { authLocalStack } from "./stack.mjs";

const root = process.cwd();
const stack = authLocalStack();
const work = join(root, stack.workdir);
const supabase = (...args) => execFileSync("npx", ["--no-install", "supabase", ...args, "--workdir", work], { stdio: "inherit", shell: true });

if (process.argv[2] === "stop") {
  supabase("stop", "--no-backup");
  process.exit(0);
}

// The same files, in the same order, as the database tests (lib/platform/testDatabase.ts CHAIN), plus the signup /
// profile files this step is about. Copied as-is from supabase/; nothing is edited.
const FILES = [
  "schema.sql", "career_live_archive.sql", "course_library_location.sql", "course_library_tee_setups.sql",
  "archived_handicap_tees.sql", "live_match_publication.sql", "live_hole_submissions.sql", "hole_shot_directions.sql",
  "hole_shot_directions_penalty.sql", "round_format_setups.sql", "scoring_reliability.sql", "live_round_submission.sql",
  "player_slots_email.sql", "player_slots_full_name.sql", "tournament_timezone.sql", "platform_foundation.sql",
  "platform_editions.sql", "platform_create_tournament.sql", "platform_dashboard.sql", "platform_public_site.sql",
  "platform_access_requests.sql", "platform_past_editions.sql", "platform_active_editions.sql", "platform_activity.sql",
  "profile_identity.sql", "tournament_player_identity.sql",
  "player_slots_password_created.sql", "golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql",
  "golf_trip_scoring.sql", "golf_trip_scoring_fix_groups.sql", "golf_trip_scoring_realtime.sql", "golf_trip_scoring_offline.sql",
  "golf_trip_scoring_submission.sql", "player_rounds.sql", "golf_trip_scoring_corrections.sql", "shared_rounds.sql",
  "profile_v1.sql",
  "profile_photos.sql",
  // Accounts V2. Leave them out (`setup.mjs v1`) to rebuild the V1 database the 2c reproduction ran against.
  ...(process.argv[2] === "v1" ? [] : ["profile_initialization.sql", "account_deletion.sql"]),
];

// Always start from an empty database: stop (and delete the data of) any earlier run first.
try { supabase("stop", "--no-backup"); } catch { /* nothing was running */ }
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, "supabase", "migrations"), { recursive: true });
writeFileSync(join(work, "supabase", "config.toml"), stack.config(readFileSync(join(root, "scripts", "auth-local", "config.toml"), "utf8")));
FILES.forEach((file, i) => {
  const name = `20260101${String(i + 1).padStart(6, "0")}_${file}`;
  writeFileSync(join(work, "supabase", "migrations", name), readFileSync(join(root, "supabase", file), "utf8"));
});

// Only the services account tests need: database, auth, REST API, gateway, storage (schema.sql makes a bucket) and
// the Mailpit inbox.
supabase("start", "-x", "realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta");

// Stamp which checkout and which SQL files built this stack. harness.mts refuses to run against a stack built from
// another checkout (2026-10-28: the shared stack had been rebuilt from accounts-a1, so this checkout's suites failed on
// a1-only database rules such as guard_profile_username).
const stamp = JSON.stringify({ checkout: root, files: FILES }).replace(/'/g, "''");
execFileSync("docker", ["exec", stack.dbContainer, "psql", "-U", "postgres", "-q", "-c",
  `create table if not exists public.auth_local_build (built jsonb not null); revoke all on public.auth_local_build from anon, authenticated;
   truncate public.auth_local_build; insert into public.auth_local_build values ('${stamp}'::jsonb);`]);
supabase("status");
