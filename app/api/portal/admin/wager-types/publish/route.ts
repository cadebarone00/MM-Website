import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { PUBLIC_WAGER_CATALOG, type PublicWagerSlug } from "@/lib/wagers/publicWagerCatalog";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const { slug } = await request.json();
  const market = PUBLIC_WAGER_CATALOG[slug as PublicWagerSlug];
  if (!market) return NextResponse.json({ ok: false, error: "Unknown public wager." }, { status: 400 });
  if (market.modelStatus !== "ready") {
    return NextResponse.json({ ok: false, error: "This wager type is still in design. Its calculation, readiness checks, and settlement rule must be implemented before it can be submitted publicly." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("wager_types")
    .upsert({
      slug: market.slug,
      name: market.name,
      scope: market.scope,
      market_kind: market.marketKind,
      stat_key: market.statKey,
      calculation_rule: market.calculationRule,
      settlement_rule: market.settlementRule,
      is_active: true,
      created_by: host.userId,
    }, { onConflict: "slug" })
    .select()
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Could not publish this wager." }, { status: 500 });

  return NextResponse.json({ ok: true, wagerType: {
    id: data.id, slug: data.slug, name: data.name, scope: data.scope, marketKind: data.market_kind,
    statKey: data.stat_key, calculationRule: data.calculation_rule, settlementRule: data.settlement_rule,
    isActive: data.is_active, createdAt: data.created_at,
  } });
}
