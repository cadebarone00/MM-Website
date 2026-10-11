import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { golfTripCreateFailure, golfTripPayloadFromBody, golfTripUrl } from "@/lib/platform/golfTripCreate";

/**
 * Create Golf Trip: saves the questionnaire as a trip owned by the signed-in golfer's profile, in one
 * all-or-nothing create_golf_trip call. The same requestId always returns the same trip, so a
 * double tap or a retry never makes two.
 */
export async function POST(request: Request) {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return NextResponse.json({ ok: false, error: "Log in to create your trip. Your answers will still be here." }, { status: 401 });
  if (current.status === "no-profile") return NextResponse.json({ ok: false, error: "Finish setting up your profile first." }, { status: 409 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  // Everyone in the app is signed in, so the organizer's name and email come from their profile, never the form.
  const organizer = { yourName: current.profile.displayName, yourEmail: current.profile.email || current.account.email || "" };
  const parsed = golfTripPayloadFromBody(body && typeof body === "object" && !Array.isArray(body) ? { ...body, ...organizer } : body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.errors[0]?.message ?? "Check your answers.", errors: parsed.errors }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.rpc("create_golf_trip", { p_profile: current.profile.profileId, p_input: parsed.payload });
  const tripId = (data as { tripId?: unknown } | null)?.tripId;
  if (error || typeof tripId !== "string") {
    const failure = golfTripCreateFailure(error ?? {});
    if (failure.status >= 500) console.error("create_golf_trip failed:", error?.message ?? "no trip id returned");
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }

  return NextResponse.json({ ok: true, tripId, url: golfTripUrl(tripId) }, { status: 201 });
}
