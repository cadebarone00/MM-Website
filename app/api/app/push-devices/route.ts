import { NextResponse } from "next/server";
import { getCurrentProfileForRequest } from "@/lib/profile/currentProfile";
import { isExpoPushToken, isPushPlatform } from "@/lib/notifications/expoPush";
import { removePushDevice, savePushDevice } from "@/lib/notifications/pushServer";

/**
 * The phone app turns notifications on / off for this phone (project_specs.md "Expo app Step 6").
 * POST { token, platform: "ios" | "android" }: remember this phone for me. DELETE { token }: forget it (sign out / off).
 * Bearer login only matters here: the account comes from the session, never the body.
 */
const headers = { "Cache-Control": "no-store" };
const reply = (status: number, body: object) => NextResponse.json(body, { status, headers });

async function me(request: Request) {
  const current = await getCurrentProfileForRequest(request);
  return current.status === "ok" ? current.profile.profileId : null;
}
const answer = (result: "ok" | "not_installed" | "failed") => result === "ok" ? reply(200, { ok: true })
  : result === "not_installed" ? reply(503, { ok: false, code: "not_installed", message: "Phone notifications aren't set up on the server yet." })
  : reply(500, { ok: false, code: "failed", message: "That didn't save. Try again." });

export async function POST(request: Request) {
  const profileId = await me(request);
  if (!profileId) return reply(401, { ok: false, code: "signed_out", message: "Log in first." });
  const body = await request.json().catch(() => null) as { token?: unknown; platform?: unknown } | null;
  if (!isExpoPushToken(body?.token) || !isPushPlatform(body?.platform)) return reply(400, { ok: false, code: "invalid", message: "That isn't a phone notification address." });
  return answer(await savePushDevice(profileId, body.token, body.platform));
}

export async function DELETE(request: Request) {
  const profileId = await me(request);
  if (!profileId) return reply(401, { ok: false, code: "signed_out", message: "Log in first." });
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  if (!isExpoPushToken(body?.token)) return reply(400, { ok: false, code: "invalid", message: "That isn't a phone notification address." });
  return answer(await removePushDevice(profileId, body.token));
}
