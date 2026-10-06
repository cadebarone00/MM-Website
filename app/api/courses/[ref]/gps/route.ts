import { NextResponse } from "next/server";
import { getGpsProvisioner } from "@/lib/platform/golfGps/gpsProvisioningServer";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * "Prepare GPS" from Explore → Courses: POST /api/courses/<ref>/gps. Signed-in players only, because it can build and
 * store the course (OpenGolf → OpenStreetMap → green targets → Maroon course library). Everything runs on the server;
 * the reply is only { status, maroonCourseId? } — never provider data or errors.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ status: "sign_in" }, { status: 401, headers });
  const { ref } = await params;
  const result = await getGpsProvisioner().provision(ref);
  const status = result.status === "ready" || result.status === "unavailable" ? 200 : result.status === "not_found" ? 404 : result.status === "busy" ? 503 : 502;
  return NextResponse.json(result, { status, headers });
}
