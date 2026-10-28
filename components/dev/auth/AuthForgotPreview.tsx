"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import frame from "./AuthNamePreview.module.css";
import styles from "./AuthForgotPreview.module.css";

/** DEV ONLY: Authentication "Forgot password": email → Reset password code (emailed, typed in the app, no link to open)
 * → Reset password. Nothing is sent yet; the real flow must answer the same way whether or not the email has an account. */
export function AuthForgotPreview() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const ready = /^\S+@\S+\.\S+$/.test(email.trim());

  return <main className={frame.page}>
    <div className={`${frame.logo} ${styles.logo}`}><MaroonMark color="#fbf8f1" /></div>
    <h1 className={frame.title}>Forgot password</h1>
    <form className={frame.fields} onSubmit={(e) => { e.preventDefault(); if (ready) router.push("/dev/auth/reset-code"); }}>
      <label className={frame.field}><span>Email</span>
        <input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <button type="submit" className={`${frame.continue} ${styles.send}`} disabled={!ready}>Send code</button>
    </form>
  </main>;
}
