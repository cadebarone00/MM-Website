import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { accessDecision, classifyPath, enforcementEnabled, STATUS_PAGE, type AccessCategory, type LifecycleWord } from "./accessPolicy.ts";

// Pending accounts Phase 5: the access policy table and decisions.

/** Every file named `name` under `dir` (skipping dev-only folders). */
function files(dir: string, name: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { if (!/^(dev|dev-v1|dev-website)$/.test(entry)) out.push(...files(full, name)); }
    else if (entry === name) out.push(full);
  }
  return out;
}
/** app/golf-trips/[tripId]/page.tsx -> /golf-trips/x-tripId (a concrete path the rules must match). */
const toPath = (file: string, suffix: string) => file.replace(/\\/g, "/").replace(/^app/, "").replace(suffix, "").replace(/\[(\.\.\.)?([^\]]+)\]/g, "x-$2") || "/";
const methodsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);

test("COVERAGE: every API route file and method is matched by an explicit rule", () => {
  const routes = files("app/api", "route.ts");
  assert.ok(routes.length > 150, `found ${routes.length} routes`);
  const unmatched: string[] = [];
  for (const file of routes) for (const method of methodsOf(file)) {
    if (!classifyPath(toPath(file, "/route.ts"), method).rule) unmatched.push(`${method} ${toPath(file, "/route.ts")}`);
  }
  assert.deepEqual(unmatched, [], "add a rule to API_RULES for each of these");
});

test("COVERAGE: every page is matched by an explicit rule", () => {
  const pages = files("app", "page.tsx");
  assert.ok(pages.length > 100, `found ${pages.length} pages`);
  const unmatched = pages.map((p) => toPath(p, "/page.tsx")).filter((path) => !classifyPath(path).rule);
  assert.deepEqual(unmatched, [], "add a rule to PAGE_RULES for each of these");
});

test("the protected inventory: Play, golf, tournaments, rounds, social, admin are Active-only", () => {
  const active: [string, string][] = [
    ["/", "GET"], ["/play/x-t/x-y", "GET"], ["/golf-trips", "GET"], ["/golf-trips/x-tripId/settings", "GET"], ["/golf-trips/new/review", "GET"],
    ["/tournaments", "GET"], ["/tournaments/code/new", "GET"], ["/tournaments/x-t/x-y/preview", "GET"], ["/rounds/new", "GET"],
    ["/profile", "GET"], ["/profile/x-username", "GET"], ["/profile/search", "GET"], ["/profile/friends", "GET"], ["/pickems", "GET"],
    ["/tap-in", "GET"], ["/dashboard", "GET"], ["/admin/tournament-access", "GET"],
    ["/api/golf-trips", "POST"], ["/api/golf-trips/x-tripId/scoring/submit", "POST"], ["/api/golf-trips/x-tripId/members", "POST"],
    ["/api/code-tournaments/join", "POST"], ["/api/code-tournaments/x-token", "GET"], ["/api/rounds/shared", "POST"], ["/api/rounds/personal", "POST"],
    ["/api/profile/friends", "POST"], ["/api/profile/search", "GET"], ["/api/account/search", "GET"], ["/api/platform/tournaments", "POST"],
    ["/api/portal/admin/matches/start", "POST"], ["/api/wagers/mm-coins/bet", "POST"], ["/api/fantasy/team", "POST"], ["/api/tap-in/display", "GET"],
    ["/api/courses/x-ref/gps", "POST"], ["/api/platform/tournament-invitations/x-token", "POST"], ["/api/code-tournaments/invite/x-token", "POST"],
  ];
  for (const [path, method] of active) assert.equal(classifyPath(path, method).category, "active", `${method} ${path}`);
});

test("onboarding, recovery, correction and deletion stay reachable (never gated)", () => {
  for (const path of ["/api/account/birthday", "/api/account/finish", "/api/account/onboarding", "/api/account/birthday-correction", "/api/account/terms",
    "/api/account/delete", "/api/account/sessions", "/api/account/password", "/api/account/profile", "/api/account/photo", "/api/account/privacy",
    "/api/account/initialize", "/api/auth/login", "/api/auth/signup", "/api/auth/signout", "/api/auth/forgot-password", "/api/auth/reset-password"]) {
    assert.ok(["account", "public"].includes(classifyPath(path, "POST").category), path);
  }
  for (const page of ["/settings", "/settings/delete-account", STATUS_PAGE, "/login", "/login/email", "/signup", "/forgot-password", "/reset-password", "/auth/website-complete"]) {
    assert.ok(["account", "public"].includes(classifyPath(page).category), page);
  }
  assert.equal(classifyPath("/api/internal/account-deletions").category, "internal");
});

test("public pages and read-only endpoints stay public; invitations are their own category", () => {
  for (const [path, method, category] of [
    ["/website", "GET", "public"], ["/t/x-t/x-y", "GET", "public"], ["/watch/x-code", "GET", "public"], ["/tournaments/live/x-id", "GET", "public"],
    ["/leaderboard/x-slug", "GET", "public"], ["/portal/admin/scorecards", "GET", "public"],
    ["/api/watch/x-code", "GET", "public"], ["/api/code-tournaments/public", "GET", "public"], ["/api/courses/search", "GET", "public"],
    ["/api/courses/x-ref", "GET", "public"], ["/api/wagers/team-winner", "GET", "public"], ["/api/live/standings", "GET", "public"],
    ["/golf-trips/invite/x-token", "GET", "invite"], ["/tournaments/invite/x-token", "GET", "invite"], ["/tournaments/code/invite/x-token", "GET", "invite"],
    ["/api/golf-trips/invitations/x-token", "POST", "invite"], ["/api/golf-trips/invitations/x-token/decline", "POST", "invite"],
    ["/api/platform/tournament-invitations/x-token", "GET", "invite"], ["/api/code-tournaments/invite/x-token", "GET", "invite"],
  ] as [string, string, AccessCategory][]) assert.equal(classifyPath(path, method).category, category, `${method} ${path}`);
  assert.equal(classifyPath("/some/new/page").category, "active", "unknown pages fail closed");
  assert.equal(classifyPath("/api/some/new/thing").category, "active", "unknown APIs fail closed");
});

test("decisions: Active passes; every other state is redirected (pages) or refused with a fixed code (APIs)", () => {
  const states: LifecycleWord[] = ["pending", "active_needs_birthday", "ineligible", "review", "closed", "unavailable"];
  assert.deepEqual(accessDecision("active", "active", false), { type: "allow" });
  assert.deepEqual(accessDecision("active", "active", true), { type: "allow" });
  for (const s of states) assert.deepEqual(accessDecision("active", s, false), { type: "redirect", location: STATUS_PAGE }, s);
  const codes = Object.fromEntries(states.map((s) => { const d = accessDecision("active", s, true); return [s, d.type === "deny" ? [d.status, d.body.code] : d.type]; }));
  assert.deepEqual(codes, { pending: [403, "finish_onboarding"], active_needs_birthday: [403, "finish_onboarding"], ineligible: [403, "not_eligible"],
    review: [403, "restricted"], closed: [401, "account_closed"], unavailable: [503, "unavailable"] });
  for (const s of states) {
    const d = accessDecision("active", s, true);
    assert.ok(d.type === "deny" && Object.keys(d.body).sort().join() === "code,error,next,ok", "fixed shape, nothing private");
  }
});

test("decisions: signed-out, public, account and internal always pass; invitations admit Pending but not Ineligible", () => {
  for (const c of ["public", "account", "internal", "invite", "active"] as AccessCategory[]) assert.deepEqual(accessDecision(c, "signed-out", true), { type: "allow" }, c);
  for (const s of ["pending", "ineligible", "review", "closed", "unavailable"] as LifecycleWord[]) {
    assert.deepEqual(accessDecision("account", s, true), { type: "allow" }, `account/${s}`);
    assert.deepEqual(accessDecision("public", s, false), { type: "allow" }, `public/${s}`);
  }
  for (const s of ["pending", "active", "active_needs_birthday"] as LifecycleWord[]) assert.deepEqual(accessDecision("invite", s, true), { type: "allow" }, s);
  for (const s of ["ineligible", "review", "closed", "unavailable"] as LifecycleWord[]) assert.notEqual(accessDecision("invite", s, true).type, "allow", s);
});

test("the switch is OFF unless exactly 'on'", () => {
  assert.equal(enforcementEnabled({}), false);
  for (const v of ["", "true", "1", "ON", "yes", "enabled"]) assert.equal(enforcementEnabled({ MAROON_ACCOUNT_ENFORCEMENT: v }), false, v);
  assert.equal(enforcementEnabled({ MAROON_ACCOUNT_ENFORCEMENT: "on" }), true);
});
