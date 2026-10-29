import { privateJson, selfServiceCaller } from "@/lib/account/selfServiceRequest";
import { removeMyPhoto, setMyPhoto, type PhotoResult } from "@/lib/profile/profilePhoto";

/** Settings → Profile photo. POST (form field "photo") replaces my photo; DELETE removes it. Signed-in profiles only.
 *  Website cookie or app Bearer token (Phase 7B, lib/account/selfServiceRequest.ts); the photo is always stored under
 *  the caller's own profile (the server picks the path; storage is written by the server only). Private, never cached. */
const reply = (result: PhotoResult) => result.ok ? privateJson({ ok: true, url: result.url })
  : privateJson({ ok: false, code: result.code, error: result.message }, result.code === "bad_file" ? 400 : result.code === "not_installed" ? 503 : 500);

export async function POST(request: Request) {
  const caller = await selfServiceCaller(request);
  if ("error" in caller) return caller.error;
  const { current } = caller;
  if (current.status !== "ok") return privateJson({ ok: false, error: "Log in to change your photo." }, 401);
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || file.size === 0) return privateJson({ ok: false, code: "bad_file", error: "Pick a photo first." }, 400);
  return reply(await setMyPhoto(current.profile.profileId, file));
}

export async function DELETE(request: Request) {
  const caller = await selfServiceCaller(request);
  if ("error" in caller) return caller.error;
  const { current } = caller;
  if (current.status !== "ok") return privateJson({ ok: false, error: "Log in to change your photo." }, 401);
  return reply(await removeMyPhoto(current.profile.profileId));
}
