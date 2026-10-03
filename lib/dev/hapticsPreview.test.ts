import test from "node:test";
import assert from "node:assert/strict";
import { HAPTICS_PREVIEW_CHANNEL, parseHapticsPreview } from "./hapticsPreview";
import { lightTap, mediumImpact, success, warning, error, selectionChange } from "../haptics";

test("diagnostic events validate intensity, duration and name bounds", () => {
  assert.deepEqual(parseHapticsPreview({ intensity: 2, durationMs: 1000, name: "lightTap" }), { intensity: 2, durationMs: 1000, name: "lightTap" });
  for (const intensity of [-1, 11, 2.5, NaN, "2"]) assert.equal(parseHapticsPreview({ intensity, durationMs: 1000, name: "test" }), null);
  for (const durationMs of [0, 49, 5001, Infinity, "1000"]) assert.equal(parseHapticsPreview({ intensity: 2, durationMs, name: "test" }), null);
  assert.equal(parseHapticsPreview({ intensity: 2, durationMs: 1000 }), null);
});

test("all shared helpers emit only development-local diagnostics and remain browser-safe", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousEnvironment = process.env.NODE_ENV;
  const events: CustomEvent[] = [];
  const localWindow = { location: { pathname: "/dev", origin: "http://localhost" }, dispatchEvent: (event: CustomEvent) => { events.push(event); return true; } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: localWindow });
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    for (const helper of [lightTap, mediumImpact, success, warning, error, selectionChange]) await helper({ intensity: 7, durationMs: 400 });
    assert.equal(events.length, 6);
    assert.equal(events[0].type, HAPTICS_PREVIEW_CHANNEL);
    assert.deepEqual(events.map(event => event.detail.name), ["lightTap", "mediumImpact", "success", "warning", "error", "selectionChange"]);
    assert(events.every(event => event.detail.intensity === 7 && event.detail.durationMs === 400));
    Object.assign(process.env, { NODE_ENV: "production" });
    await lightTap();
    assert.equal(events.length, 6);
    Object.assign(process.env, { NODE_ENV: "development" });
    localWindow.location.pathname = "/";
    await lightTap();
    assert.equal(events.length, 6);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previousEnvironment });
  }
});
