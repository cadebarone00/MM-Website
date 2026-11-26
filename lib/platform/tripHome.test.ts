import assert from "node:assert/strict";
import test from "node:test";
import { dateRangeLabel, flightsSlide, homeSlides, validDay } from "./tripHome";

test("trip dates: the year once, both years across New Year, one date alone, nothing when missing or broken", () => {
  assert.equal(dateRangeLabel("2026-01-07", "2026-01-10"), "Jan 7 – Jan 10, 2026");
  assert.equal(dateRangeLabel("2026-12-30", "2027-01-02"), "Dec 30, 2026 – Jan 2, 2027");
  assert.equal(dateRangeLabel("2026-04-22", undefined), "Apr 22, 2026");
  assert.equal(dateRangeLabel(undefined, "2026-04-25"), "Apr 25, 2026");
  assert.equal(dateRangeLabel(undefined, undefined), "");
  assert.equal(dateRangeLabel("not a date", ""), "");
  assert.equal(validDay("2026-02-30"), true); // Date.parse rolls it over; same as the website always did
  assert.equal(validDay("2026/02/03"), false);
});

test("Flights slide: the next flight, else no upcoming flights, else add your flights", () => {
  const next = { flightNumber: "AA1234", departureAirport: "RDU", arrivalAirport: "DFW", departureLocal: "2026-04-22T06:10" };
  const withNext = flightsSlide({ next, arrivalCount: 2, returnCount: 1 } as never);
  assert.equal(withNext.title, "AA1234 · RDU → DFW");
  assert.equal(withNext.status, "NEXT");
  assert.equal(withNext.opens, "flights");
  const none = flightsSlide({ next: null, arrivalCount: 1, returnCount: 0 } as never);
  assert.equal(none.title, "Flights");
  assert.equal(none.when, "No upcoming flights");
  assert.equal(flightsSlide(undefined).when, "Add your flights");
});

test("Big Board slides: no itinerary = Flights; nothing ahead = one Itinerary slide; plans in time order with NEXT first", () => {
  assert.equal(homeSlides(undefined, "2026-04-22T08:00", undefined, undefined)[0].key, "flights");
  const past = [{ id: "a", kind: "dinner", title: "Dinner", startsAt: "2026-04-20T19:00" }];
  const nothing = homeSlides(past as never, "2026-04-22T08:00", undefined, undefined);
  assert.deepEqual(nothing.map((s) => [s.key, s.when]), [["nothing", "Nothing else coming up"]]);
  const plans = [{ id: "b", kind: "dinner", title: "Dinner", startsAt: "2026-04-22T19:00" }, { id: "c", kind: "teeTime", title: "Round 2", startsAt: "2026-04-23T08:00" }];
  const slides = homeSlides(plans as never, "2026-04-22T08:00", undefined, undefined);
  assert.deepEqual(slides.map((s) => s.key), ["b", "c"]);
  assert.equal(slides[0].status, "NEXT");
  assert.ok(slides.every((s) => s.opens === "itinerary"));
});
