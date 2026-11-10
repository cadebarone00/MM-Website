"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readGolfTripDraft, saveGolfTripDraft, startGolfTripDraft, type GolfTripDraft } from "@/lib/platform/golfTripDraft";
import { TRIP_BUILDER_START, TRIP_BUILDER_STEPS, clampRoundsToDates, firstMissingStep, nextStep, previousStep, stepPath, type TripBuilderStep } from "@/lib/platform/tripBuilderSteps";
import styles from "./CreateTournament.module.css";

/**
 * One Golf Trip questionnaire step inside SetupSheet: the fields, then Back, then Next at the bottom (just over
 * the bottom menu). Next lights up once every `required` field is filled in validly (and `complete`, for answers
 * that aren't plain fields), then keeps this step's answers in the draft and moves on.
 *
 * Trip Builder steps pass `step`: Back / Next follow the step order for this draft (Teams and Format only when
 * competing, etc.), a step that's missing earlier required answers sends you back to them, and `skip` adds
 * "Skip for now" (it saves those values instead of the form's). After the last step Next calls `onCreate`.
 * Older steps can still pass `nextHref` / `backHref`.
 */
export function SetupStepForm({ step, nextHref, backHref, complete = true, skip, nextLabel = "Next", onCreate, children }: {
  step?: TripBuilderStep; nextHref?: string; backHref?: string; complete?: boolean; skip?: GolfTripDraft; nextLabel?: string;
  onCreate?: () => void; children: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [valid, setValid] = useState(false);
  const [draft, setDraft] = useState<GolfTripDraft>({});

  const check = () => setValid(formRef.current?.checkValidity() ?? false);
  // Fill empty fields from the draft (a trip started from Play → Featured trip, or coming Back to this step), then
  // pick up values the browser restores (autofill). Values go in like typing, so the page's own state follows.
  useEffect(() => {
    const saved = readGolfTripDraft();
    // Landed here without the required answers (new tab, deep link): go back to the first one that's missing.
    const missing = step ? firstMissingStep(saved) : null;
    if (step && missing && TRIP_BUILDER_STEPS.indexOf(missing) < TRIP_BUILDER_STEPS.indexOf(step)) { router.replace(stepPath(missing)); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the draft lives in this tab's sessionStorage, readable only after the server render
    setDraft(saved);
    const form = formRef.current;
    if (form) fillFromDraft(form, saved);
    check();
    // A filled-in Yes / No answer only shows as picked after the page redraws, so check again once it has.
    const frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(values: GolfTripDraft) {
    // Changed answers make a new trip: forget the request id so Create can't return an older one.
    if (!step) { saveGolfTripDraft({ ...values, requestId: "" }); router.push(nextHref ?? "/golf-trips/new"); return; }
    const merged = clampRoundsToDates({ ...readGolfTripDraft(), ...values });
    startGolfTripDraft(merged);
    const next = nextStep(step, merged);
    if (next === "create") onCreate?.();
    else router.push(stepPath(next));
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formRef.current;
    if (!form?.checkValidity() || !complete) return;
    const values: GolfTripDraft = {};
    new FormData(form).forEach((value, key) => { if (typeof value === "string") values[key] = value; });
    go(values);
  }

  const previous = step ? previousStep(step, draft) : null;
  const back = previous ? previous === "start" ? TRIP_BUILDER_START : stepPath(previous) : backHref ?? TRIP_BUILDER_START;
  return <form ref={formRef} className={styles.stepForm} onInput={check} onChange={check} onSubmit={next} noValidate>
    {children}
    {skip && <button type="button" className={styles.skip} onClick={() => go(skip)}>Skip for now</button>}
    <Link href={back} className={styles.back}>Back</Link>
    <button type="submit" className={`${styles.continue} ${styles.start}`} disabled={!valid || !complete}>{nextLabel}</button>
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
