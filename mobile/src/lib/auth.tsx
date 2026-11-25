import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiJson } from "./api.ts";
import { stepFromReply, type AccountStep } from "./onboardingFlow.ts";
import { supabase } from "./supabase.ts";

/** A one-time message for the signed-out screens (e.g. the Birthday step closed an under-13 account). */
export type AuthNotice = "ineligible" | "password-saved" | null;

type AuthState = {
  loading: boolean;
  session: Session | null;
  /** Where the signed-in account is (server's onboarding step): "play" = the tabs; null while it's being asked. */
  step: AccountStep | null;
  refreshStep: () => Promise<AccountStep>;
  notice: AuthNotice;
  setNotice: (notice: AuthNotice) => void;
};
const AuthContext = createContext<AuthState>({ loading: true, session: null, step: null, refreshStep: async () => "error", notice: null, setNotice: () => {} });

async function askStep(): Promise<AccountStep> {
  const r = await apiJson<{ next?: unknown }>("/api/account/onboarding");
  return r.ok ? stepFromReply(r.body) : "error";
}

/**
 * Knows whether someone is signed in (reads the saved login on launch, then follows sign-in / sign-out) and, for a
 * signed-in account, its onboarding step (project_specs.md "Expo app Step 4"). The step is asked once per account (a
 * token refresh doesn't ask again); screens call refreshStep() after a save that moves it on.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<AccountStep | null>(null);
  const [notice, setNotice] = useState<AuthNotice>(null);
  const userRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => { setSession(data.session); setReady(true); })
      .catch(() => setReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (userRef.current === userId) return;
    userRef.current = userId;
    setStep(null);
    if (!userId) return;
    // Only the answer for the account still signed in counts (a quick sign-out / sign-in drops the old one).
    void askStep().then((s) => { if (userRef.current === userId) setStep(s); });
  }, [userId]);

  const refreshStep = useCallback(async () => {
    const s = await askStep();
    setStep(s);
    return s;
  }, []);

  const loading = !ready || (!!session && step === null);
  return <AuthContext.Provider value={{ loading, session, step, refreshStep, notice, setNotice }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
