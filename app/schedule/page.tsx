import Image from "next/image";
import Link from "next/link";
import { getSeasonCatalog, nativeSeasonYear } from "@/lib/data/seasonCatalog";
import { getUpcomingRoundSchedule } from "@/lib/data/activeSeasonOverlay";
import { tournamentDays } from "@/components/schedule/scheduleDays";
import styles from "./schedule.module.css";
export const dynamic = "force-dynamic";
export default async function ScheduleIndex() {
  const { nextTournament } = await getSeasonCatalog();
  const rounds = await getUpcomingRoundSchedule(nextTournament.year);
  const dates = tournamentDays(rounds, nextTournament.startDate, nextTournament.endDate);
  return <main className={styles.landing}>
    <Image src="/schedule/mission-hills.webp" alt="Golf course at sunset" fill priority sizes="100vw" className={styles.photo} />
    <div className={styles.shade} /><Link href="/website" className={styles.back}>Back</Link>
    <header className={styles.brand}><p>The Maroon Masters</p><p>{nextTournament.year}</p></header>
    <div className={styles.title}><h1>{nextTournament.venue}</h1><p>{nextTournament.location}</p></div>
    <nav className={styles.days} aria-label="Tournament days">{dates.map((date,index)=><Link key={date} href={"/schedule/"+nextTournament.slug+(nativeSeasonYear(nextTournament.slug)?"?date="+date:"")}><span className={styles.dayNumber}>Day {index+1}</span><span>{new Date(date+"T12:00:00Z").toLocaleDateString("en-US",{timeZone:"UTC",month:"long",day:"numeric"})}</span></Link>)}{!dates.length&&<Link href={"/schedule/"+nextTournament.slug}>Dates pending</Link>}</nav>
  </main>;
}
