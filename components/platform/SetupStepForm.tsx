"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readGolfTripDraft, saveGolfTripDraft } from "@/lib/platform/golfTripDraft";
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
  // Fill empty fields from the draft (a trip started from Play → Featured trip, or coming Back to this step), then
  // pick up values the browser restores (autofill). Values go in like typing, so the page's own state follows.
  useEffect(() => {
    const form = formRef.current;
    if (form) fillFromDraft(form, readGolfTripDraft());
    check();
    // A filled-in Yes / No answer only shows as picked after the page redraws, so check again once it has.
    const frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, []);

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

/** Puts saved answers into empty fields as if typed. Skips hidden fields and search boxes (those fill themselves). */
function fillFromDraft(form: HTMLFormElement, draft: Record<string, string>) {
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement) || !element.name) continue;
    const saved = draft[element.name];
    if (saved === undefined || saved === "" || element.type === "hidden" || element.getAttribute("role") === "combobox") continue;
    if (element instanceof HTMLInputElement && element.type === "radio") {
      const group = form.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(element.name)}"]`);
      if (element.value === saved && !Array.from(group).some((radio) => radio.checked)) element.click();
      continue;
    }
    if (element.value !== "" && element.type !== "range") continue;
    if (element.value === saved) continue;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    setter?.call(element, saved);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
