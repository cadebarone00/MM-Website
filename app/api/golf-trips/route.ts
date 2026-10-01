import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { golfTripCreateFailure, golfTripPayloadFromBody, golfTripUrl } from "@/lib/platform/golfTripCreate";

/**
 * Create Golf Trip: saves the questionnaire as a trip owned by the signed-in person, in one
 * all-or-nothing create_golf_trip call. The same requestId always returns the same trip, so a
 * double tap or a retry never makes two.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Log in to create your trip. Your answers will still be here." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = golfTripPayloadFromBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.errors[0]?.message ?? "Check your answers.", errors: parsed.errors }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.rpc("create_golf_trip", { p_profile: user.id, p_input: parsed.payload });
  const tripId = (data as { tripId?: unknown } | null)?.tripId;
  if (error || typeof tripId !== "string") {
    const failure = golfTripCreateFailure(error ?? {});
    if (failure.status >= 500) console.error("create_golf_trip failed:", error?.message ?? "no trip id returned");
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }

  return NextResponse.json({ ok: true, tripId, url: golfTripUrl(tripId) }, { status: 201 });
}
