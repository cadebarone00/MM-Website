// app/portal/admin/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TigerCenterNav } from "@/components/portal/tiger/TigerCenterNav";

export default async function TigerCenterPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-3xl font-bold text-ink-900">The Tiger Center</h1>
      <div className="mt-6">
        <TigerCenterNav />
      </div>
      <Link
        href="/portal/admin/wagers"
        className="mt-8 block font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
      >
        MM Coins Settlement →
      </Link>
    </div>
  );
}
