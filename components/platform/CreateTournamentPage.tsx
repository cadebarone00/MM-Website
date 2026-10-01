"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Shield, Trophy, Users, type LucideIcon } from "lucide-react";
import { SETUP_TYPES, setupNextStepHref, type SetupType } from "@/lib/platform/setupTypes";
import styles from "./CreateTournament.module.css";

const ICONS: Record<SetupType["key"], LucideIcon> = {
  event: CalendarDays,
  team: Shield,
  league: Trophy,
  group: Users,
};

/**
 * Create Tournament (/tournaments/create): setup page 1. No header: the top
 * half is plain cream (empty for now), the bottom half is maroon with the
 * picker. Continue opens the picked type's next step.
 */
export function CreateTournamentPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<SetupType | null>(null);

  return <main className={styles.split}>
      <section className={styles.cream} aria-hidden="true" />
      <section className={styles.picker} aria-labelledby="create-title">
        <h1 id="create-title" className={styles.question}>What are you creating?</h1>
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
    </main>;
}
