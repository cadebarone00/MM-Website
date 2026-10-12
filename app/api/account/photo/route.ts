import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { removeMyPhoto, setMyPhoto, type PhotoResult } from "@/lib/profile/profilePhoto";

/** Settings → Profile photo. POST (form field "photo") replaces my photo; DELETE removes it. Signed-in profiles only. */
const reply = (result: PhotoResult) => result.ok ? NextResponse.json({ ok: true, url: result.url })
  : NextResponse.json({ ok: false, code: result.code, error: result.message }, { status: result.code === "bad_file" ? 400 : result.code === "not_installed" ? 503 : 500 });

export async function POST(request: Request) {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return NextResponse.json({ ok: false, error: "Log in to change your photo." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, code: "bad_file", error: "Pick a photo first." }, { status: 400 });
  return reply(await setMyPhoto(current.profile.profileId, file));
}

export async function DELETE() {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return NextResponse.json({ ok: false, error: "Log in to change your photo." }, { status: 401 });
  return reply(await removeMyPhoto(current.profile.profileId));
}
