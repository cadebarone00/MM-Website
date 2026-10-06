import assert from "node:assert/strict";
import test from "node:test";
import { itineraryByDay, itineraryCategory, itineraryDay, homeBoxes, itineraryLongDate, itineraryTime, itineraryWeekday, localNow, sortItinerary, upcomingItinerary, type ItineraryItem } from "./golfTripItinerary";
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

test("by day: every trip day is listed (empty days included), plus any day outside the trip that has something", () => {
  const days = itineraryByDay([item("early", "2027-04-21T18:00"), item("tee", "2027-04-23T08:30")], ["2027-04-22", "2027-04-23", "2027-04-24"]);
  assert.deepEqual(days.map((d) => [d.day, d.items.map((i) => i.id)]), [["2027-04-21", ["early"]], ["2027-04-22", []], ["2027-04-23", ["tee"]], ["2027-04-24", []]]);
  assert.deepEqual(itineraryByDay([], ["2027-04-22"]), [{ day: "2027-04-22", items: [] }], "a trip with nothing planned still shows its days");
  assert.deepEqual(itineraryByDay([], []), []);
});

test("labels: day, time, and local now", () => {
  assert.equal(itineraryDay("2027-04-22T06:10"), "Thu, Apr 22");
  assert.equal(itineraryWeekday("2027-04-22T06:10"), "Thursday");
  assert.equal(itineraryLongDate("2027-04-22"), "April 22, 2027");
  assert.equal(itineraryCategory({ kind: "ride", title: "Rental car pickup", startsAt: "2027-04-22T10:00" }), "Rental car");
  assert.equal(itineraryCategory({ kind: "ride", title: "Driving from Austin", startsAt: "2027-04-22T10:00" }), "Ride");
  assert.equal(itineraryCategory({ kind: "dining", title: "Diner", startsAt: "2027-04-22T08:30" }), "Breakfast");
  assert.equal(itineraryCategory({ kind: "dining", title: "Grill", startsAt: "2027-04-22T12:15" }), "Lunch");
  assert.equal(itineraryCategory({ kind: "dining", title: "Steakhouse", startsAt: "2027-04-22T19:00" }), "Dinner");
  assert.equal(itineraryCategory({ kind: "flight", title: "AA1234", startsAt: "2027-04-22T06:10" }), "Flight");
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

const plans: ItineraryItem[] = [
  { id: "flight", kind: "flight", title: "Out", startsAt: "2027-04-22T06:10", endsAt: "2027-04-22T08:05" },
  { id: "lodging", kind: "lodging", title: "Villa", startsAt: "2027-04-22T15:00" },
  { id: "dinner", kind: "dining", title: "Dinner", startsAt: "2027-04-22T18:30" },
];
const show = (boxes: ReturnType<typeof homeBoxes>) => boxes.map(({ status, item }) => `${status}:${item.id}`);

test("homeBoxes: before the trip (or between plans) it's NEXT then UPCOMING", () => {
  assert.deepEqual(show(homeBoxes(plans, "2027-04-01T09:00")), ["NEXT:flight", "UPCOMING:lodging"]);
  // 5:45 PM, rounds all submitted, dinner at 6:30: nothing is going on.
  assert.deepEqual(show(homeBoxes(plans, "2027-04-22T17:45")), ["NEXT:dinner"]);
});

test("homeBoxes: something happening is NOW (a flight until it lands, a check-in for 30 minutes), then NEXT", () => {
  assert.deepEqual(show(homeBoxes(plans, "2027-04-22T07:00")), ["NOW:flight", "NEXT:lodging"]);
  assert.deepEqual(show(homeBoxes(plans, "2027-04-22T15:20")), ["NOW:lodging", "NEXT:dinner"]);
  assert.deepEqual(show(homeBoxes(plans, "2027-04-22T15:30")), ["NEXT:dinner"]);
});

test("homeBoxes: a live golf round wins and is the only LIVE", () => {
  const round: ItineraryItem = { id: "round-2", kind: "teeTime", title: "Round 2 · Desert Pines", startsAt: "2027-04-22T13:00" };
  assert.deepEqual(show(homeBoxes(plans, "2027-04-22T15:20", round)), ["LIVE:round-2", "NEXT:dinner"]);
  assert.deepEqual(homeBoxes([], "2027-04-22T20:00"), []);
});
