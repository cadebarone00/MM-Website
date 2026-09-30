import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { accessRequestFailure, parseMyAccess, validateAccessRequest } from "@/lib/platform/accessRequests";

/**
 * Submit a beta creator-access request for the signed-in user. It only
 * records the request: it never grants creation (a platform admin approves
 * separately). A second submit while one is pending returns that one.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to request access." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const checked = validateAccessRequest(body);
  if (!checked.ok) return NextResponse.json({ ok: false, error: "Check these details.", errors: checked.errors }, { status: 400 });

  const { data, error } = await createSupabaseServiceRoleClient().rpc("submit_tournament_access_request", { p_profile: user.id, p_input: checked.data });
  if (error) {
    const failure = accessRequestFailure(error);
    if (failure.status === 500) console.error("submit_tournament_access_request failed:", error.message);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
  const result = data as { duplicate?: boolean; access?: unknown };
  return NextResponse.json({ ok: true, duplicate: result.duplicate === true, access: parseMyAccess(result.access) }, { status: result.duplicate ? 200 : 201 });
}
