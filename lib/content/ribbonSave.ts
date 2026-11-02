/**
 * What a save is allowed to do (spec "Play page ribbon content"). Pure and unit-tested, used by the API routes: the role
 * always comes from the server, and it decides the outcome whatever the screen asked for. A Poster can never publish.
 */
import { canEdit, canPost, canPublish, RIBBON_TABS, videoSource, type RibbonBlock, type RibbonItem, type RibbonPost, type RibbonStatus, type RibbonTab, type TripTier, type Viewer } from "./ribbon";

export type SaveMode = "publish" | "schedule" | "draft" | "submit" | "unpublish";
export const SAVE_MODES: readonly SaveMode[] = ["publish", "schedule", "draft", "submit", "unpublish"];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
const list = (value: unknown, max: number, each: number) => Array.isArray(value) ? value.slice(0, max).map((v) => text(v, each)) : [];

/** Only pictures and videos from this post's own upload folder, or the site's own files. Never another website's file. */
export function allowedMedia(url: string, itemId: string, publicBase: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("..")) return true;
  return Boolean(publicBase) && url.startsWith(`${publicBase}/ribbon/${itemId}/`) && !url.includes("..");
}

/** Link buttons go to a page on this site or a normal web address. Blocks `javascript:` links, which could run code. */
export function allowedLink(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try { const { protocol } = new URL(url); return protocol === "https:" || protocol === "http:"; } catch { return false; }
}

function cleanBlock(raw: unknown): RibbonBlock | null {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const caption = text(b.caption, 300);
  switch (b.type) {
    case "text": case "heading": case "quote": return { type: b.type, text: text(b.text, 10000) };
    case "photo": return { type: "photo", src: text(b.src, 1000), caption };
    case "video": return { type: "video", url: text(b.url, 1000), caption };
    case "link": return { type: "link", label: text(b.label, 80), url: text(b.url, 1000) };
    default: return null;
  }
}

function cleanTier(raw: unknown): TripTier {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    id: text(t.id, 60), label: text(t.label, 60), price: text(t.price, 30), stay: text(t.stay, 200),
    courses: list(t.courses, 12, 120), includes: list(t.includes, 20, 200),
    days: (Array.isArray(t.days) ? t.days : []).slice(0, 14).map((d) => ({ day: text((d as { day?: unknown })?.day, 4), plan: text((d as { plan?: unknown })?.plan, 200) })),
  };
}

/** Builds a clean item from what the app sent, keeping only known fields. Status, dates and author are set in planSave. */
export function itemFromBody(body: unknown): RibbonItem | null {
  const r = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof r.id !== "string" || !UUID.test(r.id)) return null;
  const base = { id: r.id.toLowerCase(), status: "draft" as RibbonStatus, publishAt: null, createdBy: "", updatedAt: "" };
  if (r.kind === "trip_plan") {
    const t = (r.trip && typeof r.trip === "object" ? r.trip : {}) as Record<string, unknown>;
    const players = Math.min(48, Math.max(1, Math.round(Number(t.players)) || 1));
    return { ...base, kind: "trip_plan", tab: "Explore", trip: { city: text(t.city, 80), region: text(t.region, 80), length: text(t.length, 60), players, image: text(t.image, 1000), tiers: (Array.isArray(t.tiers) ? t.tiers : []).slice(0, 3).map(cleanTier) } };
  }
  if (r.kind !== "post" || (r.format !== "story" && r.format !== "quick") || !RIBBON_TABS.includes(r.tab as RibbonTab)) return null;
  const blocks = r.format === "story" && Array.isArray(r.blocks) ? r.blocks.slice(0, 100).map(cleanBlock).filter((b): b is RibbonBlock => b !== null) : [];
  return { ...base, kind: "post", format: r.format, tab: r.tab as RibbonTab, title: text(r.title, r.format === "quick" ? 200 : 90), summary: r.format === "quick" ? "" : text(r.summary, 240),
    coverImage: text(r.coverImage, 1000), coverVideo: r.format === "quick" && typeof r.coverVideo === "string" ? text(r.coverVideo, 1000) : null, blocks };
}

/** The plain message for anything missing, the same words on the screen and on the server. Null = ready to save. */
export function itemProblem(item: RibbonItem): string | null {
  if (item.kind === "post") {
    if (!item.title.trim()) return item.format === "quick" ? "Add a short message to go with it." : "Add a headline so players know what the story is.";
    if (item.format === "quick" && !item.coverImage && !item.coverVideo) return "Add a photo or a video.";
    if (item.format === "story" && !item.coverImage) return "Add a cover photo. Every card needs one.";
    return null;
  }
  if (!item.trip.city.trim()) return "Add the city so players know where the trip is.";
  if (!item.trip.tiers.length) return "Add at least one price level.";
  if (!item.trip.image) return "Add a cover photo. Every card needs one.";
  return null;
}

/** Null when every photo, video and link in the item is allowed. */
export function mediaProblem(item: RibbonItem, publicBase: string): string | null {
  const bad = "A photo or video didn't upload properly. Remove it and add it again.";
  const ok = (url: string) => allowedMedia(url, item.id, publicBase);
  if (item.kind === "trip_plan") return ok(item.trip.image) ? null : bad;
  if (item.coverImage && !ok(item.coverImage)) return bad;
  if (item.coverVideo && !playable(item.coverVideo, ok)) return bad;
  return blockProblem(item, ok, bad);
}

const playable = (url: string, ok: (url: string) => boolean) => { const video = videoSource(url); return video?.kind === "youtube" || (video?.kind === "file" && ok(url)); };

function blockProblem(post: RibbonPost, ok: (url: string) => boolean, bad: string): string | null {
  for (const block of post.blocks) {
    if (block.type === "photo" && block.src && !ok(block.src)) return bad;
    if (block.type === "video" && block.url && !playable(block.url, ok)) return "Use an uploaded video or a YouTube link.";
    if (block.type === "link" && block.url && !allowedLink(block.url)) return "A link button needs a full web address, like https://…";
  }
  return null;
}

export type SaveChanges = { status: RibbonStatus; publishAt: string | null; reviewNote: string | null; approved: boolean };
export type SavePlan = { ok: true; changes: SaveChanges } | { ok: false; status: 400 | 403; error: string };

/** The status and date a save ends up with. `existing` is the saved item, or null for a new one. */
export function planSave(existing: RibbonItem | null, mode: SaveMode, publishAt: string | null, viewer: Viewer, now: Date): SavePlan {
  if (!canPost(viewer)) return { ok: false, status: 403, error: "Only the content team can post." };
  if (existing && !canEdit(existing, viewer)) return { ok: false, status: 403, error: "You can't edit this post." };
  const reviewNote = existing?.reviewNote ?? null;
  if (!canPublish(viewer)) {
    if (mode === "submit") return { ok: true, changes: { status: "pending", publishAt: null, reviewNote: null, approved: false } };
    if (mode === "draft") return { ok: true, changes: { status: existing?.status === "changes_requested" ? "changes_requested" : "draft", publishAt: null, reviewNote, approved: false } };
    return { ok: false, status: 403, error: "An Admin has to approve this before it goes live." };
  }
  if (mode === "publish") return { ok: true, changes: { status: "published", publishAt: now.toISOString(), reviewNote: null, approved: true } };
  if (mode === "schedule") {
    const when = publishAt ? new Date(publishAt) : null;
    if (!when || Number.isNaN(when.getTime()) || when <= now) return { ok: false, status: 400, error: "Pick a time in the future, or press Publish now." };
    return { ok: true, changes: { status: "published", publishAt: when.toISOString(), reviewNote: null, approved: true } };
  }
  if (mode === "draft" || mode === "unpublish") return { ok: true, changes: { status: "draft", publishAt: null, reviewNote, approved: false } };
  return { ok: false, status: 400, error: "Press Publish now, Schedule or Save draft." };
}

/** Upload limits, checked before a file is sent. */
export const UPLOAD_TYPES: Record<string, { extension: string; maxBytes: number }> = {
  "image/jpeg": { extension: ".jpg", maxBytes: 15_000_000 },
  "image/png": { extension: ".png", maxBytes: 15_000_000 },
  "image/webp": { extension: ".webp", maxBytes: 15_000_000 },
  "image/heic": { extension: ".heic", maxBytes: 15_000_000 },
  "video/mp4": { extension: ".mp4", maxBytes: 500_000_000 },
  "video/quicktime": { extension: ".mov", maxBytes: 500_000_000 },
  "video/webm": { extension: ".webm", maxBytes: 500_000_000 },
};

/** Null when this file may be uploaded, otherwise the plain message. */
export function uploadProblem(contentType: unknown, size: unknown): string | null {
  const type = typeof contentType === "string" ? UPLOAD_TYPES[contentType.toLowerCase()] : undefined;
  if (!type) return "Use a JPG, PNG, WebP or HEIC photo, or an MP4, MOV or WebM video.";
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return "That file looks empty.";
  if (size > type.maxBytes) return type.maxBytes > 100_000_000 ? "Videos can be up to 500 MB." : "Photos can be up to 15 MB.";
  return null;
}
