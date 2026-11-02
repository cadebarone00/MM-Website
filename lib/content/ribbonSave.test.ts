import { test } from "node:test";
import assert from "node:assert/strict";
import type { RibbonPost, Viewer } from "./ribbon";
import { allowedLink, allowedMedia, itemFromBody, itemProblem, mediaProblem, planSave, uploadProblem } from "./ribbonSave";

const ID = "11111111-1111-4111-8111-111111111111";
const BASE = "https://cdn.example.com";
const NOW = new Date("2026-10-30T12:00:00Z");
const admin: Viewer = { role: "admin", profileId: "a" };
const poster: Viewer = { role: "poster", profileId: "p" };
const post = (changes: Partial<RibbonPost> = {}): RibbonPost => ({ id: ID, kind: "post", format: "story", tab: "News", title: "Title", summary: "", coverImage: "/a.jpg", blocks: [], status: "draft", publishAt: null, createdBy: "p", updatedAt: "2026-10-01T00:00:00Z", ...changes });

test("a Poster can never publish, schedule or unpublish, whatever the screen asks for", () => {
  for (const mode of ["publish", "schedule", "unpublish"] as const) {
    const plan = planSave(post(), mode, "2030-01-01T00:00:00Z", poster, NOW);
    assert.equal(plan.ok, false);
    if (!plan.ok) assert.equal(plan.status, 403);
  }
});

test("a Poster's send for approval goes to pending and clears the old note", () => {
  const plan = planSave(post({ status: "changes_requested", reviewNote: "Brighter photo" }), "submit", null, poster, NOW);
  assert.deepEqual(plan, { ok: true, changes: { status: "pending", publishAt: null, reviewNote: null, approved: false } });
});

test("a Poster's draft of a sent-back post keeps the note and stays sent back", () => {
  const plan = planSave(post({ status: "changes_requested", reviewNote: "Brighter photo" }), "draft", null, poster, NOW);
  assert.deepEqual(plan, { ok: true, changes: { status: "changes_requested", publishAt: null, reviewNote: "Brighter photo", approved: false } });
});

test("a Poster can't edit someone else's post or their own live post", () => {
  assert.equal(planSave(post({ createdBy: "other" }), "draft", null, poster, NOW).ok, false);
  assert.equal(planSave(post({ status: "published", publishAt: NOW.toISOString() }), "draft", null, poster, NOW).ok, false);
});

test("people outside the team, including someone only invited, can't post", () => {
  for (const viewer of [{ role: null, profileId: null }, { role: null, profileId: "x" }, { role: "invited", profileId: "x" }] as Viewer[]) {
    assert.equal(planSave(null, "draft", null, viewer, NOW).ok, false);
  }
});

test("an Admin publishes now, schedules for the future, and can't schedule for the past", () => {
  assert.deepEqual(planSave(post(), "publish", null, admin, NOW), { ok: true, changes: { status: "published", publishAt: NOW.toISOString(), reviewNote: null, approved: true } });
  const later = planSave(post(), "schedule", "2026-11-01T00:00:00Z", admin, NOW);
  assert.equal(later.ok && later.changes.publishAt, "2026-11-01T00:00:00.000Z");
  for (const when of ["2026-01-01T00:00:00Z", "not a date", null]) assert.equal(planSave(post(), "schedule", when, admin, NOW).ok, false);
});

test("an Admin's unpublish takes the post down", () => {
  const plan = planSave(post({ status: "published", publishAt: NOW.toISOString() }), "unpublish", null, admin, NOW);
  assert.equal(plan.ok && plan.changes.status, "draft");
  assert.equal(plan.ok && plan.changes.publishAt, null);
});

test("itemFromBody drops status, author and dates sent by the app", () => {
  const item = itemFromBody({ ...post(), status: "published", publishAt: "2020-01-01", createdBy: "someone-else", reviewNote: "x" })!;
  assert.equal(item.status, "draft");
  assert.equal(item.publishAt, null);
  assert.equal(item.createdBy, "");
});

test("itemFromBody refuses a bad id, kind or tab", () => {
  for (const changes of [{ id: "new-123" }, { id: "../../x" }, { kind: "other" }, { tab: "Admin" }, { format: "long" }]) assert.equal(itemFromBody({ ...post(), ...changes }), null);
  assert.equal(itemFromBody(null), null);
});

test("itemFromBody trims a Quick post to its limits and removes story parts", () => {
  const item = itemFromBody({ ...post(), format: "quick", title: "x".repeat(500), summary: "gone", blocks: [{ type: "text", text: "gone" }] }) as RibbonPost;
  assert.equal(item.title.length, 200);
  assert.equal(item.summary, "");
  assert.deepEqual(item.blocks, []);
});

test("itemProblem names what's missing", () => {
  assert.match(itemProblem(post({ title: " " }))!, /headline/);
  assert.match(itemProblem(post({ coverImage: "" }))!, /cover photo/);
  assert.match(itemProblem(post({ format: "quick", coverImage: "" }))!, /photo or a video/);
  assert.equal(itemProblem(post()), null);
});

test("media must come from this post's own folder or the site itself", () => {
  assert.equal(allowedMedia(`${BASE}/ribbon/${ID}/a.jpg`, ID, BASE), true);
  assert.equal(allowedMedia("/teams/a.jpg", ID, BASE), true);
  assert.equal(allowedMedia(`${BASE}/ribbon/other/a.jpg`, ID, BASE), false);
  assert.equal(allowedMedia(`${BASE}/ribbon/${ID}/../../a.jpg`, ID, BASE), false);
  assert.equal(allowedMedia("https://evil.example/a.jpg", ID, BASE), false);
  assert.equal(allowedMedia("//evil.example/a.jpg", ID, BASE), false);
  assert.equal(allowedMedia("blob:http://localhost/a", ID, BASE), false);
  assert.equal(mediaProblem(post({ coverImage: "https://evil.example/a.jpg" }), BASE) !== null, true);
});

test("videos can be uploads or YouTube links, not files from other sites", () => {
  const video = (url: string) => mediaProblem(post({ blocks: [{ type: "video", url }] }), BASE);
  assert.equal(video("https://youtu.be/dQw4w9WgXcQ"), null);
  assert.equal(video(`${BASE}/ribbon/${ID}/a.mp4`), null);
  assert.notEqual(video("https://evil.example/a.mp4"), null);
});

test("link buttons refuse anything that could run code", () => {
  assert.equal(allowedLink("https://example.com"), true);
  assert.equal(allowedLink("/tournaments"), true);
  for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "//evil.example", "nonsense"]) assert.equal(allowedLink(url), false);
  assert.notEqual(mediaProblem(post({ blocks: [{ type: "link", label: "Go", url: "javascript:alert(1)" }] }), BASE), null);
});

test("uploads are limited by type and size", () => {
  assert.equal(uploadProblem("image/jpeg", 1000), null);
  assert.equal(uploadProblem("video/mp4", 400_000_000), null);
  assert.notEqual(uploadProblem("image/jpeg", 16_000_000), null);
  assert.notEqual(uploadProblem("video/mp4", 600_000_000), null);
  assert.notEqual(uploadProblem("image/svg+xml", 1000), null);
  assert.notEqual(uploadProblem("text/html", 1000), null);
  assert.notEqual(uploadProblem("image/jpeg", 0), null);
  assert.notEqual(uploadProblem(undefined, 1000), null);
});
