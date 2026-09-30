import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { accessRequestFailure, parseRequestsForReview } from "@/lib/platform/accessRequests";

/**
 * Platform admins only: approve or deny one pending request. The database
 * function checks the admin role itself; everyone else gets a plain 404.
 * Approval is what activates creator access (tournament_creator_access).
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const reference = Number(body.reference);
  const decision = body.decision;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!Number.isInteger(reference) || reference < 1) return NextResponse.json({ ok: false, error: "Request not found." }, { status: 404 });
  if (decision !== "approved" && decision !== "denied") return NextResponse.json({ ok: false, error: "Choose approve or deny." }, { status: 400 });
  if (note.length > 500) return NextResponse.json({ ok: false, error: "Keep the decision note under 500 characters." }, { status: 400 });

  const { data, error } = await createSupabaseServiceRoleClient().rpc("review_tournament_access_request", {
    p_admin: user.id, p_reference: reference, p_decision: decision, p_note: note,
  });
  if (error) {
    const failure = accessRequestFailure(error);
    if (failure.status === 500) console.error("review_tournament_access_request failed:", error.message);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
  return NextResponse.json({ ok: true, requests: parseRequestsForReview(data) });
}
