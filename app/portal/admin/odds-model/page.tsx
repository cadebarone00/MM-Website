import { redirect } from "next/navigation";
import { OddsModelLab } from "@/components/portal/tiger/OddsModelLab";
import { careerArchiveCourseHoles, careerArchiveRecords, careerArchiveTeamRecords } from "@/lib/data/careerArchive";
import { getLiveCareerArchiveRecords, getLiveCareerArchiveTeamRecords } from "@/lib/data/careerStatsDatabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OddsModelPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");
  const [liveRecords, liveTeamRecords] = await Promise.all([getLiveCareerArchiveRecords(), getLiveCareerArchiveTeamRecords()]);
  const records = [...careerArchiveRecords, ...liveRecords];
  return <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-7">
    <h1 className="font-serif text-3xl font-bold text-ink-900">Odds Model</h1>
    <p className="mt-2 font-sans text-sm text-ink-500">Match odds are calculated from the normalized Career Archive. The simulator expands format and live models as each is validated.</p>
    <div className="mt-6"><OddsModelLab records={records} teamRecords={[...careerArchiveTeamRecords, ...liveTeamRecords]} courseHoles={careerArchiveCourseHoles} /></div>
  </div>;
}
