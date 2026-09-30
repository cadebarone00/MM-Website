import { test } from "node:test";
import assert from "node:assert/strict";
import type { ScheduleDay } from "@/components/platform/tournament-site/types";
import type { TournamentActivityFeed } from "./activity.ts";
import { formatPostedAt, nextSession, playPath, splitFeed, todayIn } from "./tournamentHome.ts";

const session = (id: string) => ({ id, label: `Round ${id}`, courseId: "c1", format: "Fourball", teeTime: "8:00 AM", status: "scheduled" as const });
const day = (date: string, ...ids: string[]): ScheduleDay => ({ date, label: date, sessions: ids.map(session) });

test("play paths: home has no tab segment; slugs are encoded", () => {
  assert.equal(playPath("texas-cup", 2027), "/play/texas-cup/2027");
  assert.equal(playPath("texas-cup", 2027, "leaderboard"), "/play/texas-cup/2027/leaderboard");
});

test("today is taken in the tournament's timezone", () => {
  const lateUtc = new Date("2027-05-02T03:00:00Z");
  assert.equal(todayIn("America/Chicago", lateUtc), "2027-05-01");
  assert.equal(todayIn("UTC", lateUtc), "2027-05-02");
  assert.equal(todayIn("Not/AZone", lateUtc), "2027-05-02");
});

test("next session: first round today or later, then undated, else complete or none", () => {
  const days = [day("2027-05-01", "1"), day("2027-05-02", "2", "3"), day("tbd", "4")];
  assert.deepEqual(nextSession(days, "2027-04-01"), { state: "upcoming", day: days[0], session: days[0].sessions[0] });
  assert.deepEqual(nextSession(days, "2027-05-02"), { state: "upcoming", day: days[1], session: days[1].sessions[0] });
  assert.deepEqual(nextSession(days, "2027-06-01"), { state: "upcoming", day: days[2], session: days[2].sessions[0] });
  assert.deepEqual(nextSession(days.slice(0, 2), "2027-06-01"), { state: "complete" });
  assert.deepEqual(nextSession([], "2027-06-01"), { state: "none" });
});

test("feed split keeps backend order and never adds items", () => {
  const item = (ref: string, type: TournamentActivityFeed["activity"][number]["type"]) =>
    ({ ref, type, visibility: "everyone" as const, title: null, body: null, metadata: {}, createdAt: "2027-01-01T00:00:00Z", authorName: null, summary: null });
  const feed: TournamentActivityFeed = { published: true, viewer: { signedIn: true, role: "player", isPlatformAdmin: false, canPostAnnouncement: false, canSeePlayersOnly: true },
    activity: [item("a1", "players_updated"), item("a2", "commissioner_announcement"), item("a3", "tournament_published"), item("a4", "commissioner_announcement")] };
  const { announcements, events } = splitFeed(feed);
  assert.deepEqual(announcements.map((a) => a.ref), ["a2", "a4"]);
  assert.deepEqual(events.map((a) => a.ref), ["a1", "a3"]);
});

test("posted-at is shown in the tournament's timezone", () => {
  assert.equal(formatPostedAt("2027-05-02T03:05:00Z", "America/Chicago"), "May 1 · 10:05 PM");
  assert.equal(formatPostedAt("nope", "America/Chicago"), "");
});
