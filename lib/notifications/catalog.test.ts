import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG_LONG_VALUES, CATALOG_SAMPLE_VALUES, NOTIFICATION_CATALOG, NOTIFICATION_ICONS, NOTIFICATION_KINDS, NOTIFICATION_SWITCHES, blanksIn, catalogEntry, fillBlanks, kindsForSwitch } from "./catalog.ts";
import { BODY_LIMIT, TITLE_LIMIT, safeAppLink } from "./format.ts";
import { DEFAULT_PREFERENCES, NOTIFICATION_TYPES, preferenceChangeFromBody } from "../profile/preferences.ts";

test("every kind appears once and the kinds list is built from the catalog", () => {
  assert.equal(new Set(NOTIFICATION_KINDS).size, NOTIFICATION_CATALOG.length);
  assert.deepEqual(NOTIFICATION_KINDS, NOTIFICATION_CATALOG.map((entry) => entry.kind));
  for (const kind of ["friendRequest", "draftStarting", "yourPick", "chat", "highlight", "travel", "announcement", "teeTime"] as const) assert.ok(catalogEntry(kind));
});

test("every type has a known Settings switch (or is always on), and every switch turns off at least one type", () => {
  const switchIds = NOTIFICATION_SWITCHES.map((item) => item.id) as string[];
  for (const entry of NOTIFICATION_CATALOG) assert.ok(entry.switch === null || switchIds.includes(entry.switch), entry.kind);
  for (const { id } of NOTIFICATION_SWITCHES) assert.ok(kindsForSwitch(id).length > 0, `${id} has no type`);
  assert.deepEqual(NOTIFICATION_CATALOG.filter((entry) => entry.switch === null).map((entry) => entry.kind), ["announcement"]);
});

test("Settings shows exactly the catalog's switches; defaults and saving follow them", () => {
  assert.deepEqual(NOTIFICATION_TYPES.map((item) => item.id), NOTIFICATION_SWITCHES.map((item) => item.id));
  for (const { id, email } of NOTIFICATION_SWITCHES) assert.deepEqual(DEFAULT_PREFERENCES.notifications[id], { push: true, email });
  for (const id of ["bigMoments", "travel"]) assert.equal(preferenceChangeFromBody({ notification: id, channel: "push", on: false }).ok, true);
});

test("every type has an icon, at least one surface and a safe same-app tap link once filled", () => {
  for (const entry of NOTIFICATION_CATALOG) {
    assert.ok((NOTIFICATION_ICONS as readonly string[]).includes(entry.icon), entry.kind);
    assert.ok(entry.surfaces.length > 0, entry.kind);
    const link = fillBlanks(entry.link, CATALOG_SAMPLE_VALUES);
    assert.equal(safeAppLink(link), link, `${entry.kind}: ${link}`);
    assert.ok(entry.audience && entry.trigger, entry.kind);
  }
});

test("written types have 3 wordings that fill completely and fit the push limits with long names", () => {
  for (const entry of NOTIFICATION_CATALOG) {
    if (!entry.wording) { assert.ok(entry.sheetCategories?.length, `${entry.kind} needs wording or sheet categories`); continue; }
    assert.equal(entry.wording.length, 3, entry.kind);
    for (const { title, body } of entry.wording) {
      for (const blank of blanksIn(title + body)) assert.ok(blank in CATALOG_SAMPLE_VALUES, `${entry.kind}: no sample for {${blank}}`);
      const longTitle = fillBlanks(title, CATALOG_LONG_VALUES), longBody = fillBlanks(body, CATALOG_LONG_VALUES);
      assert.ok(longTitle.length <= TITLE_LIMIT, `${entry.kind} title too long: ${longTitle}`);
      // Chat's body is the person's own message; the phone cuts long ones off with "…" (format.ts clip).
      if (entry.kind !== "chat") assert.ok(longBody.length <= BODY_LIMIT, `${entry.kind} body too long: ${longBody}`);
    }
  }
});

test("new wording stays unapproved until the owner signs off", () => {
  assert.deepEqual(NOTIFICATION_CATALOG.filter((entry) => entry.approved).map((entry) => entry.kind), []);
});

test("fillBlanks fills known blanks and leaves unknown ones visible", () => {
  assert.equal(fillBlanks("{Player} joined {Trip}", { Player: "Cam", Trip: "Desert Classic" }), "Cam joined Desert Classic");
  assert.equal(fillBlanks("Hi {Nobody}", {}), "Hi {Nobody}");
  assert.deepEqual(blanksIn("{Trip ID} and {Round}"), ["Trip ID", "Round"]);
});
