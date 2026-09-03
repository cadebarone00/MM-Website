import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCareerStatsDatabase } from "@/lib/data/careerStatsDatabase";
import { OddsModelLab } from "@/components/portal/tiger/OddsModelLab";

export default async function OddsModelPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");
  const { records, databaseReady } = await getCareerStatsDatabase();
  return <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-7"><h1 className="font-serif text-3xl font-bold text-ink-900">Odds Model</h1><p className="mt-2 font-sans text-sm text-ink-500">Run model previews from the normalized 18-hole Career Stats records. This is Tiger Center’s model workspace; the workbook remains source data and audit documentation.</p><div className="mt-6"><OddsModelLab records={records} databaseReady={databaseReady} /></div></div>;
}
