"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Shield, Trophy, Users, type LucideIcon } from "lucide-react";
import { SETUP_TYPES, setupNextStepHref, type SetupType } from "@/lib/platform/setupTypes";
import { PlatformHeader } from "./PlatformHeader";
import styles from "./CreateTournament.module.css";

const ICONS: Record<SetupType["key"], LucideIcon> = {
  event: CalendarDays,
  team: Shield,
  league: Trophy,
  group: Users,
};

/**
 * Create Tournament (/tournaments/create): setup page 1. Pick what you're
 * creating, then Continue opens that type's next step.
 */
export function CreateTournamentPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<SetupType | null>(null);

  return <>
    <PlatformHeader title="Create Tournament" />
    <main className={styles.page}>
      <section className={styles.intro}>
        <h2 className={styles.title}>What are you creating?</h2>
        <p className={styles.subtitle}>Choose one to get started</p>
      </section>
      <section className={styles.picker}>
        <div className={styles.grid} role="radiogroup" aria-label="What are you creating?">
          {SETUP_TYPES.map((type) => {
            const Icon = ICONS[type.key];
            const isSelected = selected?.key === type.key;
            return <button key={type.key} type="button" role="radio" aria-checked={isSelected}
              className={`${styles.card} ${isSelected ? styles.selected : ""}`} onClick={() => setSelected(type)}>
              <span className={styles.icon} aria-hidden="true"><Icon size={20} strokeWidth={2} /></span>
              <strong className={styles.name}>{type.name}</strong>
              <span className={styles.description}>{type.description}</span>
            </button>;
          })}
        </div>
        <button type="button" className={styles.continue} disabled={!selected}
          onClick={() => selected && router.push(setupNextStepHref(selected))}>
          Continue
        </button>
      </section>
    </main>
  </>;
}
