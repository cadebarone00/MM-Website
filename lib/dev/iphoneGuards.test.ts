import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

test("middleware rejects production/disabled requests and strips spoofed markers on normal routes", async () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.DEV_IPHONE_PREVIEW = "true";
    for (const flag of ["VERCEL", "NETLIFY", "AWS_APP_ID", "CI"]) delete process.env[flag];
    // A configured Supabase URL cannot cause this isolated route to refresh a session.
    process.env.SUPABASE_URL = "https://must-not-be-called.invalid";
    process.env.SUPABASE_ANON_KEY = "unused";
    const request = (path: string) => new NextRequest("http://localhost:3001" + path, { headers: { "x-maroon-iphone-preview": "1", cookie: "sb-test-auth-token=untrusted" } });
    const enabled = await middleware(request("/dev-iphone"));
    assert.equal(enabled.headers.get("x-middleware-request-x-maroon-iphone-preview"), "1");
    assert.match(enabled.headers.get("content-security-policy") ?? "", /connect-src ws:/);
    assert.equal((await middleware(request("/dev-iphone/unknown"))).status, 404);
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.equal((await middleware(request("/dev-iphone"))).status, 404);
    Object.assign(process.env, { NODE_ENV: "development" });
    delete process.env.DEV_IPHONE_PREVIEW;
    assert.equal((await middleware(request("/dev-iphone"))).status, 404);
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    const normal = await middleware(request("/profile"));
    assert.equal(normal.headers.get("x-middleware-request-x-maroon-iphone-preview"), null);
    assert.equal(normal.headers.get("content-security-policy"), null);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});

test("actual iOS build phase fails closed for Release, Archive/custom configurations", () => {
  const project = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  const encoded = project.match(/shellScript = ("[^\n]+");/)?.[1];
  assert(encoded);
  const script = JSON.parse(encoded);
  for (const configuration of ["Debug", "Release", "Profile", ""]) {
    const result = spawnSync("/bin/sh", ["-c", script], { env: { ...process.env, CONFIGURATION: configuration } });
    assert.equal(result.status, configuration === "Debug" ? 0 : 1);
  }
  assert.match(project, /buildPhases = \(\s+A01234567890ABCDEF123456/);
});
