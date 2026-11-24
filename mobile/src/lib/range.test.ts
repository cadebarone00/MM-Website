/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import type { RibbonPost } from "@/lib/content/ribbon";
import { cardAction, videoLink } from "./range.ts";

const post = (part: Partial<RibbonPost>): RibbonPost => ({
  id: "p", status: "published", publishAt: null, createdBy: "x", updatedAt: "2026-11-01T00:00:00Z",
  kind: "post", format: "story", tab: "Explore", title: "Title", summary: "", coverImage: "", blocks: [], ...part,
});

test("card labels match the website", () => {
  assert.equal(cardAction(post({ format: "story" })), "Read · 1 min");
  assert.equal(cardAction(post({ format: "quick", coverVideo: "/v.mp4" })), "Watch");
  assert.equal(cardAction(post({ format: "quick" })), "View");
});

test("YouTube links open on YouTube; files pass through; junk is null", () => {
  assert.equal(videoLink("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(videoLink("https://cdn.example.com/a.mp4"), "https://cdn.example.com/a.mp4");
  assert.equal(videoLink("not a link"), null);
  assert.equal(videoLink(""), null);
});
