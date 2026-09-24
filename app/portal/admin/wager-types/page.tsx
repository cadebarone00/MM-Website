import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { WagerType } from "@/lib/wagers/wagerTypes";
import { WagerTypesPanel } from "@/components/portal/tiger/WagerTypesPanel";

export default async function WagerTypesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("wager_types").select("*").order("created_at", { ascending: false });
  const wagerTypes: WagerType[] = (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    scope: row.scope,
    marketKind: row.market_kind,
    statKey: row.stat_key,
    calculationRule: row.calculation_rule,
    settlementRule: row.settlement_rule,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));

  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">Wager Types</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">Publish only wager models that are built into the app and documented in the odds specification. Each card shows its audience, public location, readiness requirements, calculation method, and settlement rule.</p>
      <div className="mt-6"><WagerTypesPanel initialWagerTypes={wagerTypes} databaseReady={!error} /></div>
    </div>
  );
}
