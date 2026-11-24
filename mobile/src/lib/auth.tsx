import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase.ts";

type AuthState = { loading: boolean; session: Session | null };
const AuthContext = createContext<AuthState>({ loading: true, session: null });

/** Knows whether someone is signed in: reads the saved login on launch, then follows sign-in / sign-out. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, session: null });
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setState({ loading: false, session: data.session }))
      .catch(() => setState({ loading: false, session: null }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ loading: false, session }));
    return () => data.subscription.unsubscribe();
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
