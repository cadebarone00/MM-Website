import test from "node:test";
import assert from "node:assert/strict";
import { MOCK_PERSON_IDS, daysFromToday, mockPeople, mockPerson, mockPersonFriends, mockPersonHistory, mockPersonProfile } from "./mockPeople";
import { sampleProfileReadModel } from "./sampleProfile";
import { DEFAULT_SIMULATOR_STATE, parseSimulatorConfig } from "./simulator";

const TODAY = new Date(2026, 10, 21, 12);

test("Mock people: 5 people in order, each with a unique id and username", () => {
  const people = mockPeople(TODAY);
  assert.deepEqual(people.map((p) => p.id), [...MOCK_PERSON_IDS]);
  assert.equal(new Set(people.map((p) => p.username)).size, 5);
});

test("Mock people: Sam is brand new (nothing at all), Cade has full lists", () => {
  const sam = mockPerson("sam", TODAY);
  assert.deepEqual([sam.trips.length, sam.leagues.length, sam.friends.length, sam.tourneys.codeTournaments.length], [0, 0, 0, 0]);
  assert.deepEqual(sam.tourneys.past, { signedIn: true, ok: true, tournaments: [] });
  const cade = mockPerson("cade", TODAY);
  assert.equal(cade.trips.filter((t) => t.startDate > daysFromToday(0, TODAY)).length, 2, "2 upcoming trips");
  assert.equal(cade.trips.filter((t) => t.endDate < daysFromToday(0, TODAY)).length, 4, "4 past trips");
  assert.equal(cade.leagues.length, 3);
});

test("Mock people: every friend is a real sample golfer (so their profile opens)", () => {
  for (const person of mockPeople(TODAY)) assert.equal(mockPersonFriends(person).length, person.friends.length, person.id);
});

test("Mock people: an unknown id falls back to Cade; trip ids are unique", () => {
  assert.equal(mockPerson("nobody", TODAY).id, "cade");
  const ids = mockPeople(TODAY).flatMap((p) => p.trips.map((t) => t.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("Mock people: their Profile lists the same trips and past tournaments as their tabs", () => {
  const cade = mockPerson("cade", TODAY);
  const profile = sampleProfileReadModel(cade.profilePreview, mockPersonProfile(cade), daysFromToday(0, TODAY), null, mockPersonHistory(cade));
  assert.equal(profile.trips.status, "ok");
  if (profile.trips.status === "ok") assert.equal(profile.trips.value.current.length + profile.trips.value.past.length, 6);
  assert.equal(profile.identity.displayName, "Cade Barone");
});

test("Mock people: the simulator keeps a known person and drops an unknown one", () => {
  const config = (mockPerson: unknown) => parseSimulatorConfig({ source: "maroon", state: { ...DEFAULT_SIMULATOR_STATE, mockPerson } });
  assert.equal(config("alex")?.state.mockPerson, "alex");
  assert.equal(config("hacker"), null);
});
