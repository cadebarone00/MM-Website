// node --test scripts/legacy-local/restore-list.test.mjs   (which parts of a production dump the legacy copy restores)
import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreList } from "./restore-local.mjs";

const TOC = `;
; Archive created at 2026-11-01 10:00:00 UTC
;     dbname: postgres
;
13; 2615 16384 SCHEMA - public pg_database_owner
14; 2615 16400 SCHEMA - auth supabase_admin
20; 3079 16500 EXTENSION - pg_net -
21; 3079 16501 EXTENSION - pgcrypto -
300; 1259 17000 TABLE public profiles postgres
301; 1259 17001 TABLE public player_slots postgres
302; 1259 17002 TABLE auth users supabase_auth_admin
303; 1259 17003 TABLE auth sessions supabase_auth_admin
400; 1255 17100 FUNCTION public initialize_my_profile(uuid) postgres
401; 1255 17101 FUNCTION net http_post(text, jsonb) supabase_admin
500; 0 17000 TABLE DATA public profiles postgres
501; 0 17001 TABLE DATA public player_slots postgres
502; 0 17002 TABLE DATA auth users supabase_auth_admin
503; 0 17004 TABLE DATA auth identities supabase_auth_admin
504; 0 17003 TABLE DATA auth sessions supabase_auth_admin
505; 0 17005 TABLE DATA auth refresh_tokens supabase_auth_admin
506; 0 17006 TABLE DATA auth audit_log_entries supabase_auth_admin
507; 0 17007 TABLE DATA storage objects supabase_storage_admin
508; 0 17008 TABLE DATA cron job supabase_admin
600; 2606 17200 FK CONSTRAINT public profiles profiles_id_fkey postgres
601; 3256 17201 POLICY public profiles profiles_select_own postgres
602; 0 0 ACL public TABLE profiles postgres
603; 6104 17300 PUBLICATION TABLE public supabase_realtime player_slots postgres
604; 2620 17301 TRIGGER public player_slots guard_locked_player_slot postgres
605; 2620 17302 TRIGGER auth users sync_player_slot_password_created supabase_auth_admin
`;

test("keeps the whole public schema except schema / extension / publication entries", () => {
  const kept = restoreList(TOC);
  for (const id of ["300;", "301;", "400;", "500;", "501;", "600;", "601;", "602;", "604;"]) assert.ok(kept.includes(`\n${id}`) || kept.startsWith(id), `kept ${id}`);
  for (const id of ["13;", "20;", "21;", "603;"]) assert.ok(!kept.split("\n").some((l) => l.startsWith(id)), `dropped ${id}`);
});

test("keeps only auth.users and auth.identities rows from the auth schema", () => {
  const lines = restoreList(TOC).split("\n");
  assert.ok(lines.some((l) => l.startsWith("502;")) && lines.some((l) => l.startsWith("503;")));
  for (const id of ["14;", "302;", "303;", "504;", "505;", "506;", "605;"]) assert.ok(!lines.some((l) => l.startsWith(id)), `dropped ${id}`);
});

test("login rows come first, users before identities (the local auth tables already enforce the link)", () => {
  const lines = restoreList(TOC).split("\n").filter(Boolean);
  assert.ok(lines[0].startsWith("502;") && lines[1].startsWith("503;"));
  const reversed = TOC.replace("502; 0 17002 TABLE DATA auth users", "509; 0 17002 TABLE DATA auth users").split("\n").reverse().join("\n");
  assert.ok(restoreList(reversed).split("\n")[0].includes("TABLE DATA auth users"));
});

test("nothing from net (webhooks), cron, storage metadata or comments", () => {
  const lines = restoreList(TOC).split("\n");
  for (const id of ["401;", "507;", "508;"]) assert.ok(!lines.some((l) => l.startsWith(id)), `dropped ${id}`);
  assert.ok(!lines.some((l) => l.startsWith(";")));
});
