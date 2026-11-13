import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { golfTripUrl } from "@/lib/platform/golfTripCreate";
import { importInput, importSummary } from "@/lib/platform/pastTripImport";
import { readImportRequest } from "@/lib/platform/pastTripImportRequest";

export const runtime = "nodejs";

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

/**
 * Golf Trips → Import past trip, from the spreadsheet (a form with the file) or the in-app walkthrough (JSON with the
 * draft) — see readImportRequest. "preview" checks it and answers the summary or every problem, saving nothing.
 * "create" saves it in one import_golf_trip call; the same requestId always returns the same trip.
 */
export async function POST(request: Request) {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return fail(401, "Log in to import a trip.");
  if (current.status !== "ok") return fail(409, "Finish setting up your profile first.");
  const read = await readImportRequest(request);
  if (!read.ok) return NextResponse.json(read.body, { status: read.status });
  if (read.action === "preview") return NextResponse.json({ ok: true, summary: importSummary(read.trip) });

  const input = importInput(read.trip, read.me || null, current.profile.displayName, read.requestId, randomUUID);
  const { data, error } = await createSupabaseServiceRoleClient().rpc("import_golf_trip", { p_profile: current.profile.profileId, p_input: input });
  const tripId = (data as { tripId?: unknown } | null)?.tripId;
  if (error || typeof tripId !== "string") {
    if (error?.code === "22023") return fail(400, error.message);
    console.error("import_golf_trip failed:", error?.message ?? "no trip id returned");
    return fail(500, "We couldn't save the trip. Try again.");
  }
  return NextResponse.json({ ok: true, tripId, url: golfTripUrl(tripId) }, { status: 201 });
}
