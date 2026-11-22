import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { MAPLIBRE_VERSION, MAPLIBRE_WORKER_URL } from "./loadMapLibre";

test("the MapLibre worker served from public/ is the same version as the installed maplibre-gl", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
  assert.equal(pkg.dependencies["maplibre-gl"], MAPLIBRE_VERSION, "package.json pins the exact version MAPLIBRE_VERSION names");
  const served = `public${MAPLIBRE_WORKER_URL}`;
  assert.ok(existsSync(served), `${served} exists`);
  assert.equal(readFileSync(served, "utf8"), readFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "utf8"), "copy matches node_modules");
});
