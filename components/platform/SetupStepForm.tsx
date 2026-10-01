"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./CreateTournament.module.css";

/**
 * One questionnaire step inside SetupSheet: the fields, then Back, then Next at the bottom (just over
 * the bottom menu). Next lights up once every `required` field is filled in validly, and opens `nextHref`.
 */
export function SetupStepForm({ nextHref, backHref, children }: { nextHref: string; backHref: string; children: ReactNode }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [ready, setReady] = useState(false);

  const check = () => setReady(formRef.current?.checkValidity() ?? false);
  // Pick up values the browser restores (autofill, coming Back to the page).
  useEffect(check, []);

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formRef.current?.checkValidity()) router.push(nextHref);
  }

  return <form ref={formRef} className={styles.stepForm} onInput={check} onChange={check} onSubmit={next} noValidate>
    {children}
    <Link href={backHref} className={styles.back}>Back</Link>
    <button type="submit" className={`${styles.continue} ${styles.start}`} disabled={!ready}>Next</button>
  </form>;
}
