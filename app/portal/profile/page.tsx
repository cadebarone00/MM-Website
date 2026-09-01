import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getProfileOverrides, mergeProfile } from "@/lib/data/players/overrides";
import { ProfileEditGrid } from "@/components/portal/ProfileEditGrid";

export default async function PortalProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase.from("profiles").select("player_slug").eq("id", user.id).single();
  if (!profileRow?.player_slug) redirect("/portal");

  const baseProfile = getPlayerProfileBySlug(profileRow.player_slug);
  if (!baseProfile) redirect("/portal");

  const overrides = await getProfileOverrides(profileRow.player_slug);
  const profile = mergeProfile(baseProfile, overrides);

  const service = createSupabaseServiceRoleClient();
  const { data: pending } = await service
    .from("player_profile_edits")
    .select("field, proposed_value, submitted_at")
    .eq("player_slug", profileRow.player_slug);

  const pendingEdits = (pending ?? []).map((row) => ({
    field: row.field as string,
    proposedValue: row.proposed_value as string | string[],
    submittedAt: row.submitted_at as string,
  }));

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <Link href="/portal" className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500 hover:text-maroon-700">
        ← Back to Portal
      </Link>
      <h1 className="mt-4 font-serif text-2xl font-bold text-ink-900">Edit My Bio</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">Changes you save here need Tiger&rsquo;s approval before they show up on your public bio.</p>
      <div className="mt-6">
        <ProfileEditGrid profile={profile} pendingEdits={pendingEdits} />
      </div>
    </div>
  );
}
