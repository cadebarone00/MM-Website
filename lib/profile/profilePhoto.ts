import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ProfileId } from "./profileIdentity";

/**
 * Profile photos (supabase/profile_photos.sql): one per profile in the public "profile-photos" bucket, pointed at by
 * profiles.avatar_path. The profile id always comes from the signed-in session. Never import this from a client component.
 */

export const PHOTO_BUCKET = "profile-photos";
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The photo's public address, or null. */
export function profilePhotoUrl(path: string | null | undefined): string | null {
  const base = process.env.SUPABASE_URL;
  return path && base ? `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}` : null;
}

export type PhotoResult = { ok: true; url: string | null } | { ok: false; code: "not_installed" | "bad_file" | "failed"; message: string };

/** My current photo's path, or null (also null until profile_photos.sql is run). */
export async function myPhotoPath(profileId: ProfileId): Promise<{ path: string | null; installed: boolean }> {
  const { data, error } = await createSupabaseServiceRoleClient().from("profiles").select("avatar_path").eq("id", profileId).maybeSingle();
  if (error) return { path: null, installed: false };
  return { path: (data as { avatar_path?: string | null } | null)?.avatar_path ?? null, installed: true };
}

/** Saves a new photo (JPEG / PNG / WebP, up to 3 MB) and removes the old one. */
export async function setMyPhoto(profileId: ProfileId, file: File): Promise<PhotoResult> {
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, code: "bad_file", message: "Use a JPG, PNG or WebP photo." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, code: "bad_file", message: "That photo is too big. Use one under 3 MB." };
  const current = await myPhotoPath(profileId);
  if (!current.installed) return { ok: false, code: "not_installed", message: "Profile photos aren't set up yet (supabase/profile_photos.sql)." };
  const db = createSupabaseServiceRoleClient();
  const path = `${profileId}/${Date.now()}.${ext}`;
  const upload = await db.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (upload.error) {
    console.error("Profile photo upload failed:", upload.error.message);
    return /bucket/i.test(upload.error.message)
      ? { ok: false, code: "not_installed", message: "Profile photos aren't set up yet (supabase/profile_photos.sql)." }
      : { ok: false, code: "failed", message: "Couldn't upload that photo. Try again." };
  }
  const saved = await db.from("profiles").update({ avatar_path: path }).eq("id", profileId);
  if (saved.error) {
    await db.storage.from(PHOTO_BUCKET).remove([path]);
    console.error("Profile photo save failed:", saved.error.message);
    return { ok: false, code: "failed", message: "Couldn't save that photo. Try again." };
  }
  if (current.path) await db.storage.from(PHOTO_BUCKET).remove([current.path]);
  return { ok: true, url: profilePhotoUrl(path) };
}

/** Removes my photo (back to initials). */
export async function removeMyPhoto(profileId: ProfileId): Promise<PhotoResult> {
  const current = await myPhotoPath(profileId);
  if (!current.installed) return { ok: false, code: "not_installed", message: "Profile photos aren't set up yet (supabase/profile_photos.sql)." };
  const db = createSupabaseServiceRoleClient();
  const saved = await db.from("profiles").update({ avatar_path: null }).eq("id", profileId);
  if (saved.error) return { ok: false, code: "failed", message: "Couldn't remove the photo. Try again." };
  if (current.path) await db.storage.from(PHOTO_BUCKET).remove([current.path]);
  return { ok: true, url: null };
}
