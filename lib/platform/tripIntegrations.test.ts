import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, MANUAL_PROVIDER_KEY, navigateAction, callAction, type ProviderCategory } from "./tripIntegrations.ts";
import { providerStatuses, runIntegration } from "./tripIntegrationsServer.ts";

test("every user-entered category has a manual provider", () => {
  const categories: ProviderCategory[] = ["flight", "lodging", "transportation", "golf", "place", "email", "calendar"];
  for (const c of categories) assert.ok(PROVIDERS.some((p) => p.category === c && p.key === MANUAL_PROVIDER_KEY), c);
});

test("provider keys are unique within a category", () => {
  const ids = PROVIDERS.map((p) => `${p.category}:${p.key}`);
  assert.equal(new Set(ids).size, ids.length);
});

test("a provider becomes configured only when all its env keys are set", () => {
  const yelp = (env: Record<string, string>) => providerStatuses(env).find((p) => p.key === "yelp")!.status;
  assert.equal(yelp({}), "planned");
  assert.equal(yelp({ YELP_API_KEY: "x" }), "configured");
});

test("unimplemented providers answer NOT_CONFIGURED, unknown ones UNKNOWN_PROVIDER", async () => {
  const r = await runIntegration({ category: "flight", provider: "flight-generic", action: "search", input: { q: "AA100" } });
  assert.equal(r.ok === false && r.code, "NOT_CONFIGURED");
  const u = await runIntegration({ category: "flight", provider: "nope", action: "search", input: {} });
  assert.equal(u.ok === false && u.code, "UNKNOWN_PROVIDER");
});

test("external actions", () => {
  assert.equal(navigateAction({ name: "Pinehurst No. 2", latitude: 35.19, longitude: -79.47 }).url, "https://www.google.com/maps/search/?api=1&query=35.19,-79.47");
  assert.equal(callAction("(910) 235-8507").url, "tel:9102358507");
});
