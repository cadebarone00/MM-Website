import Link from "next/link";
import { Swords, Trophy, UserRound, type LucideIcon } from "lucide-react";
import { CREATE_TIERS, tierSurveyHref, type CreateTier } from "@/lib/platform/createTiers";
import { PlatformHeader } from "./PlatformHeader";
import styles from "./CreateTournament.module.css";

const ICONS: Record<CreateTier["key"], LucideIcon> = {
  individual: UserRound,
  "match-play": Swords,
  "individual-match-play": Trophy,
};

/**
 * Create Tournament (/tournaments/create): the heading up top and the format
 * tiers as swipeable price boxes below. Tapping one opens the survey.
 */
export function CreateTournamentPage() {
  return <>
    <PlatformHeader wordmark={false} />
    <main className={styles.page}>
      <section className={styles.intro}>
        <h1 className={styles.title}>Your Next Tournament Starts Here</h1>
        <p className={styles.subtitle}>Pick the format that&apos;s right for your group</p>
      </section>
      <section className={styles.tiers} aria-label="Tournament formats">
        <ul className={styles.row}>
          {CREATE_TIERS.map((tier) => {
            const Icon = ICONS[tier.key];
            return <li key={tier.key}>
              <Link href={tierSurveyHref(tier)} className={styles.card}>
                <span className={styles.icon} aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
                <span className={styles.label}>{tier.label}</span>
                <strong className={styles.name}>{tier.name}</strong>
                <span className={styles.price}>{tier.price}</span>
              </Link>
            </li>;
          })}
        </ul>
      </section>
    </main>
  </>;
}
