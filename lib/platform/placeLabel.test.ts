import { test } from "node:test";
import assert from "node:assert/strict";
import { shortPlace } from "./placeLabel.ts";

test("US destinations show the state code", () => {
  assert.equal(shortPlace("Scottsdale, AZ, USA"), "Scottsdale, AZ");
  assert.equal(shortPlace("Austin, Texas"), "Austin, TX");
  assert.equal(shortPlace("Pinehurst, North Carolina, United States"), "Pinehurst, NC");
});

test("international destinations show the country code", () => {
  assert.equal(shortPlace("Banff, AB, Canada"), "Banff, CA");
  assert.equal(shortPlace("St Andrews, UK"), "St Andrews, GB");
  assert.equal(shortPlace("Paris, France"), "Paris, FR");
  assert.equal(shortPlace("Cabo San Lucas, B.C.S., Mexico"), "Cabo San Lucas, MX");
});

test("unreadable or single-part destinations are returned as-is", () => {
  assert.equal(shortPlace("Las Vegas"), "Las Vegas");
  assert.equal(shortPlace("  "), "");
  assert.equal(shortPlace("Somewhere, Nowhereland"), "Somewhere, Nowhereland");
});
