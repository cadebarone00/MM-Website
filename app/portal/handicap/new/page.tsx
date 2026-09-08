import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCourseLibraryForHandicap } from "@/lib/handicap/data";
import { HandicapRoundWizard } from "@/components/portal/handicap/HandicapRoundWizard";

export default async function NewHandicapRoundPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host, player_slug").eq("id", user.id).single();
  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");
  if (profile.is_host) redirect("/portal/admin");

  const courses = await getCourseLibraryForHandicap();

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-7">
      <HandicapRoundWizard courses={courses} />
    </div>
  );
}
