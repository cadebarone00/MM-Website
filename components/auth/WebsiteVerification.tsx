"use client";

import { useEffect, useRef, useState } from "react";
import { preparePasswordSession } from "@/lib/auth/passwordSession";

/** Uses the existing verified-session exchange for PKCE cookies or implicit email fragments. */
export function WebsiteVerification() {
  const [failed, setFailed] = useState(false);
  const pending = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    pending.current ??= preparePasswordSession(window.location.href, () => {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    });
    pending.current.then(() => window.location.replace("/dashboard")).catch(() => setFailed(true));
  }, []);
  return <section style={{ maxWidth: 480, margin: "60px auto", padding: 24 }}>
    <h1>{failed ? "Verification link unavailable" : "Completing your sign in"}</h1>
    {failed ? <p>This link could not be verified. <a href="/login/email?next=%2Fdashboard">Sign in or resend verification</a>.</p> : <p role="status">Checking your account…</p>}
  </section>;
}
