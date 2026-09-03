import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CareerStatsPanel } from "@/components/portal/tiger/CareerStatsPanel";
import { careerArchivePartnerships, careerArchiveRecords, careerArchiveTeamRecords } from "@/lib/data/careerArchive";

export default async function CareerStatsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");
  return (
    <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">Career Stats</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">The permanent, versioned archive for historical player, partnership, and match data. Individual score history remains separate from Fourball and Alternate Shot team results.</p>
      <div className="mt-6"><CareerStatsPanel records={careerArchiveRecords} partnerships={careerArchivePartnerships} teamRecords={careerArchiveTeamRecords} /></div>
    </div>
  );
}
