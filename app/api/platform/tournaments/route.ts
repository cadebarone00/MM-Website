import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createFailure, createPayloadFromBody, tournamentManageUrl } from "@/lib/platform/tournamentCreate";

/**
 * CREATE → EXIST: turns the wizard's input into a saved Tournament + first
 * Edition, owned by the signed-in organizer. Who may create is enforced
 * inside create_tournament_shell (invite-only beta), not just here.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to save your tournament." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = createPayloadFromBody(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: "Check these details.", errors: parsed.errors }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.rpc("create_tournament_shell", { p_profile: user.id, p_input: parsed.payload });
  if (error) {
    const failure = createFailure(error);
    if (failure.status === 500) console.error("create_tournament_shell failed:", error.message);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }

  const { tournamentSlug, seasonYear } = data as { tournamentSlug: string; seasonYear: number };
  return NextResponse.json({ ok: true, url: tournamentManageUrl(tournamentSlug, seasonYear) }, { status: 201 });
}
