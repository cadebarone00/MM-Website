"use client";

import { useState } from "react";
import { SetupStepForm } from "./SetupStepForm";
import styles from "./CreateTournament.module.css";

const CHOICES = [
  { value: "yes", label: "Yes", message: "Let's talk formats" },
  { value: "no", label: "No", message: "Time for some fun" },
  { value: "undecided", label: "Not sure yet", message: "Can't decide? You can always change it" },
] as const;

type Choice = (typeof CHOICES)[number]["value"];

/** Golf Trip questionnaire, step 5 (Format): will the trip include a tournament? Next needs an answer. */
export function GolfTripFormatStep() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const message = CHOICES.find((option) => option.value === choice)?.message;

  return <SetupStepForm nextHref="/golf-trips/new/travel" backHref="/golf-trips/new/courses">
    <div className={styles.fields}>
      <h2 className={styles.sectionTitle} id="format-question">Will this trip include a tournament?</h2>
      <div className={styles.list} role="radiogroup" aria-labelledby="format-question">
        {CHOICES.map((option) => <label key={option.value} className={`${styles.option} ${choice === option.value ? styles.selected : ""}`}>
          <input type="radio" className={styles.circleInput} name="includesTournament" value={option.value} required
            checked={choice === option.value} onChange={() => setChoice(option.value)} />
          {option.label}
        </label>)}
      </div>
      {message && <p className={styles.formatMessage} aria-live="polite">{message}</p>}
    </div>
  </SetupStepForm>;
}
