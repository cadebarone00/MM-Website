import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  // Cross-user read (everyone's balance + display name) — the one
  // deliberate, narrow use of the service-role client outside admin
  // tooling, per this plan's Global Constraints.
  const service = createSupabaseServiceRoleClient();
  const { data: accounts } = await service
    .from("wagers_accounts")
    .select("profile_id, mm_coins_balance, profiles(display_name)")
    .order("mm_coins_balance", { ascending: false });

  // Verify this embedded-relationship shape against the real project —
  // PostgREST returns the joined row as `profiles: { display_name }`
  // (singular object) when profile_id -> profiles is a many-to-one FK;
  // adjust the mapping below if the actual response nests it differently.
  return NextResponse.json({
    ok: true,
    standings: (accounts ?? []).map((a) => ({
      profileId: a.profile_id,
      displayName: (a.profiles as unknown as { display_name: string } | null)?.display_name ?? "Unknown",
      balance: a.mm_coins_balance,
    })),
  });
}
