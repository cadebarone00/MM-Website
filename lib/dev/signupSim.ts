/**
 * DEV ONLY — the Sign-up Simulator's fake server (project_specs.md "Sign-up Simulator", owner request 2026-11-21).
 * While the simulation runs, every request the REAL sign-up screens make to /api/auth/* and /api/account/* is answered
 * here instead of by the real server. Nothing is saved anywhere; the state lives only in the page.
 * The checks are the real ones (email, password, username, birthday rules); only the answers are made up. Pure, unit tested.
 */
import { ACCOUNT_EXISTS, signupInputFromBody } from "@/lib/auth/signup";
import { checkNewPassword } from "@/lib/auth/passwordPolicy";
import { usernameProblem } from "@/lib/profile/profileEdit";
import { checkBirthdate } from "@/lib/account/age";

/** The code the simulation accepts (shown on screen; no email is ever sent). */
export const SIM_CODE = "123456";
/** Same words as the real server (lib/auth/verifyCode.ts WRONG_CODE, which can't load in the browser). */
export const SIM_WRONG_CODE = "That code is wrong or has expired. Check your email, or send a new code.";

export const SIM_CASES = [
  { id: "new", label: "New person", hint: "The normal path, start to finish." },
  { id: "exists", label: "Email already has an account", hint: "Sign up shows the message and the Log in button." },
  { id: "under13", label: "Under 13", hint: "On Birthday, pick a date less than 13 years ago." },
  { id: "wrong-code", label: "Wrong code first", hint: "The first code you type is refused; then use 123456." },
] as const;
export type SimCase = (typeof SIM_CASES)[number]["id"];
export const isSimCase = (value: unknown): value is SimCase => SIM_CASES.some((c) => c.id === value);

export type SimState = {
  simCase: SimCase;
  email: string | null;
  codeTries: number;
  verified: boolean;
  passwordSet: boolean;
  displayName: string | null;
  username: string | null;
  /** null = not answered yet. */
  eligible: boolean | null;
  visibility: "public" | "private" | null;
  photo: boolean;
  finished: boolean;
};
export const newSimState = (simCase: SimCase): SimState => ({ simCase, email: null, codeTries: 0, verified: false, passwordSet: false,
  displayName: null, username: null, eligible: null, visibility: null, photo: false, finished: false });

export type SimReply = { status: number; json: Record<string, unknown>; state: SimState };
type Body = Record<string, unknown> | null;

/** Where the real server would send this account next (GET /api/account/onboarding, lib/account/onboardingApi.ts). */
function next(state: SimState): { state: string; next: string } {
  if (state.finished) return { state: "active", next: "play" };
  if (state.eligible === false) return { state: "ineligible", next: "ineligible" };
  if (!state.verified) return { state: "pending", next: "verification" };
  if (!state.passwordSet) return { state: "pending", next: "password" };
  if (!state.username) return { state: "pending", next: "name_username" };
  if (state.eligible === null) return { state: "pending", next: "birthday" };
  return { state: "pending", next: "settings" };
}

/** One fake request → its answer and the new state. Unknown paths get a 404 so a missing case shows up at once. */
export function simHandle(method: string, path: string, body: Body, state: SimState): SimReply {
  const reply = (status: number, json: Record<string, unknown>, changed: Partial<SimState> = {}): SimReply =>
    ({ status, json, state: { ...state, ...changed } });
  const route = `${method.toUpperCase()} ${path}`;
  switch (route) {
    case "POST /api/auth/signup": {
      const parsed = signupInputFromBody(body);
      if (!parsed.ok) return reply(400, { ok: false, error: parsed.error });
      if (state.simCase === "exists") return reply(409, { ok: false, code: "account_exists", error: ACCOUNT_EXISTS });
      return reply(200, { ok: true }, { email: parsed.input.email });
    }
    case "POST /api/auth/resend-verification":
      return reply(200, { ok: true });
    case "POST /api/auth/verify-code": {
      const tries = state.codeTries + 1;
      const firstRefused = state.simCase === "wrong-code" && tries === 1;
      const right = body?.code === SIM_CODE && !!state.email && String(body?.email ?? "").trim().toLowerCase() === state.email.toLowerCase();
      if (!right || firstRefused) return reply(400, { ok: false, code: "invalid_code", error: SIM_WRONG_CODE }, { codeTries: tries });
      return reply(200, { ok: true, next: "confirmed" }, { codeTries: tries, verified: true });
    }
    case "POST /api/auth/create-password": {
      if (!state.verified) return reply(401, { ok: false, code: "signed_out", error: "Log in again to keep going." });
      if (state.passwordSet) return reply(409, { ok: false, code: "already_set", error: "Your password is already set." });
      const rules = checkNewPassword(body?.password);
      if (!rules.ok) return reply(400, { ok: false, code: "invalid_password", error: rules.error });
      return reply(200, { ok: true }, { passwordSet: true });
    }
    case "GET /api/account/onboarding": {
      if (!state.verified) return reply(401, { ok: false, code: "signed_out", next: "welcome" });
      const where = next(state);
      return reply(200, { ok: true, state: where.state, next: where.next, activationAvailable: true });
    }
    case "GET /api/account/terms":
      return reply(200, { ok: true, terms: "simulation", privacy: "simulation" });
    case "POST /api/account/terms":
      return reply(200, { ok: true });
    case "POST /api/account/profile": {
      const name = typeof body?.displayName === "string" ? body.displayName.trim() : "";
      const username = typeof body?.username === "string" ? body.username : "";
      if (!name) return reply(400, { ok: false, error: "Add your name." });
      const problem = usernameProblem(username);
      if (problem) return reply(400, { ok: false, error: problem });
      return reply(200, { ok: true }, { displayName: name, username });
    }
    case "POST /api/account/birthday": {
      const check = checkBirthdate(body?.birthdate);
      if (!check.ok) return reply(400, { ok: false, error: check.error === "future" ? "That date is in the future." : "Pick a real birthday." });
      return check.eligible
        ? reply(200, { ok: true, eligible: true, next: "photo" }, { eligible: true })
        : reply(200, { ok: true, eligible: false, next: "ineligible", signedOut: true }, { eligible: false });
    }
    case "POST /api/account/photo":
      return reply(200, { ok: true }, { photo: true });
    case "PUT /api/account/privacy": {
      const visibility = body?.visibility;
      if (visibility !== "public" && visibility !== "private") return reply(400, { ok: false, error: "Choose Public or Private." });
      return reply(200, { ok: true }, { visibility });
    }
    case "POST /api/account/finish": {
      const missing = [!state.username && "username", state.eligible !== true && "birthday", !state.visibility && "privacy_setting"].filter(Boolean);
      if (missing.length) return reply(400, { ok: false, code: "incomplete", missing });
      return reply(200, { ok: true, activated: true }, { finished: true });
    }
    case "POST /api/account/activation-seen":
      return reply(200, { ok: true });
    default:
      return reply(404, { ok: false, error: `Not part of the simulation: ${route}` });
  }
}
