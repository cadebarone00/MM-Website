import Link from "next/link";
import { redirect } from "next/navigation";
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
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-4 py-16 text-center sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Where to?</h1>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="flex-1 rounded-sm border border-ink-300 px-5 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-900 hover:bg-cream-50"
        >
          Website
        </Link>
        <Link
          href="/portal"
          className="flex-1 rounded-sm bg-maroon-700 px-5 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50"
        >
          Portal
        </Link>
      </div>
    </div>
  );
}
