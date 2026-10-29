import Link from "next/link";
import { redirect } from "next/navigation";
import { loadWebsitePlayer } from "@/lib/website/playerSession";
import { WebsiteBrand } from "@/components/marketing/WebsiteBrand";
import styles from "@/components/tap-in/TapIn.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tap In | The Maroon", robots: { index: false, follow: false } };
export default async function TapInPage() {
  const player = await loadWebsitePlayer();
  if (!player) redirect("/login/email?next=%2Ftap-in");
  if (!player.complete) redirect("/profile");
  return <main className={styles.landing}>
    <header><WebsiteBrand href="/website" /><Link href="/dashboard">My Dashboard</Link></header>
    <section><p className={styles.eyebrow}>TAP IN</p><h1>Your leaderboard.<br />On the big screen.</h1><p>Open Watch Live in your TV browser or a connected computer. Choose a board and go fullscreen.</p>
    <Link className={styles.action} href="/broadcast">Watch Live</Link>
    <p className={styles.source}>The Maroon Tournament &middot; Individual leaderboard and match play</p></section>
  </main>;
}
