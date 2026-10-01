"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SetupStepForm } from "./SetupStepForm";
import styles from "./CreateTournament.module.css";

const CHOICES = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "undecided", label: "Not sure yet" },
] as const;

type Choice = (typeof CHOICES)[number]["value"];

/**
 * A Golf Trip questionnaire step that asks one Yes / No / Not sure yet question (Format, Lodging, Flights,
 * Transportation). The picked answer shows its own content underneath. Next needs an answer.
 */
export function GolfTripChoiceStep({ question, name, nextHref, backHref, answers }: {
  question: string; name: string; nextHref: string; backHref: string; answers: Partial<Record<Choice, ReactNode>>;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const questionId = `${name}-question`;
  const answerRef = useRef<HTMLDivElement>(null);
  // The sheet is a fixed height, so bring the picked answer's content (e.g. the connect buttons) into view.
  useEffect(() => { if (choice) answerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [choice]);

  return <SetupStepForm nextHref={nextHref} backHref={backHref}>
    <div className={styles.fields}>
      <h2 className={styles.sectionTitle} id={questionId}>{question}</h2>
      <div className={styles.list} role="radiogroup" aria-labelledby={questionId}>
        {CHOICES.map((option) => <label key={option.value} className={`${styles.option} ${choice === option.value ? styles.selected : ""}`}>
          <input type="radio" className={styles.circleInput} name={name} value={option.value} required
            checked={choice === option.value} onChange={() => setChoice(option.value)} />
          {option.label}
        </label>)}
      </div>
      {choice && answers[choice] && <div ref={answerRef} aria-live="polite">{answers[choice]}</div>}
    </div>
  </SetupStepForm>;
}
