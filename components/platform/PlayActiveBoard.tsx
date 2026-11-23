import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { CourseSearchBar } from "./TripScheduleCoursePicker";
import { RoundInvites } from "./RoundInvites";
import { customRef } from "@/lib/platform/golfGps/courseRefs";
import type { PersonalRoundSetup } from "@/lib/platform/personalRound";
import type { SharedRound } from "@/lib/platform/sharedRoundsServer";
import styles from "./MobileHome.module.css";

type Active = { name: string; place: string; href: string };

/** The existing round API exposes the most recent live shared round; local-only rounds remain on this device. */
export function PlayActiveBoard({ signedIn, preview, onRange }: { signedIn: boolean; preview: boolean; onRange: () => void }) {
  const router = useRouter();
  const [active, setActive] = useState<Active | null>(null);
  const [loading, setLoading] = useState(signedIn && !preview);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState(false);
  useEffect(() => {
    if (!signedIn || preview) return;
    let cancelled = false;
    async function load() {
      let local: { setup?: PersonalRoundSetup; sharedId?: string } | null = null;
      try { local = JSON.parse(localStorage.getItem("maroonPersonalRound") ?? "null"); } catch { /* no usable saved round */ }
      try {
        const response = await fetch("/api/rounds/shared", { cache: "no-store" });
        const body = await response.json() as { ok?: boolean; id?: string | null };
        if (!response.ok || !body.ok) throw new Error("round unavailable");
        if (body.id) {
          const detailResponse = await fetch(`/api/rounds/shared/${encodeURIComponent(body.id)}`, { cache: "no-store" });
          const detail = await detailResponse.json() as { ok?: boolean; round?: SharedRound };
          if (!detailResponse.ok || !detail.ok || !detail.round) throw new Error("round unavailable");
          if (!cancelled && detail.round.status === "live") setActive({ name: detail.round.setup.course.name, place: detail.round.setup.course.place, href: `/rounds/new?round=${encodeURIComponent(body.id)}` });
        } else if (!cancelled && local?.setup?.course && !local.sharedId) {
          setActive({ name: local.setup.course.name, place: local.setup.course.place, href: "/rounds/new?resume=1" });
        }
      } catch {
        if (!cancelled) {
          if (local?.setup?.course && !local.sharedId) setActive({ name: local.setup.course.name, place: local.setup.course.place, href: "/rounds/new?resume=1" });
          else setError(true);
        }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [signedIn, preview]);
  function choose(course: { ref: string; name: string; place: string }) {
    try { sessionStorage.setItem("maroonPlayCourse", JSON.stringify(course)); } catch { /* setup still allows manual search */ }
    router.push("/rounds/new?course=selected");
  }
  return <section className={styles.activeBoard} aria-label="Your active board">
    <div className={styles.boardTop}>
      <div className={styles.boardHeading}><div><span>YOUR ACTIVE BOARD</span><h2>Play</h2></div><span className={styles.boardMark}>M</span></div>
      {loading ? <p className={styles.boardMessage}>Looking for your round…</p> : active ?
        <Link className={styles.activeRound} href={active.href}><span><small>ROUND IN PROGRESS</small><strong>{active.name}</strong><em>{active.place || "Continue your round"}</em></span><ArrowRight size={20} aria-hidden="true" /></Link>
        : error ? <div className={styles.boardMessage}>Couldn’t load your active round. <button type="button" onClick={() => window.location.reload()}>Try again</button> <Link href="/rounds/new">Open Play</Link></div>
        : <><p className={styles.boardMessage}>Ready for your next round?</p><button className={styles.boardSearch} type="button" onClick={() => signedIn ? setSearch(true) : router.push("/login?next=/rounds/new")}><Search size={18} aria-hidden="true" /><span>Search for a course</span><ArrowRight size={18} aria-hidden="true" /></button></>}
    </div>
    <div className={styles.boardLower}><div className={styles.boardLowerHeading}><span>ROUND INVITES</span><button type="button" onClick={onRange}>On The Range <ArrowRight size={15} aria-hidden="true" /></button></div>{signedIn && !preview ? <RoundInvites showEmpty /> : <p>No round invites yet.</p>}</div>
    {search && <GolfTripActionSheet label="Find a course" onClose={() => setSearch(false)} slideUp><div className={styles.boardSearchSheet}><h2>Find a course</h2><p>Search by course, club, or city.</p><CourseSearchBar roundLabel="your round" autoFocus floating={false} onPick={choose} onUseTyped={(name) => choose({ ref: customRef(name), name, place: "" })} /></div></GolfTripActionSheet>}
  </section>;
}
