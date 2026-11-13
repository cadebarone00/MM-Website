"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CodeScreen } from "@/components/onboarding/CodeScreen";
import { ForgotScreen, PasswordScreen } from "@/components/onboarding/PasswordScreens";
import { LogInScreen, SignUpScreen } from "@/components/onboarding/StartScreens";
import { BirthdayScreen, NameScreen, PhotoScreen, SettingsScreen } from "@/components/onboarding/OnboardingScreens";
import { ProfileCreatedScreen } from "@/components/onboarding/ProfileCreatedScreen";
import { AuthLinkResultPreview } from "@/components/dev/auth/AuthLinkResultPreview";
import { AccountStatusView } from "@/components/auth/AccountStatusView";
import { ONBOARDING, ONBOARDING_SCREENS, PLAY, START, START_SCREENS, STATUS, onboardingRedirect, stepPath, type OnboardingScreen, type StartScreen } from "@/lib/account/onboardingRoutes";
import type { OnboardingStep } from "@/lib/account/onboardingApi";
import type { AccountLifecycle } from "@/lib/profile/currentProfile";
import { APP_FINISHED_KEY, send } from "@/lib/account/onboardingClient";
import { oauthErrorMessage } from "@/lib/auth/oauth";
import { authReturnPath } from "@/lib/auth/returnTo";
import { providerNameParts } from "@/lib/account/providerName";
import { appSupabase } from "@/lib/app/appAuth";
import styles from "./App.module.css";

/**
 * Cade's real sign-up / log-in / onboarding screens in the iPhone / Android app (Pending accounts Phase 6). The website
 * decides on the server which screen an account may see (app/start/[screen], app/onboarding/[screen]); the app's
 * screens are packaged, so the same decisions are made here from the same server answers
 * (GET /api/account/onboarding) and the same rules (lib/account/onboardingRoutes.ts). Google / Apple aren't offered in
 * the app yet (they need the native sign-in sheets); the server still enforces every sign-up and age rule.
 */

const Waiting = () => <p className={styles.status} aria-busy="true">Loading…</p>;
/** The app's own login (a session on the phone), or null. */
const appSession = async () => (await appSupabase().auth.getSession()).data.session;

/** The signed-out screens (Sign up, Create a password, Email Verification, Log in, Forgot password…). */
export function AppStartScreen({ screen }: { screen: string }) {
  const router = useRouter();
  const query = useSearchParams();
  const [needsSession, setNeedsSession] = useState<"checking" | "ok" | "missing">(screen === "confirmed" || screen === "reset-password" ? "checking" : "ok");
  useEffect(() => {
    if (screen === "birthday") router.replace(`${START.signUp}/`); // birthday comes after the account is made
    if (needsSession === "checking") void appSession().then((s) => setNeedsSession(s ? "ok" : "missing"));
  }, [screen, needsSession, router]);
  useEffect(() => {
    if (needsSession !== "missing") return;
    router.replace(screen === "confirmed" ? `${START.logIn}/?error=invalid_link` : `${START.forgot}/`);
  }, [needsSession, screen, router]);
  if (!START_SCREENS.includes(screen as StartScreen) || needsSession !== "ok") return <Waiting />;
  const returnTo = authReturnPath(query.get("next") ?? undefined);
  switch (screen as StartScreen) {
    case "birthday": return <Waiting />;
    case "sign-up": return <SignUpScreen providers={[]} />;
    case "password": return <PasswordScreen kind="create" />;
    case "verify": return <CodeScreen kind="signup" />;
    case "confirmed": return <AuthLinkResultPreview nextHref={ONBOARDING.resume} />;
    case "log-in": {
      const error = query.get("error");
      const notice = query.get("reset") === "1" ? "Password saved. Log in with your new password."
        : error === "invalid_link" ? "That link didn't work or has expired. Log in, or ask for a new code."
        : oauthErrorMessage(error ?? undefined);
      return <LogInScreen notice={notice} providers={[]} returnTo={returnTo} />;
    }
    case "forgot": return <ForgotScreen />;
    case "reset-code": return <CodeScreen kind="recovery" />;
    case "reset-password": return <PasswordScreen kind="reset" returnTo={returnTo} />;
  }
}

type Resume = { state: AccountLifecycle["state"] | null; next: OnboardingStep | null; signedOut: boolean };
/** Where the server says this account is (GET /api/account/onboarding). */
async function resume(): Promise<Resume> {
  const sent = await send("/api/account/onboarding", undefined, "GET");
  if (sent.status === 401) return { state: "signed-out", next: null, signedOut: true };
  return { state: (sent.json.state as AccountLifecycle["state"]) ?? null, next: (sent.json.next as OnboardingStep) ?? null, signedOut: false };
}

/** "Carry on": the account's first unfinished step. */
export function AppOnboardingResume() {
  const router = useRouter();
  useEffect(() => {
    void resume().then((r) => router.replace(`${r.signedOut ? START.logIn : r.next ? stepPath(r.next) : STATUS}/`.replace(/^\/\/$/, "/")));
  }, [router]);
  return <Waiting />;
}

/** A signed-in onboarding step: only the one the server's step allows (no skipping ahead, no going back). */
export function AppOnboardingScreen({ screen }: { screen: string }) {
  const router = useRouter();
  const [shown, setShown] = useState<ReactNode>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await resume();
      const go = (path: string) => alive && router.replace(path === PLAY ? "/" : `${path}/`);
      if (r.signedOut) return go(START.logIn);
      if (!r.next) return go(STATUS);
      const elsewhere = onboardingRedirect(screen as OnboardingScreen, r.next);
      if (elsewhere) return go(elsewhere);
      switch (screen as OnboardingScreen) {
        case "name": {
          const user = (await appSupabase().auth.getUser()).data.user;
          const suggested = providerNameParts(user?.user_metadata ?? null);
          return alive && setShown(<NameScreen initialFirst={suggested.first} initialLast={suggested.last} />);
        }
        case "birthday": return alive && setShown(<BirthdayScreen />);
        case "photo": return alive && setShown(<PhotoScreen />);
        case "settings": return alive && setShown(<SettingsScreen needsTerms={r.next === "terms"} />);
        case "created": {
          // Once, straight after this phone's own Finish (the website uses a one-time cookie marker); otherwise Play.
          let finished = false;
          try { finished = sessionStorage.getItem(APP_FINISHED_KEY) === "1"; sessionStorage.removeItem(APP_FINISHED_KEY); } catch { /* storage off: Play */ }
          return finished ? alive && setShown(<ProfileCreatedScreen />) : go(PLAY);
        }
      }
    })();
    return () => { alive = false; };
  }, [screen, router]);
  if (!ONBOARDING_SCREENS.includes(screen as OnboardingScreen)) return <Waiting />;
  return shown ?? <Waiting />;
}

/** Your account: a blocked or unfinished account's message (unfinished ones go straight to their next step). */
export function AppAccountStatus() {
  const router = useRouter();
  const ineligibleNotice = useSearchParams().get("reason") === "ineligible";
  const [state, setState] = useState<AccountLifecycle["state"] | null | "checking">("checking");
  useEffect(() => {
    void resume().then((r) => {
      if (r.next && (r.state === "pending" || r.state === "active_needs_birthday")) router.replace(`${stepPath(r.next)}/`);
      else setState(r.state);
    });
  }, [router]);
  if (state === "checking") return <Waiting />;
  return <AccountStatusView state={state ?? "unavailable"} ineligibleNotice={ineligibleNotice} v2 />;
}
