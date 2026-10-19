import { test } from "node:test";
import assert from "node:assert/strict";
import { COURSE_SHORT_NAME_MAX, courseDisplayName, courseShortName } from "./courseShortName.ts";

test("filler words come off", () => {
  assert.equal(courseShortName("PGA West Stadium Course"), "PGA West Stadium");
  assert.equal(courseShortName("Torrey Pines Golf Course"), "Torrey Pines");
  assert.equal(courseShortName("Pebble Beach Golf Links"), "Pebble Beach");
  assert.equal(courseShortName("The Olympic Club"), "Olympic");
  assert.equal(courseShortName("Dallas Athletic Club Country Club"), "Dallas Athletic");
  assert.equal(courseShortName("Whistling Straits Golf Resort & Spa"), "Whistling Straits");
});

test("club + course names: both when they fit, otherwise the named course", () => {
  assert.equal(courseShortName("Pinehurst Resort & Country Club, No. 2"), "Pinehurst No. 2");
  assert.equal(courseShortName("Bandon Dunes Golf Resort – Pacific Dunes"), "Pacific Dunes");
  assert.equal(courseShortName("PGA West - Jack Nicklaus Tournament Course"), "PGA West Jack Nicklaus"); // 22, within 24
  assert.equal(courseShortName("TPC Sawgrass – THE PLAYERS Stadium Course"), "Players Stadium");
  assert.equal(courseShortName("Mission Hills Country Club – Dinah Shore Tournament Course"), "Dinah Shore"); // "Mission Hills Dinah Shore" is 25
});

test("short or odd names are left alone", () => {
  assert.equal(courseShortName("Augusta National"), "Augusta National");
  assert.equal(courseShortName("  Spyglass   Hill  "), "Spyglass Hill");
  assert.equal(courseShortName(""), "");
  assert.equal(courseShortName("Golf Club"), "Golf Club"); // nothing would be left → keep the full name
  assert.equal(courseShortName("TPC Scottsdale"), "TPC Scottsdale"); // acronyms keep their caps
});

test("aims for the limit, never invents text", () => {
  for (const name of ["Pinehurst Resort & Country Club, No. 2", "Bandon Dunes Golf Resort – Pacific Dunes", "PGA West Stadium Course"]) {
    const short = courseShortName(name);
    assert.ok(short.length <= COURSE_SHORT_NAME_MAX, short);
    for (const word of short.split(" ")) assert.ok(name.toLowerCase().includes(word.toLowerCase()), word);
  }
  // Nothing short enough: the best try, cut off by the screen's "…" as a last resort.
  assert.equal(courseShortName("Fairmont Grand Del Mar Championship"), "Fairmont Grand Del Mar Championship");
});

test("the organizer's short name wins, trimmed and capped", () => {
  assert.equal(courseDisplayName("PGA West Stadium Course", "Stadium"), "Stadium");
  assert.equal(courseDisplayName("PGA West Stadium Course", "  "), "PGA West Stadium");
  assert.equal(courseDisplayName("PGA West Stadium Course", null), "PGA West Stadium");
  assert.equal(courseDisplayName("x", "A very long typed short name here").length, COURSE_SHORT_NAME_MAX);
});
