"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CodeScreen } from "@/components/onboarding/CodeScreen";
import { PasswordScreen } from "@/components/onboarding/PasswordScreens";
import { SignUpScreen } from "@/components/onboarding/StartScreens";
import { BirthdayScreen, NameScreen, PhotoScreen, SettingsScreen } from "@/components/onboarding/OnboardingScreens";
import { AuthLinkResultPreview } from "@/components/dev/auth/AuthLinkResultPreview";
import { AccountStatusView } from "@/components/auth/AccountStatusView";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { rememberEmail } from "@/lib/account/onboardingClient";
import { ONBOARDING, START, STATUS, stepPath } from "@/lib/account/onboardingRoutes";
import type { OnboardingStep } from "@/lib/account/onboardingApi";
import { SIM_CASES, SIM_CODE, isSimCase, newSimState, simHandle, type SimCase, type SimState } from "@/lib/dev/signupSim";
import styles from "./SignUpSimulation.module.css";

/**
 * DEV ONLY — Sign-up Simulator (project_specs.md "Sign-up Simulator", owner request 2026-11-21). Runs the REAL sign-up
 * screens in the real order with fake everything: their requests to /api/auth/* and /api/account/* are answered by
 * lib/dev/signupSim.ts, and their page changes stay inside this page (a stand-in router + caught link taps). Nothing is
 * saved; Run again starts clean. The last step shows End of simulation instead of opening the app.
 */
export function SignUpSimulation() {
  const fromSimulator = useSimulator()?.state.signUpSimCase;
  const preset = isSimCase(fromSimulator) ? fromSimulator : null;
  // A case picked from the simulator's Conditionals starts straight away (and restarts when the Conditional changes).
  const [picked, setPicked] = useState<{ simCase: SimCase; run: number } | null>(null);
  const run = picked ?? (preset ? { simCase: preset, run: 0 } : null);
  if (!run) return <Picker initial={preset ?? "new"} onStart={(simCase) => setPicked({ simCase, run: 1 })} />;
  return <Run key={`${run.simCase}-${run.run}`} simCase={run.simCase}
    onRunAgain={() => setPicked({ simCase: run.simCase, run: run.run + 1 })} onChangeCase={() => setPicked(null)} />;
}

function Picker({ initial, onStart }: { initial: SimCase; onStart: (simCase: SimCase) => void }) {
  const [simCase, setSimCase] = useState<SimCase>(initial);
  return <main className={styles.page}>
    <p className={styles.kicker}>Simulation</p>
    <h1 className={styles.title}>Sign-up simulation</h1>
    <p className={styles.lead}>The real sign-up screens with a made-up email, password and code. Nothing is saved and no email is sent.</p>
    <fieldset className={styles.cases}>
      <legend className={styles.legend}>Practice case</legend>
      {SIM_CASES.map((c) => <label key={c.id} className={`${styles.case} ${simCase === c.id ? styles.caseOn : ""}`}>
        <input type="radio" name="case" value={c.id} checked={simCase === c.id} onChange={() => setSimCase(c.id)} />
        <span><strong>{c.label}</strong><small>{c.hint}</small></span>
      </label>)}
    </fieldset>
    <button type="button" className={styles.primary} onClick={() => onStart(simCase)}>Start sign-up simulation</button>
  </main>;
}

const randomEmail = () => `sim-${Math.floor(1000 + Math.random() * 9000)}@example.test`;
const pathOf = (href: string) => new URL(href, "http://sim.local").pathname.replace(/\/+$/, "") || "/";

/** The run on screen right now; the fetch switch below answers through it. Null = no run (every request is real). */
let activeRun: ((method: string, path: string, body: Record<string, unknown> | null) => Response) | null = null;
let fetchSwitchInstalled = false;
/** Installed once: /api/auth/* and /api/account/* go to the active run's fake server; everything else (and everything
 *  when no run is on screen) goes to the real fetch untouched. */
function installFetchSwitch() {
  if (fetchSwitchInstalled) return;
  fetchSwitchInstalled = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (!activeRun || url.origin !== window.location.origin || !/^\/api\/(auth|account)\//.test(url.pathname)) return real(input, init);
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === "string") { try { body = JSON.parse(init.body) as Record<string, unknown>; } catch { body = null; } }
    return activeRun(init?.method ?? "GET", url.pathname, body);
  };
}

function Run({ simCase, onRunAgain, onChangeCase }: { simCase: SimCase; onRunAgain: () => void; onChangeCase: () => void }) {
  const [snapshot, setSnapshot] = useState<SimState>(() => newSimState(simCase));
  const state = useRef<SimState>(snapshot);
  const [path, setPath] = useState<string>(START.signUp);

  const go = useCallback((href: string) => {
    const target = pathOf(href);
    if (target !== ONBOARDING.resume) { setPath(target); return; }
    // "Carry on": the step the (fake) server says comes next, exactly like the real resume page.
    const answer = simHandle("GET", "/api/account/onboarding", null, state.current);
    const step = answer.json.next as OnboardingStep | undefined;
    setPath(answer.status === 401 ? START.logIn : step ? stepPath(step) : STATUS);
  }, []);

  // The screens' server requests → this run's fake server, only while it's on screen (the first screens make no request
  // while appearing, so switching on here is in time).
  useLayoutEffect(() => {
    installFetchSwitch();
    rememberEmail("");
    activeRun = (method, apiPath, body) => {
      const answer = simHandle(method, apiPath, body, state.current);
      state.current = answer.state;
      setSnapshot(answer.state);
      if (answer.status === 404) console.warn("[signup-sim]", answer.json.error);
      return new Response(JSON.stringify(answer.json), { status: answer.status, headers: { "Content-Type": "application/json" } });
    };
    return () => { activeRun = null; rememberEmail(""); };
  }, []);

  // A stand-in router so the screens' router.push / replace move between simulated pages, never the real site.
  const router = useMemo<AppRouterInstance>(() => ({
    back: () => undefined, forward: () => undefined, refresh: () => undefined, prefetch: () => undefined, bfcacheId: "signup-sim",
    push: (href) => go(href), replace: (href) => go(href),
  }), [go]);
  // Plain links (e.g. Email confirmed → Continue) are caught here instead of leaving the page.
  const catchLinks = (event: MouseEvent) => {
    const link = (event.target as HTMLElement).closest("a[href]");
    const href = link?.getAttribute("href");
    if (!href || !href.startsWith("/") || link?.hasAttribute("data-sim-exit")) return;
    event.preventDefault();
    go(href);
  };

  const end = (title: string, note: string) => <EndOfSimulation title={title} note={note} state={snapshot} onRunAgain={onRunAgain} onChangeCase={onChangeCase} />;
  let screen: ReactNode;
  switch (path) {
    case START.signUp: screen = <SignUpScreen providers={[]} />; break;
    case START.verify: screen = <CodeScreen kind="signup" />; break;
    case START.confirmed: screen = <AuthLinkResultPreview nextHref={ONBOARDING.resume} />; break;
    case START.password: screen = <PasswordScreen kind="create" />; break;
    case ONBOARDING.name: screen = <NameScreen />; break;
    case ONBOARDING.birthday: screen = <BirthdayScreen />; break;
    case ONBOARDING.photo: screen = <PhotoScreen />; break;
    case ONBOARDING.settings: screen = <SettingsScreen needsTerms />; break;
    case ONBOARDING.created: case "/": screen = end("End of simulation", "Sign-up finished. In the real app, Profile Created opens next."); break;
    case START.logIn: screen = end("End of simulation", "Sent to Log in with the email filled in. In the real app, the person logs in here."); break;
    case STATUS: screen = <>
      <AccountStatusView state="ineligible" ineligibleNotice v2 />
      {end("End of simulation", "Under 13: the account can't be finished. In the real app, it is closed and cleaned up.")}
    </>; break;
    default: screen = end("End of simulation", `The simulation doesn't cover ${path} yet.`);
  }

  const caseLabel = SIM_CASES.find((c) => c.id === simCase)?.label;
  return <AppRouterContext.Provider value={router}>
    <div className={styles.bar} role="status">
      <span className={styles.badge}>Simulation</span>
      <span className={styles.barText}>
        {caseLabel}
        {path === START.signUp && <> · <button type="button" className={styles.barLink} onClick={() => fillEmail(simCase === "exists" ? "taken@example.test" : randomEmail())}>Random email</button></>}
        {path === START.verify && <> · code <strong>{SIM_CODE}</strong></>}
      </span>
      <button type="button" className={styles.barLink} onClick={onRunAgain}>Restart</button>
    </div>
    <div onClickCapture={catchLinks}>{screen}</div>
  </AppRouterContext.Provider>;
}

/** Types an email into Sign up's box the way a person would (so the screen's own state sees it). */
function fillEmail(email: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="email"]');
  if (!input) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, email);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}

function EndOfSimulation({ title, note, state, onRunAgain, onChangeCase }: {
  title: string; note: string; state: SimState; onRunAgain: () => void; onChangeCase: () => void;
}) {
  const rows: [string, string][] = [
    ["Email", state.email ?? "—"],
    ["Code", state.verified ? `accepted (${state.codeTries} ${state.codeTries === 1 ? "try" : "tries"})` : "not entered"],
    ["Password", state.passwordSet ? "set" : "not set"],
    ["Name", state.displayName ?? "—"],
    ["Username", state.username ? `@${state.username}` : "—"],
    ["Birthday", state.eligible === null ? "—" : state.eligible ? "13 or older" : "under 13"],
    ["Photo", state.photo ? "added" : "skipped"],
    ["Profile", state.visibility ?? "—"],
  ];
  return <main className={styles.page}>
    <p className={styles.kicker}>Simulation</p>
    <h1 className={styles.title}>{title}</h1>
    <p className={styles.lead}>{note} Nothing was saved.</p>
    <dl className={styles.summary}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <button type="button" className={styles.primary} onClick={onRunAgain}>Run again</button>
    <button type="button" className={styles.secondary} onClick={onChangeCase}>Pick another case</button>
    {/* A real link out of the simulation (the link catcher lets data-sim-exit through). */}
    <a className={styles.exit} href="/dev" data-sim-exit>Exit</a>
  </main>;
}
