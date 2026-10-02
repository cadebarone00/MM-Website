import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAutocomplete, parseDetails } from "./providers/googlePlaces.ts";
import { getPlace, locationFailureStatus, searchPlaces } from "./locationService.ts";

const KEY = { GOOGLE_PLACES_API_KEY: "test-key" };
const SESSION = "6f1c2a52-8a3e-4c4e-9d55-0d3c8a1b2c3d";
const PLACE_ID = "ChIJ-bfVTh8FrIkRbkHh-dl5xIk";

const AUTOCOMPLETE = {
  suggestions: [
    { placePrediction: { place: `places/${PLACE_ID}`, placeId: PLACE_ID, text: { text: "Pinehurst, NC, USA" },
      structuredFormat: { mainText: { text: "Pinehurst" }, secondaryText: { text: "NC, USA" } } } },
    { queryPrediction: { text: { text: "pinehurst golf" } } },
    { placePrediction: { placeId: "ChIJno-format", text: { text: "Pinehurst Resort" } } },
    { placePrediction: { placeId: "", text: { text: "No id" } } },
  ],
};
const DETAILS = { id: PLACE_ID, displayName: { text: "Pinehurst" }, formattedAddress: "Pinehurst, NC, USA", location: { latitude: 35.1954, longitude: -79.4695 } };

/** A stand-in for Google that records what it was asked. */
function fakeGoogle(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test("Google suggestions become our PlaceSuggestion list (place suggestions only)", () => {
  assert.deepEqual(parseAutocomplete(AUTOCOMPLETE), [
    { placeId: PLACE_ID, text: "Pinehurst, NC, USA", mainText: "Pinehurst", secondaryText: "NC, USA" },
    { placeId: "ChIJno-format", text: "Pinehurst Resort", mainText: "Pinehurst Resort", secondaryText: "" },
  ]);
  for (const junk of [null, {}, { suggestions: "x" }, []]) assert.deepEqual(parseAutocomplete(junk), []);
  const many = { suggestions: Array.from({ length: 8 }, (_, i) => ({ placePrediction: { placeId: `id${i}`, text: { text: `Place ${i}` } } })) };
  assert.equal(parseAutocomplete(many).length, 5, "at most 5");
});

test("Google place details become our PlaceLocation, or null without real coordinates", () => {
  assert.deepEqual(parseDetails(DETAILS), { placeId: PLACE_ID, name: "Pinehurst, NC, USA", latitude: 35.1954, longitude: -79.4695 });
  assert.equal(parseDetails({ ...DETAILS, formattedAddress: undefined })?.name, "Pinehurst");
  assert.equal(parseDetails({ ...DETAILS, location: undefined }), null);
  assert.equal(parseDetails({ ...DETAILS, location: { latitude: "35", longitude: -79 } }), null);
  assert.equal(parseDetails({ ...DETAILS, location: { latitude: 95, longitude: -79 } }), null);
  assert.equal(parseDetails({ ...DETAILS, id: undefined }), null);
  assert.equal(parseDetails(null), null);
});

test("search sends the key in a header (never the URL), the typed text and the session token", async () => {
  const google = fakeGoogle(200, AUTOCOMPLETE);
  const result = await searchPlaces("  Pinehurst ", SESSION, KEY, google.fetchImpl);
  assert.equal(result.ok && result.data.length, 2);
  const [call] = google.calls;
  assert.equal(call.url, "https://places.googleapis.com/v1/places:autocomplete");
  assert.equal(call.init.method, "POST");
  assert.equal((call.init.headers as Record<string, string>)["X-Goog-Api-Key"], "test-key");
  assert.deepEqual(JSON.parse(String(call.init.body)), { input: "Pinehurst", sessionToken: SESSION });
});

test("details asks only for the fields we use, with the same session token", async () => {
  const google = fakeGoogle(200, DETAILS);
  const result = await getPlace(PLACE_ID, SESSION, KEY, google.fetchImpl);
  assert.deepEqual(result, { ok: true, data: { placeId: PLACE_ID, name: "Pinehurst, NC, USA", latitude: 35.1954, longitude: -79.4695 } });
  const [call] = google.calls;
  assert.equal(call.url, `https://places.googleapis.com/v1/places/${PLACE_ID}?sessionToken=${SESSION}`);
  assert.equal((call.init.headers as Record<string, string>)["X-Goog-FieldMask"], "id,displayName,formattedAddress,location");
  assert.equal(call.url.includes("test-key"), false);
});

test("no key, bad input or a Google failure come back as codes without calling Google needlessly", async () => {
  const google = fakeGoogle(200, AUTOCOMPLETE);
  assert.deepEqual(await searchPlaces("Pinehurst", SESSION, {}, google.fetchImpl), { ok: false, code: "NOT_CONFIGURED" });
  assert.deepEqual(await searchPlaces("Pinehurst", SESSION, { GOOGLE_PLACES_API_KEY: "  " }, google.fetchImpl), { ok: false, code: "NOT_CONFIGURED" });
  assert.deepEqual(await searchPlaces("Pi", SESSION, KEY, google.fetchImpl), { ok: false, code: "BAD_INPUT" });
  assert.deepEqual(await searchPlaces("x".repeat(101), SESSION, KEY, google.fetchImpl), { ok: false, code: "BAD_INPUT" });
  assert.deepEqual(await searchPlaces("Pinehurst", "bad token!", KEY, google.fetchImpl), { ok: false, code: "BAD_INPUT" });
  assert.deepEqual(await getPlace("../../evil", SESSION, KEY, google.fetchImpl), { ok: false, code: "BAD_INPUT" });
  assert.equal(google.calls.length, 0);

  const original = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await searchPlaces("Pinehurst", SESSION, KEY, fakeGoogle(403, { error: {} }).fetchImpl), { ok: false, code: "PROVIDER_ERROR" });
    assert.deepEqual(await getPlace(PLACE_ID, SESSION, KEY, fakeGoogle(200, { id: PLACE_ID }).fetchImpl), { ok: false, code: "PROVIDER_ERROR" });
    const offline = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    assert.deepEqual(await getPlace(PLACE_ID, SESSION, KEY, offline), { ok: false, code: "PROVIDER_ERROR" });
  } finally {
    console.error = original;
  }
  assert.deepEqual(["NOT_CONFIGURED", "BAD_INPUT", "PROVIDER_ERROR"].map((c) => locationFailureStatus(c as "BAD_INPUT")), [503, 400, 502]);
});
