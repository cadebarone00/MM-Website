"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import styles from "./SignInRequiredLink.module.css";

const TOAST_MS = 6000;

/**
 * A "Create …" link that needs an account. Signed out, a tap doesn't follow the link: a toast drops down from the
 * top saying `message`, with a Sign in button that goes straight to the sign-up form. Until the account check
 * answers (a moment after load), the link works normally; saving still requires sign-in on the server either way.
 */
export function SignInRequiredLink({ href, className, message, children }: { href: string; className?: string; message: string; children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [toastKey, setToastKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (!cancelled && data) setSignedIn(data.session !== null); })
      .catch(() => {}); // Unknown stays unknown: the link just works and the server still checks on save.
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (toastKey === 0) return;
    const timer = setTimeout(() => setToastKey(0), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toastKey]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (signedIn !== false) return;
    event.preventDefault();
    setToastKey((key) => key + 1); // A new key restarts the timer (and the drop-down) on each tap.
  };

  return <>
    <Link href={href} className={className} onClick={onClick}>{children}</Link>
    {toastKey > 0 && createPortal(
      <div key={toastKey} className={styles.toast} role="status">
        <p className={styles.message}>{message}</p>
        <Link href="/signup" className={styles.signIn}>Sign in</Link>
        <button type="button" className={styles.close} aria-label="Dismiss" onClick={() => setToastKey(0)}><X size={16} strokeWidth={2.25} aria-hidden /></button>
      </div>,
      document.body,
    )}
  </>;
}
