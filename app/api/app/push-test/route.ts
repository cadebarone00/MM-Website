import { NextResponse } from "next/server";
import { getCurrentProfileForRequest } from "@/lib/profile/currentProfile";
import { sendTestPush } from "@/lib/notifications/pushServer";
import { activeHighlights } from "@/lib/notifications/highlightPushes";
import { testMenu, testWords } from "@/lib/notifications/testMenu";

/**
 * Test notifications, to MY OWN phones only (project_specs.md "Expo app Step 6").
 *   GET              Building blocks → Notifications: every type the app sends (lib/notifications/testMenu.ts).
 *   POST {}          Settings → "Send a test notification".
 *   POST { id }      Building blocks: a test of that type, one of its wordings at random, sample names filled in.
 */
const headers = { "Cache-Control": "no-store" };
const fail = (status: number, code: string, message: string) => NextResponse.json({ ok: false, code, message }, { status, headers });

export async function GET(request: Request) {
  const current = await getCurrentProfileForRequest(request);
  if (current.status !== "ok") return fail(401, "signed_out", "Log in first.");
  return NextResponse.json({ ok: true, groups: testMenu((await activeHighlights())?.config ?? null) }, { headers });
}

export async function POST(request: Request) {
  const current = await getCurrentProfileForRequest(request);
  if (current.status !== "ok") return fail(401, "signed_out", "Log in first.");
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  let words: { title: string; body: string } | undefined;
  if (typeof body?.id === "string") {
    const picked = testWords(body.id, (await activeHighlights())?.config ?? null);
    if (!picked) return fail(404, "unknown", "That notification type wasn't found.");
    words = picked;
  }
  const result = await sendTestPush(current.profile.profileId, words);
  if (result.status === "not_installed") return fail(503, "not_installed", "Phone notifications aren't set up on the server yet.");
  if (result.status === "failed") return fail(500, "failed", "Couldn't send. Try again.");
  if (!result.sent) return fail(409, "no_devices", result.failed ? "Expo couldn't deliver it. Turn notifications off and on again." : "This phone isn't signed up for notifications yet.");
  return NextResponse.json({ ok: true, sent: result.sent, ...(words ? { words } : {}) }, { headers });
}
