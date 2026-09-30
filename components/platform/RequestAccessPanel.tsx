"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { FieldError, MyAccess, MyAccessRequest } from "@/lib/platform/accessRequests";
import styles from "./AccessRequests.module.css";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Summary({ request }: { request: MyAccessRequest }) {
  return <dl className={styles.summary}>
    <div><dt>Tournament or group</dt><dd>{request.groupName}</dd></div>
    <div><dt>Year</dt><dd>{request.seasonYear}</dd></div>
    <div><dt>Approximate players</dt><dd>{request.expectedPlayers}</dd></div>
    {request.destination && <div><dt>Location</dt><dd>{request.destination}</dd></div>}
    {request.note && <div><dt>About your tournament</dt><dd>{request.note}</dd></div>}
  </dl>;
}

/**
 * The requester's side of beta creator access: the form, or the status of
 * their request. Submitting never unlocks creation; only a platform admin's
 * approval does.
 */
export function RequestAccessPanel({ initialAccess, name, email, years }: { initialAccess: MyAccess; name: string; email: string; years: number[] }) {
  const [access, setAccess] = useState(initialAccess);
  const [errors, setErrors] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const request = access.request;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true); setErrors([]);
    try {
      const response = await fetch("/api/platform/access-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        setErrors([result.error ?? "Could not send your request. Try again.", ...(Array.isArray(result.errors) ? result.errors.map((e: FieldError) => e.message) : [])]);
        return;
      }
      setAccess(result.access);
    } catch {
      setErrors(["Could not reach the server. Your request wasn't sent."]);
    } finally {
      setSending(false);
    }
  }

  if (access.canCreate) {
    return <section className={styles.card} data-state="approved" aria-labelledby="access-title">
      <h2 id="access-title">{request?.status === "approved" ? "You're approved" : "You can create tournaments"}</h2>
      <p>Your account can create tournaments. Pick up where you left off.</p>
      {request?.status === "approved" && request.decisionNote && <p className={styles.decision}><strong>Note from the review team:</strong> {request.decisionNote}</p>}
      <div className={styles.actions}><Link className={styles.primary} href="/tournaments/new">Create Tournament</Link></div>
    </section>;
  }

  if (request?.status === "pending") {
    return <section className={styles.card} data-state="pending" aria-labelledby="access-title">
      <h2 id="access-title">Request received</h2>
      <p>Thanks{request.requesterName ? `, ${request.requesterName.split(" ")[0]}` : ""}. We&apos;ll review it and update this page. Creating tournaments stays unavailable until your request is approved. You can still sketch a draft in the meantime; it just won&apos;t save.</p>
      <Summary request={request} />
      <div className={styles.actions}><Link className={styles.secondary} href="/tournaments">My Tournaments</Link></div>
    </section>;
  }

  if (request?.status === "denied") {
    return <section className={styles.card} data-state="denied" aria-labelledby="access-title">
      <h2 id="access-title">Request not approved</h2>
      <p>We weren&apos;t able to approve tournament creation for this request right now. If you&apos;d like to talk it through, get in touch.</p>
      {request.decisionNote && <p className={styles.decision}><strong>Note from the review team:</strong> {request.decisionNote}</p>}
      <div className={styles.actions}><Link className={styles.secondary} href="/contact">Contact us</Link><Link className={styles.secondary} href="/tournaments">My Tournaments</Link></div>
    </section>;
  }

  return <form className={styles.card} onSubmit={submit} noValidate aria-labelledby="access-title">
    <h2 id="access-title">Request access</h2>
    <p>Creating tournaments is invite-only during the beta. Tell us a little about your event and we&apos;ll review it. This doesn&apos;t create anything or contact anyone.</p>
    {errors.length > 0 && <div className={styles.errors} role="alert"><strong>{errors[0]}</strong>{errors.length > 1 && <ul>{errors.slice(1).map((error) => <li key={error}>{error}</li>)}</ul>}</div>}
    <div className={styles.fields}>
      <Field label="Your name"><input name="requesterName" defaultValue={name} maxLength={80} autoComplete="name" required /></Field>
      <Field label="Email" hint="From your account. We'll use it to reply about this request."><input value={email} readOnly aria-readonly="true" /></Field>
      <Field label="Tournament or group name"><input name="groupName" maxLength={80} required /></Field>
      <div className={styles.columns}>
        <Field label="Tournament year"><select name="seasonYear" defaultValue={years[1]}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></Field>
        <Field label="Approximate players"><input name="expectedPlayers" type="number" min={2} max={500} inputMode="numeric" required /></Field>
      </div>
      <Field label="Location (optional)"><input name="destination" maxLength={120} placeholder="e.g. Horseshoe Bay, TX" /></Field>
      <Field label="Tell us about your tournament (optional)"><textarea name="note" maxLength={1000} rows={4} /></Field>
    </div>
    <div className={styles.actions}><button className={styles.primary} type="submit" disabled={sending}>{sending ? "Sending…" : "Send request"}</button></div>
  </form>;
}
