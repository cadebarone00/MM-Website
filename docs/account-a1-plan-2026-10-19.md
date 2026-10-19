# Phase A1 — Email verification & first-time onboarding: inspection and plan (2026-10-19)

Plan only. Nothing in A1 is built yet. The A4 commit (`b539427d`) is the last code change.

## 1. What happens today (inspected)
| Step | Today | Problem |
|---|---|---|
| After "Create account" | `SignUpForm` shows "Check your email… then sign in" | no resend, no "wrong email?", no "open it on any device" |
| The email link | `signUp` sets **no `emailRedirectTo`**, so Supabase verifies and then redirects to the **Site URL (home page)** with an unused `?code=` | the person is verified but **not signed in**; nothing uses the code |
| Cross-device | the server signup uses PKCE: the code needs a verifier cookie that only exists in **the browser that signed up** | opening the email on a phone can never sign in through `?code` |
| `/auth/callback` | exchanges a `code`, then **always** goes to `/reset-password` (built for recovery / invite links) | it can't serve verification without breaking reset |
| Expired / used link | Supabase redirects with `error=…` in the URL; nothing reads it | the person sees the home page with no explanation |
| Return after an invite | `lib/auth/returnTo.ts` allows only exact Golf Trip / tournament invite paths; the signup page carries `next` to the "sign in" link | ✅ safe, but only works if they sign in in the same browser |
| Profile after verification | the login route initializes the profile (V2); `/profile` shows Finish setup; after setup there's **no "continue to where you were"** | invites are lost after setup |
| Resend verification | `/api/auth/resend-verification` always answers ok | ✅ no enumeration; but nothing on the signup screen calls it |

## 2. Design

### `/auth/confirm` (new, server route), one entry for every email link
- **Preferred input: `token_hash` + `type`.** It's verified with `supabase.auth.verifyOtp({ token_hash, type })`. It works
  **on any device** (no PKCE verifier needed), and the token is **single-use**: Supabase refuses it the second time.
  This needs the email templates to link to `/auth/confirm?token_hash=…&type=…` (Supabase dashboard, you set it;
  locally the isolated stack gets the same template).
- **Fallback: `code`** (PKCE, same browser), for links already sent with the old format.
- **By type:**
  - `signup` / `email` → session + profile initialization → destination;
  - `recovery` / `invite` → the existing `/reset-password` page (unchanged rules from A2);
  - `email_change` → refused until A3.
- **Session fixation / signing into someone else's account:**
  - If a **different** account is already signed in on this browser, the link verifies the email but does **not**
    switch sessions. The page says "this email is verified; sign out to continue as that account".
  - If **nobody** is signed in, a **brand-new** session is created (new tokens, cookies overwritten).
  - The welcome screen always shows the signed-in email (masked), so a person tricked into someone else's verification
    link sees it isn't their account.
- **No replay or leaks:**
  - after success, a **303 redirect to a clean URL** (no token left in history or the address bar);
  - `Referrer-Policy: no-referrer` and `Cache-Control: no-store` on the route;
  - the token is never logged.
- **Expired / used / invalid** → `/auth/confirm/result?state=expired|used|invalid` with plain words and recovery:
  "send a new link" (email field, same generic answer whether or not the email exists, Supabase's 60 s resend limit),
  or "sign in" (if already verified).

### Destinations (a pure `postAuthDestination()` with unit tests)
| Situation | Goes to |
|---|---|
| Came from a **Golf Trip invite** | the invite page (an unfinished profile may accept trip invites; accepting creates the profile if needed) |
| Came from a **tournament invite**, profile unfinished | Finish setup, then back to the invite |
| Profile **missing / unfinished** | `/profile` (Finish setup), then the original destination |
| Profile **complete** | the original destination if allowed, otherwise `/profile` |

- `next` is accepted only from the existing exact allow-list (invite paths) plus a short fixed list of app pages.
  Everything else (absolute URLs, `//host`, backslashes, encoded slashes, `javascript:`) falls back to `/profile`.
- `emailRedirectTo` is built from a **configured site URL** (new server env `SITE_URL`), never from the request's
  `Host` header. In development it falls back to the request origin.

### Screens
- **Check your email** (after signup):
  - the masked address, "open the link on any device";
  - "Didn't get it? Send again" (cooldown);
  - "Wrong email? Start over";
  - spam-folder hint.

  No difference between new and existing emails.
- **Verify result:** expired / already used / invalid, each with its recovery action.
- **Finish setup** (existing form): after saving, it continues to the allowed `next`.
- Interrupted onboarding (closed the tab after verifying): the next sign-in initializes the profile and lands on
  Finish setup (already true), now with `next` kept.

### iOS and Sign in with Apple
- Universal Links will open `https://<site>/auth/confirm?token_hash=…` in the app. The app calls `verifyOtp` itself:
  `token_hash` needs no browser cookie, so the same link format serves web and iOS.
- Sign in with Apple will use the native Apple sheet → `signInWithIdToken` (no redirect), or the PKCE `code` route
  (`/auth/callback`, kept). Either way it ends in the same `initialize` → `postAuthDestination` step.
- All A1 server logic lives in shared functions, so a later JSON variant for the app (A6) reuses it.

### Preserved
- No database change in A1.
- V1 accounts, legacy player links and history are untouched.
- Links already sent (old format, `/auth/callback?…` for recovery / invites) keep working.

## 3. Files (planned)
- **New:**
  - `app/auth/confirm/route.ts`, `app/auth/confirm/result/page.tsx`;
  - `lib/auth/postAuthDestination.ts` + test;
  - `lib/auth/emailConfirm.ts`;
  - `scripts/auth-local/templates/*.html` (the local email templates);
  - `scripts/auth-local/verification-regression.mts`.
- **Changed:**
  - `app/api/auth/signup/route.ts` (`emailRedirectTo`, `next`);
  - `components/auth/SignUpForm.tsx` (Check-your-email screen with resend);
  - `components/profile/ProfileForm.tsx` and `app/profile/page.tsx` (continue to `next` after setup);
  - `lib/auth/returnTo.ts` (shared allow-list);
  - `scripts/auth-local/config.toml` (templates, Site URL, redirect list).
- **Not touched:** reset / invite rules (A2), sessions (A4), deletion, claims, Cam's / Highlights / notifications files.

## 4. Tests (isolated Supabase + its Mailpit inbox)
- **Route-level end to end:**
  - signup → real email → link → signed in → Finish setup → profile;
  - a complete profile goes to its destination;
  - a Golf Trip invite goes straight to the invite; a tournament invite goes setup → invite;
  - **cross-device** (a fresh browser with no verifier cookie) works;
  - **replay**: the second click is refused with no session;
  - **expired** (local short expiry) → expired page → "send again" → a new link works;
  - **open redirect** attempts all land on `/profile`;
  - **another account already signed in** → no switch;
  - signup / resend answers are identical for new and existing emails;
  - old-format links still work;
  - V1 rows unchanged.
- **Real browser:** the whole flow clicked through in Chrome against a dev server that uses the isolated stack.
  **Constraint:** Next.js allows one dev server per project folder, and your other terminal's dev server (port 3001,
  production settings) usually holds it. Plan: run the browser test from a separate **git worktree** of this
  repository (its own folder and dev server, sharing `node_modules`), pointed only at the local stack. Nothing in the
  shared working tree is stashed or switched.

## 5. Deployment gate: stopping account code reaching production before its SQL (recommendation, not applied)
**Today:**
- `vercel.json` has only crons.
- There's no CI and no `ignoreCommand`.
- The last deployment is 2026-10-08 (Git-triggered from `main`). Nothing has deployed since, even though
  `origin/main` now contains Step 3d. Git deployments appear paused or disconnected, which is protection **by
  accident**, not by design.

| Option | How it works | Strength |
|---|---|---|
| **A. Schema gate at build (recommended)** | `scripts/check-production-schema.mjs` runs before `next build` only when `VERCEL_ENV=production`. With the server key already in Vercel's env, it asks Supabase whether each required function exists (`initialize_my_profile`, `complete_my_profile`, `account_deletion_state`, `session_is_revoked`, …, listed in `supabase/required-for-deploy.json`). If any is missing, the **build fails**, and Vercel keeps serving the previous deployment | real verification, automatic, no secrets printed |
| **B. Manual switch** | `vercel.json` `"ignoreCommand"` skips every production build unless the Vercel env var `ALLOW_PRODUCTION_DEPLOY` equals the version in the repo; you change it by hand after running the SQL | simple, explicit, but trust-based |
| **C. Manual promotion** | Vercel → Settings → Domains / Git: turn off auto-assigning the production domain, so a deployment builds to a preview URL and you promote it after checking | protects even if A or B is misconfigured |

**Recommendation:** A + C. Both need your approval before I touch `vercel.json`, `package.json` or Vercel settings.
Also confirm in **Vercel → Project → Settings → Git** whether Git deployments are intentionally off.

## 6. Decisions for you
1. Approve the `token_hash` email-link format (you'll paste the templates into the Supabase dashboard later).
2. Which app pages may be a post-signup destination besides invites (proposal: `/profile`, `/play`, `/golf-trips`)?
3. The separate git worktree for real-browser tests.
4. Deployment gate: A + C (or B).
