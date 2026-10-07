import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInLink, countdownParts, countdownTarget, momNotes, nextRoundReminder, pickLine } from "./momNotifications.ts";
import type { TripTravel } from "./tripTravel.ts";

const flight = (id: string, startsAt: string, details: Record<string, string>) => ({
  id, kind: "flight" as const, details, startsAt, createdBy: "me", source: "mine" as const, joinPolicy: "none" as const, optOutAllowed: true,
});
const travel: TripTravel = {
  meId: "me",
  members: [{ id: "me", name: "Me", role: "player" }, { id: "pal", name: "Pal", role: "player" }],
  items: [
    flight("f1", "2027-04-22T06:10", { airline: "American", flightNumber: "AA1234", from: "RDU", to: "DFW" }),
    flight("f2", "2027-04-22T09:00", { airline: "Frontier", flightNumber: "F91", to: "LAS" }),
    flight("f3", "2027-04-22T07:00", { airline: "Delta", flightNumber: "DL5", to: "PHX" }),
  ],
  participants: [
    { itemId: "f1", memberId: "me", status: "going" },
    { itemId: "f2", memberId: "me", status: "going" },
    { itemId: "f3", memberId: "pal", status: "going" },
  ],
};

test("flight check-in shows only in the 24 hours before my flight", () => {
  assert.equal(momNotes(travel, "2027-04-21T06:09").length, 0);
  assert.deepEqual(momNotes(travel, "2027-04-21T06:10").map(note => note.id), ["check-in:f1"]);
  assert.deepEqual(momNotes(travel, "2027-04-21T09:30").map(note => note.id), ["check-in:f1", "check-in:f2"]);
  assert.deepEqual(momNotes(travel, "2027-04-22T06:10").map(note => note.id), ["check-in:f2"]);
  assert.equal(momNotes(travel, "2027-04-22T09:00").length, 0);
});

test("other people's flights never show", () => {
  assert.ok(!momNotes(travel, "2027-04-21T12:00").some(note => note.id === "check-in:f3"));
});

test("approved lines and the airline's check-in button", () => {
  const [note] = momNotes(travel, "2027-04-21T12:00");
  assert.deepEqual(note.lines, ["Don't forget to check in for your flight to DFW.", "Time to check in for American AA1234. It leaves at 6:10 AM."]);
  assert.deepEqual(note.action, { label: "Check in", url: "https://www.aa.com/reservation/view/find-your-trip" });
  // An airline that isn't on the approved list gets no button.
  assert.equal(momNotes(travel, "2027-04-21T12:00")[1].action, undefined);
  assert.ok(note.lines.includes(pickLine(note, 0)) && note.lines.includes(pickLine(note, 1)));
});

test("check-in links match by name or flight code", () => {
  assert.equal(checkInLink("delta"), "https://www.delta.com/mytrips/");
  assert.equal(checkInLink(undefined, "WN 123"), "https://www.southwest.com/air/check-in/");
  assert.equal(checkInLink("Frontier", "F91"), null);
});

test("countdown counts to the first plan on arrival day, else 7:00 AM", () => {
  assert.equal(countdownTarget("2027-04-22", []), "2027-04-22T07:00");
  assert.equal(countdownTarget("2027-04-22", [{ startsAt: "2027-04-23T08:00" }, { startsAt: "2027-04-22T15:00" }, { startsAt: "2027-04-22T06:10" }]), "2027-04-22T06:10");
  assert.equal(countdownTarget(undefined, []), null);
  assert.deepEqual(countdownParts("2027-04-22T07:00", "2027-04-20T05:58:30"), { days: 2, hours: 1, minutes: 1, seconds: 30 });
  assert.equal(countdownParts("2027-04-22T07:00", "2027-04-22T07:00:00"), null);
});

test("next-round reminder: the next round after the ones played, with format and my tee time", () => {
  const rounds = [
    { number: 1, date: "2027-04-22", course: "Desert Pines GC", format: "Fourball" },
    { number: 2, date: "2027-04-22", course: "Canyon Ridge" },
    { number: 3, date: "2027-04-23", course: "Saguaro Links", format: "Singles Match Play" },
  ];
  assert.deepEqual(nextRoundReminder(rounds, "2027-04-22", 1, []), { line: "Next up is Canyon Ridge", sub: "Round 2" });
  assert.deepEqual(nextRoundReminder(rounds, "2027-04-22", 2, ["2027-04-23T08:10", "2027-04-22T13:00"]), { line: "Next up is Saguaro Links", sub: "Singles Match Play · Round 3 · 8:10 AM" });
  // Rounds on days already gone are skipped; none left → nothing.
  assert.equal(nextRoundReminder(rounds, "2027-04-23", 3, [])?.line, undefined);
  assert.equal(nextRoundReminder(rounds, "2027-04-24", 0, []), null);
});

test("next-round reminder: the second round of a day gets that day's second tee time", () => {
  const rounds = [{ number: 3, date: "2027-09-24", course: "Heron Dunes GC" }, { number: 4, date: "2027-09-24", course: "Desert Meadows GC" }];
  assert.equal(nextRoundReminder(rounds, "2027-09-24", 3, ["2027-09-24T13:10", "2027-09-24T07:30"])?.sub, "Round 4 · 1:10 PM");
});
