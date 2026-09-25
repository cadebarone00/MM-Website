// lib/live/viewerLocalTime.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { formatViewerLocalTeeTime } from "./viewerLocalTime.ts";

test("formatViewerLocalTeeTime formats using the runtime's own local timezone, with a short zone label", () => {
  const date = new Date("2027-07-15T14:30:00.000Z");
  const expected = `${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ${date.toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ").pop()}`;
  assert.equal(formatViewerLocalTeeTime(date), expected);
});
