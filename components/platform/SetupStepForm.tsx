"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveGolfTripDraft } from "@/lib/platform/golfTripDraft";
import styles from "./CreateTournament.module.css";

/**
 * One Golf Trip questionnaire step inside SetupSheet: the fields, then Back, then Next at the bottom (just over
 * the bottom menu). Next lights up once every `required` field is filled in validly (and `complete`, for answers
 * that aren't plain fields), then keeps this step's answers in the draft and opens `nextHref`.
 */
export function SetupStepForm({ nextHref, backHref, complete = true, children }: {
  nextHref: string; backHref: string; complete?: boolean; children: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [valid, setValid] = useState(false);

  const check = () => setValid(formRef.current?.checkValidity() ?? false);
  // Pick up values the browser restores (autofill, coming Back to the page).
  useEffect(check, []);

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formRef.current;
    if (!form?.checkValidity() || !complete) return;
    const values: Record<string, string> = {};
    new FormData(form).forEach((value, key) => { if (typeof value === "string") values[key] = value; });
    // Changed answers make a new trip: forget Review's request id so Create can't return an older one.
    saveGolfTripDraft({ ...values, requestId: "" });
    router.push(nextHref);
  }

  return <form ref={formRef} className={styles.stepForm} onInput={check} onChange={check} onSubmit={next} noValidate>
    {children}
    <Link href={backHref} className={styles.back}>Back</Link>
    <button type="submit" className={`${styles.continue} ${styles.start}`} disabled={!valid || !complete}>Next</button>
  </form>;
}
