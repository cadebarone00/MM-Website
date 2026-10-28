"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import styles from "./AuthCodePreview.module.css";

const CODE_LENGTH = 6;

/** DEV ONLY: Authentication screen 2 (Verification code). Six boxes fed by one hidden input, so typing,
 * pasting and the phone's "From Mail" code suggestion all work. Not wired to /api/auth/verify-code yet. */
export function AuthCodePreview() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);
  const complete = code.length === CODE_LENGTH;

  return <main className={styles.page}>
    <div className={styles.logo}><MaroonMark color="#fbf8f1" /></div>
    <div className={styles.progress} aria-hidden="true"><span /></div>
    <h1 className={styles.title}>Email Verification</h1>
    <form onSubmit={(e) => { e.preventDefault(); if (complete) router.push("/dev/auth/password"); }}>
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
