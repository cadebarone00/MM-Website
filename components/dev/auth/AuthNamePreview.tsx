"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { NAME_MAX, usernameProblem } from "@/lib/profile/profileEdit";
import { signUpProgress } from "@/lib/dev/authScreens";
import styles from "./AuthNamePreview.module.css";

/** "Alex" + "Smith" → "alexsmith": letters and numbers only, 30 max (the username rules in profileEdit.ts). */
export function suggestUsername(first: string, last: string) {
  return (first + last).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
}

/** DEV ONLY: Authentication screen "Name + username". The username fills itself from the name until the person
 * edits it. Not wired to onboarding yet; the database still decides whether a username is free. */
export function AuthNamePreview() {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [typedUsername, setTypedUsername] = useState<string | null>(null);
  const username = typedUsername ?? suggestUsername(first, last);
  const problem = username ? usernameProblem(username) : null;
  const ready = first.trim() !== "" && username !== "" && !problem;

  return <main className={styles.page}>
    <div className={styles.logo}><MaroonMark color="#fbf8f1" /></div>
    <div className={styles.progress} aria-hidden="true"><span style={{ width: signUpProgress("name-username") }} /></div>
    <h1 className={styles.title}>What&apos;s your name?</h1>
    <form className={styles.fields} onSubmit={(e) => { e.preventDefault(); if (ready) router.push("/dev/auth/age-check"); }}>
      <label className={styles.field}><span>First Name</span>
        <input autoComplete="given-name" autoFocus maxLength={NAME_MAX} value={first} onChange={(e) => setFirst(e.target.value)} /></label>
      <label className={styles.field}><span>Last Name</span>
        <input autoComplete="family-name" maxLength={NAME_MAX} value={last} onChange={(e) => setLast(e.target.value)} /></label>
      <label className={styles.field}><span>Username</span>
        <div className={styles.handle}>@<input autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} value={username}
          onChange={(e) => setTypedUsername(e.target.value.replace(/\s/g, ""))} /></div></label>
      {/* Always rendered so Continue never moves when a username message appears. */}
      <p className={styles.error} role="alert">{problem}</p>
      <button type="submit" className={styles.continue} disabled={!ready}>Continue</button>
    </form>
  </main>;
}
