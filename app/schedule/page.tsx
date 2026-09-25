import Image from "next/image";
import Link from "next/link";
import { getSeasonCatalog } from "@/lib/data/seasonCatalog";
import { getUpcomingRoundSchedule } from "@/lib/data/activeSeasonOverlay";
import styles from "./schedule.module.css";
export const dynamic = "force-dynamic";
export default async function ScheduleIndex() {
  const { nextTournament } = await getSeasonCatalog();
  const rounds = await getUpcomingRoundSchedule(nextTournament.year);
  const dates = new Set(rounds.flatMap(round=>round.date?[round.date]:[]));
  const first=Date.parse(nextTournament.startDate),last=Date.parse(nextTournament.endDate);
  if(Number.isFinite(first)&&Number.isFinite(last)&&last-first<=31*86400000)for(let time=first;time<=last;time+=86400000)dates.add(new Date(time).toISOString().slice(0,10));
  return <main className={styles.landing}>
    <Image src="/schedule/mission-hills.webp" alt="Golf course at sunset" fill priority sizes="100vw" className={styles.photo} />
    <div className={styles.shade} /><Link href="/" className={styles.back}>Back</Link>
    <header className={styles.brand}><p>The Maroon Masters</p><p>{nextTournament.year}</p></header>
    <div className={styles.title}><h1>{nextTournament.venue}</h1><p>{nextTournament.location}</p></div>
    <nav className={styles.days} aria-label="Tournament days">{[...dates].sort().map((date,index)=><Link key={date} href={"/schedule/"+nextTournament.slug+"?date="+date}><span className={styles.dayNumber}>Day {index+1}</span><span>{new Date(date+"T12:00:00Z").toLocaleDateString("en-US",{timeZone:"UTC",month:"long",day:"numeric"})}</span></Link>)}{!dates.size&&<Link href={"/schedule/"+nextTournament.slug}>Dates pending</Link>}</nav>
  </main>;
}
