import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { contentViewer, hashToken, LINK_DAYS } from "@/lib/content/ribbonServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import styles from "@/components/settings/Settings.module.css";

export const metadata: Metadata = { title: "Join the content team | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where a one-time Content team invite link lands. Signing in comes first; the link is used up only after that, and turns
 * into the same Accept / Decline card on the Play page that an invite by username shows. It never makes someone a Poster.
 */
export default async function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await contentViewer();
  if (!viewer.profileId) redirect(`/login?next=${encodeURIComponent(`/join-team/${token}`)}`);
  if (viewer.role === "admin" || viewer.role === "poster" || viewer.role === "invited") redirect("/");
  const service = createSupabaseServiceRoleClient();
  // Deleting first makes the link one-time: if two people race, only one gets the row back.
  const { data: link } = await service.from("content_team").delete().eq("invite_token_hash", hashToken(token)).is("profile_id", null).gt("expires_at", new Date().toISOString()).select("invited_by").maybeSingle();
  if (link) {
    const { error } = await service.from("content_team").upsert({ profile_id: viewer.profileId, status: "invited", invited_by: link.invited_by, invited_at: new Date().toISOString(), accepted_at: null, removed_by: null, removed_at: null }, { onConflict: "profile_id" });
    if (error) console.error("join-team: couldn't save the invite", error);
    else redirect("/");
  }
  return <main className={styles.page}><div className={styles.inner}>
    <section className={styles.card}>
      <h1 className={styles.cardTitle}>This invite link doesn&apos;t work</h1>
      <p className={styles.text}>It may have been used already or be more than {LINK_DAYS} days old. Ask whoever sent it for a new one.</p>
      <Link href="/" className={styles.linkButton}>Back to Play</Link>
    </section>
  </div></main>;
}
