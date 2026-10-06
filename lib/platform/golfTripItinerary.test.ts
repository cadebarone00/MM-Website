import assert from "node:assert/strict";
import test from "node:test";
import { itineraryByDay, itineraryDay, itineraryTime, localNow, sortItinerary, upcomingItinerary, type ItineraryItem } from "./golfTripItinerary";
import { GOLF_TRIP_MOCK_TRAVEL } from "./golfTripPreviewFixture";
import { itineraryFor } from "./tripTravel";

const item = (id: string, startsAt: string): ItineraryItem => ({ id, kind: "teeTime", title: id, startsAt });

test("upcoming: the next 5 that haven't started, soonest first", () => {
  const items = [item("late", "2027-04-25T13:40"), item("first", "2027-04-22T06:10"), item("b", "2027-04-22T09:15"), item("c", "2027-04-22T10:30"), item("d", "2027-04-22T15:00"), item("e", "2027-04-22T19:30")];
  assert.deepEqual(upcomingItinerary(items, "2027-04-01T00:00").map((i) => i.id), ["first", "b", "c", "d", "e"]);
  assert.deepEqual(upcomingItinerary(items, "2027-04-22T09:15").map((i) => i.id), ["b", "c", "d", "e", "late"], "something starting right now still counts");
  assert.deepEqual(upcomingItinerary(items, "2027-05-01T00:00"), [], "after the trip: nothing left");
});

test("malformed times are dropped; by-day keeps time order within each day", () => {
  assert.deepEqual(sortItinerary([item("bad", "April 22"), item("ok", "2027-04-22T06:10")]).map((i) => i.id), ["ok"]);
  const days = itineraryByDay([item("x", "2027-04-23T08:30"), item("y", "2027-04-22T19:30"), item("z", "2027-04-22T06:10")]);
  assert.deepEqual(days.map((d) => [d.day, d.items.map((i) => i.id)]), [["2027-04-22", ["z", "y"]], ["2027-04-23", ["x"]]]);
});

test("labels: day, time, and local now", () => {
  assert.equal(itineraryDay("2027-04-22T06:10"), "Thu, Apr 22");
  assert.equal(itineraryTime("2027-04-22T06:10"), "6:10 AM");
  assert.equal(itineraryTime("2027-04-22T19:30"), "7:30 PM");
  assert.equal(localNow(new Date(2027, 3, 22, 9, 5)), "2027-04-22T09:05");
});

test("mock trip itinerary: valid times, unique ids, enough for the Home cards", () => {
  const mock = itineraryFor(GOLF_TRIP_MOCK_TRAVEL);
  assert.equal(sortItinerary(mock).length, mock.length);
  assert.equal(new Set(mock.map((i) => i.id)).size, mock.length);
  assert.ok(mock.length >= 5, "enough for the 5 Home cards");
});
