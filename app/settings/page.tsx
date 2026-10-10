import type { Metadata } from "next";
import Link from "next/link";
import { PrivacySetting } from "@/components/settings/PrivacySetting";
import { SignOutButton } from "@/components/settings/SignOutButton";
import { getMyRoundsVisibility } from "@/lib/platform/playerRoundsServer";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings | The Maroon" };

/** Settings (the gear on Profile and in the account menu): Account (Sign Out) and Privacy (Rounds public / private). Signed-out visitors get Log In. */
export default async function SettingsPage() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  const current = await getCurrentProfile();
  // Privacy is a profile setting, so it only shows once the account has its profile.
  const privacy = current.status === "ok" ? await getMyRoundsVisibility(current.profile.profileId) : null;

  return (
    <div className="mx-auto max-w-[480px] px-4 py-12 sm:px-7 sm:py-16">
      <h1 className="m-0 font-serif text-3xl font-bold text-ink-900 sm:text-4xl">Settings</h1>
      <section aria-labelledby="settings-account" className="mt-8 rounded-md border border-ink-200 bg-white p-5">
        <h2 id="settings-account" className="m-0 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">Account</h2>
        {user ? <>
          {user.email && <p className="mt-2 font-sans text-base text-ink-900">Signed in as {user.email}</p>}
          <div className="mt-4"><SignOutButton /></div>
        </> : <>
          <p className="mt-2 font-sans text-base text-ink-600">You&apos;re not signed in.</p>
          <Link href="/login" className="mt-4 flex min-h-11 w-full items-center justify-center rounded-pill bg-maroon-900 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50 hover:bg-maroon-700">
            Log In
          </Link>
        </>}
      </section>
      {privacy && <section aria-labelledby="settings-privacy" className="mt-4 rounded-md border border-ink-200 bg-white p-5">
        <h2 id="settings-privacy" className="m-0 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">Privacy · Profile</h2>
        <PrivacySetting initial={privacy.visibility} />
      </section>}
    </div>
  );
}
