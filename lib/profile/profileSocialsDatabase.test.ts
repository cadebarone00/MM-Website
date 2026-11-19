import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { database, sqlFile } from "../platform/testDatabase.ts";
import { socialTitle, socialUrlOk } from "./profileSocials.ts";

// --- Database: supabase/profile_socials.sql (on top of profile_edit_v2.sql) -----------------------------------------

const one = async <T>(db: PGlite, sql: string, params: unknown[]) => (await db.query<{ r: T }>(sql, params)).rows[0].r;
async function base(): Promise<PGlite> {
  const db = await database();
  for (const file of ["golf_trips.sql", "golf_trip_invitations.sql", "profile_v1.sql", "profile_edit_v2.sql"]) await db.exec(sqlFile(file));
  return db;
}
async function golfer(db: PGlite, username: string) {
  const id = randomUUID();
  await db.query("insert into auth.users values ($1)", [id]);
  await one(db, "select create_my_profile($1, $2, $3) as r", [id, `${username}@example.com`, JSON.stringify({ displayName: username, username })]);
  return id;
}
const save = (db: PGlite, who: string, links: unknown) => one<{ platform: string; title: string; url: string }[]>(db, "select set_my_profile_links($1, $2) as r", [who, JSON.stringify(links)]);

test("old plain links become one Website social; safe to run twice", async () => {
  const db = await base();
  const me = await golfer(db, "samuel");
  await one(db, "select set_my_profile_links($1, $2) as r", [me, JSON.stringify([{ title: "Shop", url: "https://shop.example/" }, { title: "Blog", url: "https://blog.example" }])]);
  for (let run = 0; run < 2; run++) await db.exec(sqlFile("profile_socials.sql"));
  const rows = (await db.query<Record<string, unknown>>("select platform, title, url, position from profile_links where profile_id = $1", [me])).rows;
  assert.deepEqual(rows, [{ platform: "website", title: "shop.example", url: "https://shop.example/", position: 0 }]);
});

test("socials: up to 4, one per app, only real addresses for that app; the database works out the name shown", async () => {
  const db = await base();
  await db.exec(sqlFile("profile_socials.sql"));
  const me = await golfer(db, "samuel");
  assert.deepEqual(await save(db, me, [{ platform: "instagram", url: "https://instagram.com/cade.b", title: "IGNORED @official" }, { platform: "linkedin", url: "https://linkedin.com/in/cade-barone" }]),
    [{ platform: "instagram", title: "cade.b", url: "https://instagram.com/cade.b" }, { platform: "linkedin", title: "cade-barone", url: "https://linkedin.com/in/cade-barone" }]);
  await assert.rejects(save(db, me, [{ platform: "instagram", url: "https://evil.example/cade" }]), /doesn't look right/);
  await assert.rejects(save(db, me, [{ platform: "instagram", url: "https://instagram.com/a" }, { platform: "instagram", url: "https://instagram.com/b" }]), /once/);
  await assert.rejects(save(db, me, [{ platform: "myspace", url: "https://myspace.com/a" }]), /doesn't look right/);
  const five = ["instagram", "tiktok", "x", "threads", "snapchat"].map((p) => ({ platform: p, url: { instagram: "https://instagram.com/a", tiktok: "https://tiktok.com/@ab", x: "https://x.com/a", threads: "https://threads.net/@a", snapchat: "https://snapchat.com/add/abc" }[p] }));
  await assert.rejects(save(db, me, five), /up to 4/);
  assert.equal((await save(db, me, five.slice(0, 4))).length, 4);
  // A refused save left the last good list; nobody can write a bad row straight into the table either.
  await assert.rejects(db.query("insert into profile_links (profile_id, position, platform, title, url) values ($1, 3, 'facebook', 'x', 'https://evil.example/x')", [me]), /profile_links_social_url/);
});

test("the app's rules and the database's rules agree", async () => {
  const db = await base();
  await db.exec(sqlFile("profile_socials.sql"));
  const cases: [string, string][] = [
    ["instagram", "https://instagram.com/cade.b"], ["instagram", "https://instagram.com/has space"], ["instagram", "https://www.instagram.com/cade"],
    ["facebook", "https://facebook.com/cade.barone"], ["youtube", "https://youtube.com/@ab"], ["youtube", "https://youtube.com/@abc"],
    ["tiktok", "https://tiktok.com/@cadeb"], ["linkedin", "https://linkedin.com/in/cade-barone"], ["x", "https://x.com/cade_b"],
    ["x", "https://x.com/waytoolongusername"], ["threads", "https://threads.net/@cade"], ["snapchat", "https://snapchat.com/add/cadeb"],
    ["strava", "https://strava.com/athletes/123"], ["strava", "https://strava.com/athletes/abc"], ["website", "https://crownhomes.com/cade/"],
    ["website", "http://crownhomes.com"], ["website", "javascript:alert(1)"],
  ];
  for (const [platform, url] of cases) {
    const ok = await one<boolean>(db, "select profile_social_url_ok($1, $2) as r", [platform, url]);
    assert.equal(ok, socialUrlOk(platform, url), `${platform} ${url}`);
    if (ok) assert.equal(await one<string>(db, "select profile_social_title($1, $2) as r", [platform, url]), socialTitle(platform as "x", url), `title ${url}`);
  }
});
