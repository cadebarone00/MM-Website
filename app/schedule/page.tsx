import Image from "next/image";
import Link from "next/link";
import { nextTournament } from "@/lib/data";
import styles from "./schedule.module.css";

export default function ScheduleIndex() {
  return <main className={styles.landing}>
    <Image src="/schedule/mission-hills.webp" alt="Palm-lined golf course and lake beneath the mountains at sunset" fill priority sizes="100vw" className={styles.photo} />
    <div className={styles.shade} />
    <Link href="/" className={styles.back}>Back</Link>
    <header className={styles.brand}><p>The Maroon Masters</p><p>2027</p></header>
    <div className={styles.title}><h1>Mission Hills Country Club</h1><p>Palm Springs, CA</p></div>
    <nav className={styles.days} aria-label="Tournament days">{[6, 7, 8, 9].map((day, index) => <Link key={day} href={"/schedule/" + nextTournament.slug + "?date=" + nextTournament.year + "-01-0" + day}><span className={styles.dayNumber}>Day {index + 1}</span><span>January {day}</span></Link>)}</nav>
  </main>;
}
