import { test } from "node:test";
import assert from "node:assert/strict";
import { canEdit, canPublish, canSee, featuredTrip, myDrafts, postCounts, readMinutes, statusLabel, tabPosts, videoSource, waitingForApproval, type FeaturedTrip, type RibbonItem, type RibbonPost } from "./ribbon";

const now = new Date("2026-11-02T12:00:00Z");
const post = (id: string, changes: Partial<RibbonPost> = {}): RibbonPost => ({
  id, kind: "post", format: "story", tab: "Teaching", title: id, summary: "", coverImage: "/x.jpg", blocks: [], status: "published",
  publishAt: "2026-11-01T09:00:00Z", createdBy: "poster-1", updatedAt: "2026-11-01T08:00:00Z", ...changes,
});
const fallback: FeaturedTrip = { city: "Palm Springs", region: "California", length: "3 nights", players: 4, image: "/mh.webp", tiers: [] };
const admin = { role: "admin" as const, profileId: "admin-1" };
const poster = { role: "poster" as const, profileId: "poster-1" };
const otherPoster = { role: "poster" as const, profileId: "poster-2" };
const player = { role: null, profileId: "player-1" };

test("players only see live posts; drafts, pending and scheduled stay hidden", () => {
  const items = [post("live"), post("draft", { status: "draft" }), post("pending", { status: "pending" }), post("later", { publishAt: "2026-11-09T09:00:00Z" })];
  assert.deepEqual(tabPosts(items, "Teaching", player, now).map((p) => p.id), ["live"]);
  assert.deepEqual(tabPosts(items, "Teaching", { role: "invited", profileId: "poster-1" }, now).map((p) => p.id), ["live"]);
  assert.equal(tabPosts(items, "Teaching", admin, now).length, 4);
});

test("the newest post is first; a scheduled post's future date can't put it above a newer live post", () => {
  const items = [post("yesterday"), post("later", { publishAt: "2026-11-09T09:00:00Z", updatedAt: "2026-11-01T10:00:00Z" }), post("justNow", { publishAt: "2026-11-02T11:59:00Z" }), post("draft", { status: "draft", publishAt: null, updatedAt: "2026-11-02T08:00:00Z" })];
  assert.deepEqual(tabPosts(items, "Teaching", admin, now).map((p) => p.id), ["justNow", "draft", "later", "yesterday"]);
  // Once its date arrives, the scheduled post is the newest.
  assert.equal(tabPosts(items, "Teaching", admin, new Date("2026-11-09T09:00:00Z"))[0].id, "later");
});

test("feed order compares real times, whichever way the time is written", () => {
  const items = [post("older", { publishAt: "2026-11-02T12:00:00+05:00" }), post("newer", { publishAt: "2026-11-02T08:00:00.750Z" })];
  assert.deepEqual(tabPosts(items, "Teaching", player, now).map((p) => p.id), ["newer", "older"]);
});

test("tabs stay separate and trip plans never show as posts", () => {
  const trip: RibbonItem = { id: "t", kind: "trip_plan", tab: "Explore", trip: fallback, status: "published", publishAt: null, createdBy: "admin-1", updatedAt: "2026-11-01T00:00:00Z" };
  const items = [post("teach"), post("news", { tab: "News" }), trip];
  assert.deepEqual(tabPosts(items, "News", admin, now).map((p) => p.id), ["news"]);
  assert.deepEqual(tabPosts(items, "Explore", admin, now), []);
});

test("a poster sees their own unpublished posts but not another poster's", () => {
  const items = [post("mine", { status: "pending" }), post("theirs", { status: "draft", createdBy: "poster-2" })];
  assert.deepEqual(tabPosts(items, "Teaching", poster, now).map((p) => p.id), ["mine"]);
  assert.equal(canSee(items[1], poster, now), false);
});

test("only admins publish; posters edit only their own unpublished posts", () => {
  assert.equal(canPublish(admin), true);
  assert.equal(canPublish(poster), false);
  assert.equal(canEdit(post("x", { status: "draft" }), poster), true);
  assert.equal(canEdit(post("x", { status: "draft" }), otherPoster), false);
  assert.equal(canEdit(post("x"), poster), false, "a live post is edited by an admin or through a new draft");
  assert.equal(canEdit(post("x", { createdBy: "poster-2" }), admin), true);
  assert.equal(canEdit(post("x", { status: "draft" }), player), false);
});

test("Explore always has a featured trip: newest live plan, else the built-in one", () => {
  assert.equal(featuredTrip([], now, fallback).trip.city, "Palm Springs");
  const plan = (id: string, city: string, publishAt: string, status: RibbonItem["status"] = "published"): RibbonItem =>
    ({ id, kind: "trip_plan", tab: "Explore", trip: { ...fallback, city }, status, publishAt, createdBy: "admin-1", updatedAt: publishAt });
  const items = [plan("a", "Scottsdale", "2026-10-20T00:00:00Z"), plan("b", "Pinehurst", "2026-10-27T00:00:00Z"), plan("c", "Bandon", "2026-11-09T00:00:00Z"), plan("d", "Kiawah", "2026-11-01T00:00:00Z", "pending")];
  assert.equal(featuredTrip(items, now, fallback).trip.city, "Pinehurst");
  assert.equal(featuredTrip(items, new Date("2026-11-10T00:00:00Z"), fallback).trip.city, "Bandon", "a scheduled plan takes over on its date");
});

test("waiting list is oldest first; my drafts are only mine and unpublished", () => {
  const items = [post("new", { status: "pending", updatedAt: "2026-11-02T00:00:00Z" }), post("old", { status: "pending", updatedAt: "2026-10-30T00:00:00Z" }), post("done"), post("back", { status: "changes_requested" }), post("x", { status: "draft", createdBy: "poster-2" })];
  assert.deepEqual(waitingForApproval(items).map((i) => i.id), ["old", "new"]);
  assert.deepEqual(myDrafts(items, "poster-1").map((i) => i.id).sort(), ["back", "new", "old"]);
});

test("content team counts credit the writer and find the last published date", () => {
  const items = [post("a", { publishAt: "2026-10-01T00:00:00Z" }), post("b", { publishAt: "2026-10-15T00:00:00Z" }), post("c", { status: "pending" }), post("d", { status: "changes_requested" }), post("e", { createdBy: "poster-2" })];
  assert.deepEqual(postCounts(items, "poster-1"), { published: 2, waiting: 1, sentBack: 1, lastPublishedAt: "2026-10-15T00:00:00Z" });
  assert.deepEqual(postCounts(items, "nobody"), { published: 0, waiting: 0, sentBack: 0, lastPublishedAt: null });
});

test("status words", () => {
  assert.equal(statusLabel(post("a"), now), "Live");
  assert.match(statusLabel(post("a", { publishAt: "2026-11-06T17:00:00Z" }), now), /^Scheduled · /);
  assert.equal(statusLabel(post("a", { status: "pending" }), now), "Waiting for approval");
  assert.equal(statusLabel(post("a", { status: "changes_requested" }), now), "Sent back");
  assert.equal(statusLabel(post("a", { status: "draft" }), now), "Draft");
});

test("read time counts words in the story and its captions", () => {
  assert.equal(readMinutes(post("short")), 1);
  const words = (n: number) => Array.from({ length: n }, () => "golf").join(" ");
  assert.equal(readMinutes(post("long", { blocks: [{ type: "text", text: words(500) }, { type: "photo", src: "/p.jpg", caption: words(100) }] })), 3);
});

test("videos: YouTube links embed, uploads and site files play directly, junk is ignored", () => {
  assert.deepEqual(videoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), { kind: "youtube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0" });
  assert.equal(videoSource("https://youtu.be/dQw4w9WgXcQ?t=4")?.kind, "youtube");
  assert.equal(videoSource("https://youtube.com/shorts/dQw4w9WgXcQ")?.kind, "youtube");
  assert.deepEqual(videoSource("/videos/home-hero.mp4"), { kind: "file", src: "/videos/home-hero.mp4" });
  assert.equal(videoSource("blob:http://localhost/abc")?.kind, "file");
  assert.equal(videoSource("not a link"), null);
  assert.equal(videoSource(" "), null);
});
