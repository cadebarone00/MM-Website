"use client";

import { useState } from "react";
import styles from "../CreateTournament.module.css";

/** One Trip Builder question as a row of picks (radio buttons styled like the questionnaire's options). */
export function TripChoice({ question, name, options, required = false }: {
  question: string; name: string; options: readonly { value: string; label: string }[]; required?: boolean;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const id = `${name}-question`;
  return <div className={styles.fields}>
    <h2 className={styles.sectionTitle} id={id}>{question}</h2>
    <div className={styles.list} role="radiogroup" aria-labelledby={id}>
      {options.map(option => <label key={option.value} className={`${styles.option} ${choice === option.value ? styles.selected : ""}`}>
        <input type="radio" className={styles.circleInput} name={name} value={option.value} required={required}
          checked={choice === option.value} onChange={() => setChoice(option.value)} />
        {option.label}
      </label>)}
    </div>
  </div>;
}
