"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { SETUP_TYPES, setupNextStepHref, type SetupType } from "@/lib/platform/setupTypes";
import styles from "./CreateTournament.module.css";

/**
 * Create Tournament (/tournaments/create): setup page 1. No header: cream up
 * top (empty for now), a maroon sheet below with the stacked choices: Golf
 * Trip first, a gold "Or", then the rest. Continue opens the picked type's
 * next step.
 */
export function CreateTournamentPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<SetupType | null>(null);

  return <main className={styles.split}>
      <section className={styles.cream} aria-hidden="true" />
      <section className={styles.picker} aria-label="Create a tournament">
        <div className={styles.list} role="radiogroup" aria-label="What are you creating?">
          {SETUP_TYPES.map((type, index) => {
            const isSelected = selected?.key === type.key;
            return <Fragment key={type.key}>
              <button type="button" role="radio" aria-checked={isSelected}
                className={`${styles.option} ${isSelected ? styles.selected : ""}`} onClick={() => setSelected(type)}>
                {type.name}
              </button>
              {index === 0 && <span className={styles.or} aria-hidden="true">Or</span>}
            </Fragment>;
          })}
        </div>
        <button type="button" className={styles.continue} disabled={!selected}
          onClick={() => selected && router.push(setupNextStepHref(selected))}>
          Continue
        </button>
      </section>
    </main>;
}
