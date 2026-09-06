import { redirect } from "next/navigation";
import { LoadingScreen } from "@/components/LoadingScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ChooseAccountPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_host, player_slug")
    .eq("id", user.id)
    .single();

  // Fan accounts have no Portal to fork to — go straight through.
  if (!profile || (!profile.is_host && !profile.player_slug)) {
    redirect("/");
  }

  return (
    <LoadingScreen heading="The Maroon Masters" belowAreaNav headingClassName="normal-case tracking-normal">
      <p className="-mt-4 font-condensed text-2xl font-semibold tracking-[0.18em] text-cream-50 sm:text-3xl">2027</p>
    </LoadingScreen>
  );
}
