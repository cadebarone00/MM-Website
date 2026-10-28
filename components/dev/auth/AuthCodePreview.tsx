"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { signUpProgress } from "@/lib/dev/authScreens";
import styles from "./AuthCodePreview.module.css";

const CODE_LENGTH = 6;

/** DEV ONLY: Authentication screen "Verification code" (signup step, with the progress bar) and, with other props, the
 * forgot-password "Enter Code To Reset" screen. Six boxes fed by one hidden input, so typing, pasting and the phone's
 * "From Mail" code suggestion all work. Not wired to /api/auth/verify-code yet. */
export function AuthCodePreview({ title = "Email Verification", nextHref = "/dev/auth/password", progress = true }:
  { title?: string; nextHref?: string; progress?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);
  const complete = code.length === CODE_LENGTH;

  return <main className={styles.page}>
    <div className={`${styles.logo} ${progress ? "" : styles.noProgressLogo}`}><MaroonMark color="#fbf8f1" /></div>
    {progress && <div className={styles.progress} aria-hidden="true"><span style={{ width: signUpProgress("verification-code") }} /></div>}
    <h1 className={styles.title}>{title}</h1>
    <form onSubmit={(e) => { e.preventDefault(); if (complete) router.push(nextHref); }}>
      <label className={styles.boxes}>
        <span className={styles.srOnly}>6-digit code</span>
        <input className={styles.hiddenInput} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={CODE_LENGTH} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))} />
        {Array.from({ length: CODE_LENGTH }, (_, index) =>
          <span key={index} aria-hidden="true" className={`${styles.box} ${index === Math.min(code.length, CODE_LENGTH - 1) ? styles.current : ""}`}>{code[index] ?? ""}</span>)}
      </label>
      <button type="button" className={styles.resend} onClick={() => setResent(true)}>{resent ? "New code sent" : "Resend code"}</button>
      <button type="submit" className={styles.verify} disabled={!complete}>Verify</button>
    </form>
    <footer className={styles.footer}>
      <p className={styles.help}>Experiencing issues? Email our team:<br /><a href="mailto:themaroonadmin@gmail.com">themaroonadmin@gmail.com</a></p>
    </footer>
  </main>;
}
