/**
 * Pending accounts Phase 5 — WHO may use WHICH page / API, by account lifecycle state (project_specs.md "Pending
 * accounts, onboarding activation & 13+ eligibility" §3). One table for the whole app, used by middleware.ts when
 * account enforcement is switched on (MAROON_ACCOUNT_ENFORCEMENT=on; OFF by default, so nothing changes until approved).
 * Pure: no network, unit tested, and a coverage test fails if any page or API file isn't matched by an explicit rule.
 *
 * Categories:
 *   public   — anyone, no account check (marketing, auth flows, public read-only data, retired V1 redirect pages).
 *   account  — any signed-in state, never blocked here (onboarding, settings, deletion, correction, recovery).
 *   invite   — invitation links: Pending may view / hold; Ineligible, restricted and closed accounts may not.
 *   active   — golf and social features: Active only.
 *   internal — server-to-server (cron secret); no user session involved.
 * SIGNED-OUT requests always pass through to the route's own handling (its existing login redirect / 401): the gate
 * only ever narrows what a signed-in, non-Active account can do.
 */

export type AccessCategory = "public" | "account" | "invite" | "active" | "internal";
export type LifecycleWord = "signed-out" | "pending" | "active" | "active_needs_birthday" | "ineligible" | "review" | "closed" | "unavailable";
export type AccessRule = { pattern: RegExp; category: AccessCategory; methods?: readonly string[]; why: string };

const READS = ["GET", "HEAD"] as const;

// API rules, first match wins. `methods` limits a rule to those HTTP methods.
export const API_RULES: readonly AccessRule[] = [
  { pattern: /^\/api\/internal\//, category: "internal", why: "cron jobs (CRON_SECRET), no user" },
  { pattern: /^\/api\/auth\//, category: "public", why: "sign-up / log-in / recovery flows" },
  { pattern: /^\/api\/account\/(birthday|birthday-correction|delete|finish|initialize|me|onboarding|password|photo|privacy|profile|sessions|terms)$/, category: "account",
    why: "onboarding steps, recovery, correction and deletion must work for Pending / Ineligible accounts" },
  { pattern: /^\/api\/golf-trips\/invitations\/[^/]+(\/decline)?$/, category: "invite", why: "view / hold (Pending) / accept (Active) / decline a trip invitation" },
  { pattern: /^\/api\/(platform\/tournament-invitations|code-tournaments\/invite)\/[^/]+$/, category: "invite", methods: READS, why: "view a tournament invitation" },
  { pattern: /^\/api\/platform\/tournament-invitations\/[^/]+\/decline$/, category: "invite", why: "decline a tournament invitation" },
  { pattern: /^\/api\/code-tournaments\/public(\/[^/]+)?$/, category: "public", why: "public tournament search / spectator view" },
  { pattern: /^\/api\/watch\/[^/]+$/, category: "public", why: "watch code, read-only, no sign-in" },
  { pattern: /^\/api\/courses\/(search|near)$/, category: "public", why: "course search (read-only)" },
  { pattern: /^\/api\/courses\/library\/[^/]+\/gps$/, category: "public", why: "course GPS data (read-only)" },
  { pattern: /^\/api\/courses\/[^/]+$/, category: "public", methods: READS, why: "course details (read-only)" },
  { pattern: /^\/api\/rounds\/course\/[^/]+$/, category: "public", methods: READS, why: "course scorecard (read-only)" },
  { pattern: /^\/api\/places\/(autocomplete|details)$/, category: "public", why: "place lookup (no account data)" },
  { pattern: /^\/api\/(broadcast|live|live-feed|players|player-archive-stats|confirmed-roster|countdown|home-team-rosters|instagram-reels|season-catalog|season-feed|upcoming-round-schedule)(\/|$)/,
    category: "public", why: "V1 public read-only data (no account)" },
  { pattern: /^\/api\/wagers\/(hole-in-one|low-individual|player-birdies|player-doubles|team-winner|total-birdies|published-types|mm-coins\/settled-markets|player-tournament-birdies\/[^/]+)$/,
    category: "public", methods: READS, why: "V1 public odds / market reads" },
  { pattern: /^\/api\/(account\/search|code-tournaments|courses\/[^/]+\/gps|fantasy|golf-trips|platform|portal|profile|rounds|tap-in|wagers)(\/|$)/,
    category: "active", why: "golf / social / organizer / admin features" },
];

// Page rules, first match wins (paths without query strings).
export const PAGE_RULES: readonly AccessRule[] = [
  { pattern: /^\/account\/status$/, category: "account", why: "where blocked accounts are sent (must never loop)" },
  { pattern: /^\/(login|login\/email|signup|new-user|forgot-password|reset-password)$/, category: "public", why: "sign-in / sign-up / recovery" },
  { pattern: /^\/auth\//, category: "public", why: "email-link and provider callbacks" },
  { pattern: /^\/start(\/[a-z-]+)?$/, category: "public", why: "Phase 6 sign-up / log-in / password-reset screens (MAROON_V2_ONBOARDING)" },
  { pattern: /^\/onboarding(\/[a-z-]+)?$/, category: "account", why: "Phase 6 onboarding steps: Pending accounts must reach them (each page checks the step itself)" },
  { pattern: /^\/(settings|settings\/delete-account|account\/choose)$/, category: "account", why: "settings, deletion and correction stay reachable" },
  { pattern: /^\/(golf-trips\/invite|tournaments\/invite|tournaments\/code\/invite)\/[^/]+$/, category: "invite", why: "invitation landing pages" },
  { pattern: /^\/tournaments\/live\/[^/]+$/, category: "public", why: "public tournament view" },
  { pattern: /^\/watch\/[^/]+$/, category: "public", why: "watch code, no sign-in" },
  { pattern: /^\/t\//, category: "public", why: "public tournament websites" },
  { pattern: /^\/(website|contact|merchandise|sponsorship|the-maroon(\/.*)?|schedule(\/.*)?|videos(\/.*)?)$/, category: "public", why: "marketing / public info" },
  { pattern: /^\/(portal|wagers|fantasy|my-team|vault|history|leaderboard|players|teams|watch-live|broadcast)(\/.*)?$/, category: "public",
    why: "retired V1 pages: they only redirect to pages that are themselves gated" },
  { pattern: /^\/$/, category: "active", why: "Play (home)" },
  { pattern: /^\/(play|golf-trips|tournaments|rounds|profile|pickems|tap-in|dashboard|admin)(\/.*)?$/, category: "active", why: "golf / social / organizer / admin" },
];

export type Classified = { category: AccessCategory; rule: AccessRule | null };

/** The category for a request. Unmatched paths are "active" (fail closed); the coverage test keeps that from mattering. */
export function classifyPath(pathname: string, method = "GET"): Classified {
  const rules = pathname.startsWith("/api/") ? API_RULES : PAGE_RULES;
  const m = method.toUpperCase();
  const rule = rules.find((r) => r.pattern.test(pathname) && (!r.methods || r.methods.includes(m))) ?? null;
  return { category: rule?.category ?? "active", rule };
}

export const STATUS_PAGE = "/account/status";

export type AccessDecision =
  | { type: "allow" }
  | { type: "redirect"; location: string }
  | { type: "deny"; status: number; body: { ok: false; code: string; error: string; next: string | null } };

const allowedIn: Record<"invite" | "active", readonly LifecycleWord[]> = {
  invite: ["pending", "active", "active_needs_birthday"],
  active: ["active"],
};

/** What to do with a request in `category` from an account in `state`. Signed-out always passes through. */
export function accessDecision(category: AccessCategory, state: LifecycleWord, isApi: boolean): AccessDecision {
  if (category === "public" || category === "account" || category === "internal" || state === "signed-out") return { type: "allow" };
  if (allowedIn[category].includes(state)) return { type: "allow" };
  if (!isApi) return { type: "redirect", location: STATUS_PAGE };
  const deny = (status: number, code: string, error: string, next: string | null): AccessDecision => ({ type: "deny", status, body: { ok: false, code, error, next } });
  switch (state) {
    case "pending": return deny(403, "finish_onboarding", "Finish setting up your account first.", "onboarding");
    case "active_needs_birthday": return deny(403, "finish_onboarding", "Add your birthday to continue.", "birthday");
    case "ineligible": return deny(403, "not_eligible", "This account can't use The Maroon.", "ineligible");
    case "review": return deny(403, "restricted", "This account is being reviewed. Contact support.", "restricted");
    case "closed": return deny(401, "account_closed", "This account is closed.", null);
    default: return deny(503, "unavailable", "We couldn't check your account. Try again.", null);
  }
}

export const ENFORCEMENT_FLAG = "MAROON_ACCOUNT_ENFORCEMENT";
/** OFF unless the server environment says exactly "on". */
export const enforcementEnabled = (env: Record<string, string | undefined> = process.env) => env[ENFORCEMENT_FLAG] === "on";
