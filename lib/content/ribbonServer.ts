import { createHash, randomBytes } from "node:crypto";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { canSee, postCounts, type ContentRole, type FeaturedTrip, type PostCounts, type RibbonBlock, type RibbonItem, type RibbonStatus, type RibbonTab, type Viewer } from "./ribbon";
import type { SaveChanges } from "./ribbonSave";

/** Server side of the ribbon: who's asking, and reading and writing the content tables (supabase/ribbon_content.sql). */

const COLUMNS = "id, kind, tab, format, title, summary, cover_image_url, cover_video_url, body, status, publish_at, review_note, created_by, updated_at";
type Row = { id: string; kind: "post" | "trip_plan"; tab: string; format: "story" | "quick" | null; title: string; summary: string; cover_image_url: string; cover_video_url: string | null; body: unknown; status: RibbonStatus; publish_at: string | null; review_note: string | null; created_by: string | null; updated_at: string };

function itemFromRow(row: Row): RibbonItem {
  const base = { id: row.id, status: row.status, publishAt: row.publish_at, reviewNote: row.review_note, createdBy: row.created_by ?? "", updatedAt: row.updated_at };
  if (row.kind === "trip_plan") return { ...base, kind: "trip_plan", tab: "Explore", trip: row.body as FeaturedTrip };
  return { ...base, kind: "post", format: row.format ?? "story", tab: row.tab as RibbonTab, title: row.title, summary: row.summary, coverImage: row.cover_image_url, coverVideo: row.cover_video_url, blocks: (row.body ?? []) as RibbonBlock[] };
}

/**
 * The caller's content role. The user always comes from the session, never from the request. Admin = platform_role, set
 * by hand; anyone else's role comes from their content_team row. A failed lookup counts as no role, so it fails closed.
 */
export async function contentViewer(request?: Request): Promise<Viewer> {
  const { data: { user } } = await (await createSupabaseServerClient(request)).auth.getUser();
  if (!user) return { role: null, profileId: null };
  const service = createSupabaseServiceRoleClient();
  const { data: profile } = await service.from("profiles").select("platform_role").eq("id", user.id).maybeSingle();
  if (profile?.platform_role === "admin") return { role: "admin", profileId: user.id };
  const { data: team } = await service.from("content_team").select("status").eq("profile_id", user.id).maybeSingle();
  const role: ContentRole = team?.status === "active" ? "poster" : team?.status === "invited" ? "invited" : null;
  return { role, profileId: user.id };
}

/** Everything this viewer may see, already filtered here so drafts never reach anyone else's browser. Throws on failure. */
export async function loadItems(viewer: Viewer, now = new Date()): Promise<RibbonItem[]> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = viewer.role === "admin" || viewer.role === "poster"
    ? await service.from("ribbon_content").select(COLUMNS)
    : await service.from("ribbon_content").select(COLUMNS).eq("status", "published").lte("publish_at", now.toISOString());
  if (error) throw new Error(error.message);
  return (data as Row[]).map(itemFromRow).filter((item) => canSee(item, viewer, now));
}

export async function loadItem(id: string): Promise<RibbonItem | null> {
  const { data, error } = await createSupabaseServiceRoleClient().from("ribbon_content").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? itemFromRow(data as Row) : null;
}

/** Saves an already-checked item (lib/content/ribbonSave.ts). New items get the session user as author. */
export async function writeItem(item: RibbonItem, changes: SaveChanges, userId: string, isNew: boolean): Promise<RibbonItem> {
  const post = item.kind === "post" ? item : null;
  const now = new Date().toISOString();
  const row = {
    id: item.id, kind: item.kind, tab: item.tab, format: post?.format ?? null, title: post?.title ?? "", summary: post?.summary ?? "", cover_image_url: post?.coverImage ?? "", cover_video_url: post?.coverVideo ?? null,
    body: post ? post.blocks : item.kind === "trip_plan" ? item.trip : [], status: changes.status, publish_at: changes.publishAt, review_note: changes.reviewNote,
    updated_by: userId, updated_at: now, ...(changes.approved ? { approved_by: userId, approved_at: now } : {}), ...(isNew ? { created_by: userId } : {}),
  };
  const service = createSupabaseServiceRoleClient();
  const { data, error } = isNew ? await service.from("ribbon_content").insert(row).select(COLUMNS).single()
    : await service.from("ribbon_content").update(row).eq("id", item.id).select(COLUMNS).single();
  if (error) throw new Error(error.message);
  return itemFromRow(data as Row);
}

export type TeamRow = { profileId: string; name: string; username: string; status: "invited" | "active" | "removed"; invitedBy: string; invitedAt: string; counts: PostCounts };

/** Settings → Content team: every Poster, invite and past Poster, with counts from ribbon_content. Links aren't people, so they aren't listed. */
export async function loadTeam(items: RibbonItem[]): Promise<TeamRow[]> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("content_team").select("profile_id, status, invited_by, invited_at").not("profile_id", "is", null).order("invited_at", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = [...new Set(data.flatMap((row) => [row.profile_id as string, row.invited_by as string | null]).filter((id): id is string => Boolean(id)))];
  const { data: people, error: peopleError } = ids.length ? await service.from("profiles").select("id, display_name, username").in("id", ids) : { data: [], error: null };
  if (peopleError) throw new Error(peopleError.message);
  const person = new Map((people ?? []).map((p) => [p.id as string, p as { display_name: string; username: string }]));
  return data.map((row) => ({
    profileId: row.profile_id as string, name: person.get(row.profile_id)?.display_name ?? "Former member", username: person.get(row.profile_id)?.username ?? "",
    status: row.status as TeamRow["status"], invitedBy: person.get(row.invited_by)?.display_name ?? "An Admin", invitedAt: row.invited_at as string, counts: postCounts(items, row.profile_id as string),
  }));
}

/** First name of whoever invited this person, for their invite card. */
export async function inviterName(profileId: string): Promise<string | null> {
  const service = createSupabaseServiceRoleClient();
  const { data } = await service.from("content_team").select("invited_by").eq("profile_id", profileId).maybeSingle();
  if (!data?.invited_by) return null;
  const { data: inviter } = await service.from("profiles").select("display_name").eq("id", data.invited_by).maybeSingle();
  return (inviter?.display_name as string | undefined)?.split(/\s+/)[0] ?? null;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newInviteToken = () => randomBytes(24).toString("base64url");
export const LINK_DAYS = 7;
