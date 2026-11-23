import { test } from "node:test";
import assert from "node:assert/strict";
import { startFakeSupabase } from "../../../scripts/fake-supabase.mjs";
import { SIM_MIGRATIONS } from "./migrations";
import { SCENARIOS, scenarioById } from "./scenarios";

const fresh = () => startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS });

test("each Play scenario seeds one live round hosted by Cam, with its phones on it", async () => {
  const plays = SCENARIOS.filter((s) => s.feature === "Play");
  assert.equal(plays.length, 3);
  for (const scenario of plays) {
    const fake = await fresh();
    try {
      const seeded = await scenario.seed(fake);
      const cam = seeded.people.find((p) => p.key === "cam")!;
      const rows = (await fake.db.query("select id, host, status from shared_rounds")).rows as { id: string; host: string; status: string }[];
      assert.equal(rows.length, 1, scenario.id);
      assert.equal(rows[0].status, "live");
      assert.equal(rows[0].host, cam.id);
      assert.equal(rows[0].id, seeded.refs.round);
      assert.ok(seeded.phones.length >= 1);
      for (const phone of seeded.phones) {
        const invited = scenario.id === "play-friends" && phone.person === "jake";
        assert.equal(phone.startPath, invited ? "/" : `/rounds/new?round=${seeded.refs.round}`, `${scenario.id} ${phone.person}`);
      }
    } finally { await fake.close(); }
  }
});

test("with friends: Cade joined, Jake invited, one guest", async () => {
  const fake = await fresh();
  try {
    const seeded = await scenarioById("play-friends")!.seed(fake);
    const rows = (await fake.db.query("select p.username, s.status from shared_round_players s join profiles p on p.id = s.profile_id")).rows as { username: string; status: string }[];
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.username, r.status])), { cam: "joined", cade: "joined", jake: "invited" });
    const guests = (await fake.db.query("select jsonb_array_length(setup->'guests') as n from shared_rounds where id = $1", [seeded.refs.round])).rows[0] as { n: number };
    assert.equal(guests.n, 1);
  } finally { await fake.close(); }
});

test("scenario ids are unique and findable", () => {
  const ids = SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of SCENARIOS) assert.equal(scenarioById(s.id), s);
  assert.equal(scenarioById("nope"), undefined);
});
