import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceLabel, distanceMiles, isAppleDevice, mapsLink, placeBadge, placesToRate, rankedHighly, rankPlaces, validRating, withRatings, type Place } from "./venuePlaces.ts";

const venue = { latitude: 33.4942, longitude: -111.9261 }; // Scottsdale
const place = (over: Partial<Place>): Place => ({ id: "x", name: "Spot", category: "food", latitude: 33.5, longitude: -111.93, tripAdds: 0, ...over });

test("distance in miles and its label", () => {
  assert.ok(Math.abs(distanceMiles(venue, { latitude: 33.4484, longitude: -112.074 }) - 9.2) < 0.3, "Scottsdale → Phoenix ≈ 9 mi");
  assert.equal(distanceLabel(0.05), "Right here");
  assert.equal(distanceLabel(2.345), "2.3 mi away");
  assert.equal(distanceLabel(14.6), "15 mi away");
});

test("Open in Maps: Apple Maps on Apple devices, Google Maps otherwise; names are encoded", () => {
  const p = { name: "Fat Ox & Co", address: "6316 N Scottsdale Rd", latitude: 33.53, longitude: -111.92 };
  assert.equal(mapsLink(p, true), "https://maps.apple.com/?q=Fat%20Ox%20%26%20Co%2C%206316%20N%20Scottsdale%20Rd&ll=33.53,-111.92");
  assert.equal(mapsLink(p, false), "https://www.google.com/maps/search/?api=1&query=Fat%20Ox%20%26%20Co%2C%206316%20N%20Scottsdale%20Rd");
  assert.equal(isAppleDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), true);
  assert.equal(isAppleDevice("Mozilla/5.0 (Linux; Android 15; Pixel 9)"), false);
});

test("ranking: group saves, then trip adds, then distance; badges", () => {
  const near = place({ id: "near", latitude: 33.4943 }), far = place({ id: "far", latitude: 33.6 });
  const popular = place({ id: "popular", latitude: 33.6, tripAdds: 4 }), saved = place({ id: "saved", latitude: 33.7, savedByGroup: true });
  assert.deepEqual(rankPlaces([far, near, popular, saved], venue).map((p) => p.id), ["saved", "popular", "near", "far"]);
  assert.equal(placeBadge(saved), "Your group saved this");
  assert.equal(placeBadge(popular), "Added by 4 trips");
  assert.equal(placeBadge(place({ tripAdds: 1 })), "Added by 1 trip");
  assert.equal(placeBadge(near), null);
});

test("after-visit ratings: 1-10 only; averages fold in; 'Ranked highly' needs 8+ from at least 5", () => {
  assert.deepEqual([0, 1, 10, 11, 7.5, "8"].map(validRating), [false, true, true, false, false, false]);
  assert.deepEqual(withRatings({}, [8, 9, 12]), { ratingAverage: 8.5, ratingCount: 2 });
  assert.deepEqual(withRatings({ ratingAverage: 8, ratingCount: 4 }, [10]), { ratingAverage: 8.4, ratingCount: 5 });
  assert.equal(rankedHighly({ ratingAverage: 8.4, ratingCount: 5 }), true);
  assert.equal(rankedHighly({ ratingAverage: 9.5, ratingCount: 4 }), false, "too few ratings");
  assert.equal(rankedHighly({ ratingAverage: 7.9, ratingCount: 40 }), false);
  const ranked = place({ id: "ranked", latitude: 33.7, ratingAverage: 9, ratingCount: 6 }), popular = place({ id: "popular", tripAdds: 9 });
  assert.deepEqual(rankPlaces([popular, ranked], venue).map((p) => p.id), ["ranked", "popular"]);
  assert.equal(placeBadge(ranked), "Ranked highly by Maroon users");
  assert.equal(placeBadge({ ...ranked, savedByGroup: true }), "Your group saved this");
});

test("the prompt asks about yesterday's places only, once each", () => {
  const plans = [
    { placeId: "a", startsAt: "2027-04-22T19:00" }, { placeId: "a", startsAt: "2027-04-22T21:00" },
    { placeId: "b", startsAt: "2027-04-22T08:00" }, { placeId: "c", startsAt: "2027-04-23T09:00" },
    { startsAt: "2027-04-22T10:00" }, { placeId: "d", startsAt: "2027-04-22T12:00" },
  ];
  assert.deepEqual(placesToRate(plans, "2027-04-23", ["d"]).map((p) => p.placeId), ["a", "b"], "newest first, each place once");
  assert.deepEqual(placesToRate(plans, "2027-04-25", []), [], "too long ago for a 1-day window");
  assert.deepEqual(placesToRate(plans, "2027-04-25", ["b"], 3).map((p) => p.placeId), ["c", "a", "d"], "3-day window; skipped / rated left out");
  assert.deepEqual(placesToRate(plans, "2027-04-23", [], 3).map((p) => p.placeId), ["a", "d", "b"], "never today's plans");
});
