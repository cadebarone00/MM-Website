import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { WAGER_MARKET_KINDS, WAGER_SCOPES, type WagerMarketKind, type WagerScope } from "@/lib/wagers/wagerTypes";

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const body = await request.json();
  const { name, slug, scope, marketKind, statKey, calculationRule, settlementRule, isActive } = body;
  if ([name, slug, statKey, calculationRule, settlementRule].some((value) => typeof value !== "string" || !value.trim())) {
    return NextResponse.json({ ok: false, error: "Complete every wager definition field." }, { status: 400 });
  }
  if (!isValidSlug(slug)) return NextResponse.json({ ok: false, error: "Use lowercase letters, numbers, and hyphens for the market key." }, { status: 400 });
  if (!WAGER_SCOPES.includes(scope as WagerScope) || !WAGER_MARKET_KINDS.includes(marketKind as WagerMarketKind) || typeof isActive !== "boolean") {
    return NextResponse.json({ ok: false, error: "Invalid wager type settings." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("wager_types")
    .insert({
      name: name.trim(), slug: slug.trim(), scope, market_kind: marketKind, stat_key: statKey.trim(),
      calculation_rule: calculationRule.trim(), settlement_rule: settlementRule.trim(), is_active: isActive, created_by: host.userId,
    })
    .select()
    .single();
  if (error || !data) {
    const message = error?.code === "23505" ? "That market key already exists." : "Could not create this wager type. Make sure the Wager Types database setup has been run.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, wagerType: {
    id: data.id, slug: data.slug, name: data.name, scope: data.scope, marketKind: data.market_kind,
    statKey: data.stat_key, calculationRule: data.calculation_rule, settlementRule: data.settlement_rule,
    isActive: data.is_active, createdAt: data.created_at,
  } });
}
