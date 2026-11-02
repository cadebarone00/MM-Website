/**
 * Play page ribbon content (spec "Play page ribbon content", approved 2026-10-30): posts on the Explore, Courses,
 * Equipment, Teaching and News tabs, plus the weekly featured trip on Explore. Pure rules only, shared by the screens and
 * the server routes: who sees what, who can do what, and the Content team post counts. Authors are stored for the
 * record but never shown.
 */

export const RIBBON_TABS = ["Explore", "Courses", "Equipment", "Teaching", "News"] as const;
export type RibbonTab = (typeof RIBBON_TABS)[number];

/** draft → (Poster) pending → published, or sent back as changes_requested with a note. */
export type RibbonStatus = "draft" | "pending" | "changes_requested" | "published";

/** Admin = Cade and Cam (set by hand). Poster = invited by an Admin. Invited = asked but hasn't accepted yet. */
export type ContentRole = "admin" | "poster" | "invited" | null;

/** One piece of a Story's body, in the order the author added them. Video = an uploaded file or a YouTube link. */
export type RibbonBlock =
  | { type: "text"; text: string }
  | { type: "heading"; text: string }
  | { type: "quote"; text: string }
  | { type: "photo"; src: string; caption?: string }
  | { type: "video"; url: string; caption?: string }
  | { type: "link"; label: string; url: string };

/** Story = an article (headline, cover photo, body). Quick = one photo or video with a short message. */
export type RibbonFormat = "story" | "quick";

export type TripTier = { id: string; label: string; price: string; stay: string; courses: string[]; days: { day: string; plan: string }[]; includes: string[] };
/** The Explore featured trip, same shape as the built-in Palm Springs plan in TripPromos. */
export type FeaturedTrip = { city: string; region: string; length: string; players: number; image: string; tiers: TripTier[] };

type Base = { id: string; status: RibbonStatus; publishAt: string | null; createdBy: string; reviewNote?: string | null; updatedAt: string };
/** Quick posts keep their message in `title` and may use `coverVideo` instead of a photo. */
export type RibbonPost = Base & { kind: "post"; format: RibbonFormat; tab: RibbonTab; title: string; summary: string; coverImage: string; coverVideo?: string | null; blocks: RibbonBlock[] };
export type RibbonTripPlan = Base & { kind: "trip_plan"; tab: "Explore"; trip: FeaturedTrip };
export type RibbonItem = RibbonPost | RibbonTripPlan;

export type Viewer = { role: ContentRole; profileId: string | null };

/** Live for everyone: published and its publish time has come. */
export function isLive(item: RibbonItem, now: Date): boolean {
  return item.status === "published" && (!item.publishAt || new Date(item.publishAt) <= now);
}

/** Published with a future date. */
export function isScheduled(item: RibbonItem, now: Date): boolean {
  return item.status === "published" && Boolean(item.publishAt) && new Date(item.publishAt!) > now;
}

/** Admins see everything; Posters see live items plus their own unpublished ones; everyone else sees live items only. */
export function canSee(item: RibbonItem, viewer: Viewer, now: Date): boolean {
  if (isLive(item, now)) return true;
  if (viewer.role === "admin") return true;
  return viewer.role === "poster" && item.createdBy === viewer.profileId;
}

/** Admins edit anything. Posters edit only their own items that aren't live or scheduled (a live post changes via a new draft). */
export function canEdit(item: RibbonItem, viewer: Viewer): boolean {
  if (viewer.role === "admin") return true;
  return viewer.role === "poster" && item.createdBy === viewer.profileId && item.status !== "published";
}

export const canPublish = (viewer: Viewer) => viewer.role === "admin";
export const canPost = (viewer: Viewer) => viewer.role === "admin" || viewer.role === "poster";

/** A tab's posts for this viewer, newest first. Trip plans never show here (they fill the featured trip spot). */
export function tabPosts(items: RibbonItem[], tab: RibbonTab, viewer: Viewer, now: Date): RibbonPost[] {
  return items
    .filter((item): item is RibbonPost => item.kind === "post" && item.tab === tab && canSee(item, viewer, now))
    .sort((a, b) => feedTime(b, now) - feedTime(a, now));
}

/** The featured trip everyone sees: the newest live trip plan, otherwise the built-in plan, so Explore is never empty. */
export function featuredTrip(items: RibbonItem[], now: Date, fallback: FeaturedTrip): { trip: FeaturedTrip; item: RibbonTripPlan | null } {
  const live = items.filter((item): item is RibbonTripPlan => item.kind === "trip_plan" && isLive(item, now))
    .sort((a, b) => feedTime(b, now) - feedTime(a, now))[0];
  return live ? { trip: live.trip, item: live } : { trip: fallback, item: null };
}

/** Admins' "Waiting for approval" list, oldest first so nothing waits too long. */
export function waitingForApproval(items: RibbonItem[]): RibbonItem[] {
  return items.filter((item) => item.status === "pending").sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

/** A Poster's "My drafts": everything of theirs that isn't published yet. */
export function myDrafts(items: RibbonItem[], profileId: string): RibbonItem[] {
  return items.filter((item) => item.createdBy === profileId && item.status !== "published").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type PostCounts = { published: number; waiting: number; sentBack: number; lastPublishedAt: string | null };

/** Content team row counts. A published post counts for the person who wrote it, even though an Admin approved it. */
export function postCounts(items: RibbonItem[], profileId: string): PostCounts {
  const mine = items.filter((item) => item.createdBy === profileId);
  const published = mine.filter((item) => item.status === "published");
  const last = published.map(sortTime).sort().at(-1) ?? null;
  return {
    published: published.length,
    waiting: mine.filter((item) => item.status === "pending").length,
    sentBack: mine.filter((item) => item.status === "changes_requested").length,
    lastPublishedAt: last,
  };
}

/** Plain status words shown on a card to Admins and to the author. */
export function statusLabel(item: RibbonItem, now: Date): string {
  if (isLive(item, now)) return "Live";
  if (isScheduled(item, now)) return `Scheduled · ${formatWhen(item.publishAt!)}`;
  if (item.status === "pending") return "Waiting for approval";
  if (item.status === "changes_requested") return "Sent back";
  return "Draft";
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "3 min read" for a Story: about 200 words a minute, at least 1. */
export function readMinutes(post: RibbonPost): number {
  const words = [post.title, post.summary, ...post.blocks.map((b) => "text" in b ? b.text : "caption" in b ? b.caption ?? "" : "")]
    .join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** How to play a video: a YouTube link becomes a privacy-friendly embed; anything else plays as a video file. */
export function videoSource(url: string): { kind: "youtube"; src: string } | { kind: "file"; src: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const id = trimmed.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)?.[1];
  if (id) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0` };
  return /^(https?:|blob:|\/)/.test(trimmed) ? { kind: "file", src: trimmed } : null;
}

const sortTime = (item: RibbonItem) => item.publishAt ?? item.updatedAt;

/** Where an item sits in a feed, as a real time. A scheduled item counts from its last save, so its future date can't put it above newer live posts. */
const feedTime = (item: RibbonItem, now: Date) => new Date(isScheduled(item, now) ? item.updatedAt : sortTime(item)).getTime();
