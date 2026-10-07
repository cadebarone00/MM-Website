import assert from "node:assert/strict";
import test from "node:test";
import { GOLF_TRIP_MOCK_TRAVEL } from "./golfTripPreviewFixture";
import { addMyItem, checkTravelInput, cleanDetails, itineraryFor, myItems, removeMyItem, travelTitle, updateMyItem, type TripTravel } from "./tripTravel";

const empty: TripTravel = { meId: "me", members: [{ id: "me", name: "Me", role: "player" }, { id: "you", name: "You", role: "player" }], items: [], participants: [] };

test("adding my own booking puts it on my itinerary (and only mine)", () => {
  const travel = addMyItem(empty, { id: "f1", kind: "flight", details: { airline: "American Airlines", flightNumber: "AA1234", from: "RDU", to: "DFW" }, startsAt: "2027-04-22T06:10", endsAt: "2027-04-22T08:05", joinPolicy: "none" });
  assert.deepEqual(itineraryFor(travel), [{ id: "f1", kind: "flight", title: "AA1234 · RDU → DFW", detail: "American Airlines · Lands 8:05 AM", startsAt: "2027-04-22T06:10", endsAt: "2027-04-22T08:05" }]);
  assert.deepEqual(itineraryFor(travel, "you"), []);
  assert.equal(myItems(travel)[0].source, "mine");
});

test("lodging and rental cars become two itinerary entries (start and end); everything is in time order", () => {
  let travel = addMyItem(empty, { id: "h", kind: "lodging", details: { name: "The Shorebreak Villas", place: "Scottsdale" }, startsAt: "2027-04-22T15:00", endsAt: "2027-04-25T10:00", joinPolicy: "none" });
  travel = addMyItem(travel, { id: "c", kind: "ride", details: { rideType: "rental", place: "PHX Rental Car Center", seats: 3 }, startsAt: "2027-04-22T10:45", endsAt: "2027-04-25T11:30", joinPolicy: "none" });
  assert.deepEqual(itineraryFor(travel).map((e) => `${e.startsAt} ${e.title} (${e.detail})`), [
    "2027-04-22T10:45 Rental car pickup (PHX Rental Car Center · 3 seats)",
    "2027-04-22T15:00 The Shorebreak Villas (Check-in · Scottsdale)",
    "2027-04-25T10:00 The Shorebreak Villas (Check-out)",
    "2027-04-25T11:30 Rental car return (PHX Rental Car Center)",
  ]);
});

test("edit and delete only touch my own bookings — never organizer items or other people's", () => {
  const mock = GOLF_TRIP_MOCK_TRAVEL;
  const edited = updateMyItem(mock, "tr-hotel", { details: { name: "Desert Ridge Resort" }, startsAt: "2027-04-22T16:00", endsAt: "2027-04-25T11:00", joinPolicy: "none" });
  assert.equal(edited.items.find((i) => i.id === "tr-hotel")?.details.name, "Desert Ridge Resort");
  assert.equal(updateMyItem(mock, "tr-tee-1", { details: { name: "Changed" }, startsAt: "2027-04-23T08:30", joinPolicy: "none" }).items.find((i) => i.id === "tr-tee-1")?.details.name, "Desert Pines GC", "organizer tee time untouched");
  assert.equal(removeMyItem(mock, "tr-parker-flight"), mock, "someone else's flight can't be deleted");
  assert.equal(removeMyItem(mock, "tr-dinner-1"), mock, "organizer dinner can't be deleted from My travel");
  const removed = removeMyItem(mock, "tr-car");
  assert.ok(!removed.items.some((i) => i.id === "tr-car") && !removed.participants.some((p) => p.itemId === "tr-car"));
  assert.ok(!itineraryFor(removed).some((e) => e.id.startsWith("tr-car")), "gone from the itinerary too");
  assert.deepEqual(myItems(mock).map((i) => i.id), ["tr-flight-out-1", "tr-flight-out-2", "tr-car", "tr-hotel", "tr-flight-home"]);
});

test("mock: my itinerary includes the organizer's dinners and tee times, not other players' own plans", () => {
  const ids = itineraryFor(GOLF_TRIP_MOCK_TRAVEL).map((e) => e.id);
  assert.ok(ids.includes("tr-tee-1") && ids.includes("tr-dinner-2"));
  assert.ok(!ids.includes("tr-parker-flight") && !ids.some((id) => id.startsWith("tr-chen")));
  assert.deepEqual(itineraryFor(GOLF_TRIP_MOCK_TRAVEL, "member-jordan").map((e) => e.id).slice(0, 2), ["tr-parker-flight", "tr-dinner-1"]);
});

test("form checks: flight codes, times in order, required names, seats", () => {
  assert.deepEqual(checkTravelInput("flight", { flightNumber: "aa 1234", from: "rdu", to: "phx" }, "2027-04-22T06:10", "2027-04-22T08:05"), {});
  assert.deepEqual(Object.keys(checkTravelInput("flight", { flightNumber: "flight", from: "Raleigh", to: "" }, "", undefined)).sort(), ["flightNumber", "from", "startsAt", "to"]);
  assert.equal(checkTravelInput("lodging", { name: "Villas" }, "2027-04-22T15:00", "2027-04-22T14:00").endsAt, "Must be after the start.");
  assert.equal(checkTravelInput("lodging", { name: "  " }, "2027-04-22T15:00").name, "Where are you staying?");
  assert.equal(checkTravelInput("ride", { rideType: "driving", from: "", seats: 40 }, "2027-04-22T11:00").seats, "0 to 12 open seats.");
  assert.equal(checkTravelInput("ride", { rideType: "driving", from: "" }, "2027-04-22T11:00").from, "Where are you driving from?");
  assert.deepEqual(cleanDetails("flight", { airline: " American ", flightNumber: "aa 1234", from: "rdu", to: "phx" }), { airline: "American", flightNumber: "AA1234", from: "RDU", to: "PHX" });
  assert.equal(travelTitle({ ...GOLF_TRIP_MOCK_TRAVEL.items.find((i) => i.id === "tr-chen-drive")! }), "Driving from Tucson");
});
