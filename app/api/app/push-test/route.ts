import { NextResponse } from "next/server";
import { getCurrentProfileForRequest } from "@/lib/profile/currentProfile";
import { sendTestPush } from "@/lib/notifications/pushServer";

/** POST: Settings → "Send a test notification" — to my own phones only (project_specs.md "Expo app Step 6"). */
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const current = await getCurrentProfileForRequest(request);
  if (current.status !== "ok") return NextResponse.json({ ok: false, code: "signed_out", message: "Log in first." }, { status: 401, headers });
  const result = await sendTestPush(current.profile.profileId);
  if (result.status === "not_installed") return NextResponse.json({ ok: false, code: "not_installed", message: "Phone notifications aren't set up on the server yet." }, { status: 503, headers });
  if (result.status === "failed") return NextResponse.json({ ok: false, code: "failed", message: "Couldn't send. Try again." }, { status: 500, headers });
  if (!result.sent) return NextResponse.json({ ok: false, code: "no_devices", message: result.failed ? "Expo couldn't deliver it. Turn notifications off and on again." : "This phone isn't signed up for notifications yet." }, { status: 409, headers });
  return NextResponse.json({ ok: true, sent: result.sent }, { headers });
}
