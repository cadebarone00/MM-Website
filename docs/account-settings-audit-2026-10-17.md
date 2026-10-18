# Account Settings & Management — read-only audit and plan (2026-10-17)

No code changed for this audit. Account deletion (Step 3) and historical player claiming stay separate workflows and
aren't covered here except where they touch sessions.

## 1. What exists today

| Area | Current implementation | Verdict |
|---|---|---|
| **Signup** | `POST /api/auth/signup` → `auth.signUp` only (V2); same answer for new / existing emails | ✅ works, safe |
| **Email verification** | Supabase sends the link; no `emailRedirectTo`, so it lands on the **Site URL** (home) with an unused `?code`. The person is verified but **not signed in**, and has to log in by hand | ⚠️ works, clunky; depends on the dashboard Site URL |
| **Profile onboarding** | Verified sign-in → `initialize_my_profile` → `/profile` shows Finish setup (missing / incomplete) | ✅ works; only prompted on `/profile` |
| **Recovering a missing / incomplete profile** | Initialization on login, `/auth/callback`, `/api/auth/password-session`, trip-invite accept, `POST /api/account/initialize` (cookie or bearer), Finish setup | ✅ works; no prompt outside `/profile` |
| **Forgot password** | `/forgot-password` → `resetPasswordForEmail(redirectTo: <request origin>/auth/callback)` → code exchange → `/reset-password` → `updateUser({ password })` | ✅ works |
| **Change password while signed in** | **No Settings screen.** The only path is `/reset-password`, which accepts **any** signed-in session (not just a recovery link) and never asks for the current password | ❌ missing / ⚠️ unsafe |
| **Change email** | **None.** `profiles.email` is a copy of the login email, and **username login looks the email up from that copy** | ❌ missing; ⚠️ fragile |
| **Sign out** | `POST /api/auth/signout` → `supabase.auth.signOut()`, whose library default is **`scope: "global"`**, so it signs out **every device**. It also removes this device's push subscription | ⚠️ surprising behavior; no "this device only" option |
| **Sign out other devices / see devices** | None | ❌ missing |
| **Server auth** | `middleware.ts` refreshes cookies; routes use `auth.getUser()` (server-verified) | ✅ safe. Next 16 warns that `middleware` is deprecated in favor of `proxy` (seen in the dev log) |
| **Bearer (iOS) support** | Only `/api/account/initialize` and `/api/account/delete` accept `Authorization: Bearer`. Every other route reads cookies through `getCurrentProfile()` | ⚠️ partial |
| **Re-authentication helper** | `lib/account/reauth.ts` (token `amr` time) + password re-check (`requestWithFreshSignIn`), used by deletion | ✅ reusable |

## 2. Unsafe or fragile (most important first)
1. **Any signed-in session can set a new password without the current one** (`/api/auth/reset-password`). Someone who
   gets a session (a shared or stolen device, or a leaked cookie) can lock the owner out. It should accept only a
   **recovery** session (token `amr` method `recovery` / `otp`), or the current password, or a sign-in within 10
   minutes.
2. **Username login depends on `profiles.email`.** Once email changes exist (or an admin changes one in the
   dashboard), the copy goes stale and username login fails. It should resolve the login email from the auth record
   (by profile id), or keep the copy in sync from the auth side.
3. **After a password reset or change, other sessions aren't revoked by our code.** Whether Supabase revokes them
   needs verifying locally. The safe default is to sign out other devices after any password or email change.
4. **"Sign out" signs out everywhere.** Not a security hole, but surprising, and it gives no way to sign out other
   devices only.
5. **The password policy is the minimum: 6 characters,** no strength or breached-password check (the hosted setting is
   unknown).
6. **Redirect origin.** Forgot-password builds `redirectTo` from the request's origin. That's safe only if the
   Supabase **Redirect URLs allow-list** is strict, which needs checking in the dashboard.
7. **A recovery link is a full session.** After clicking a reset link the person is fully signed in, even if they
   never set a new password. That's acceptable, but it should be time-limited and marked as a recovery session.
8. **No app-level rate limits** on login, forgot-password and resend-verification; we rely on Supabase's limits.

## 3. Supabase settings to verify in the dashboard (read-only checklist, nothing changed)
Path: **Supabase → Authentication → …**

| Setting | Recommended for V2 | Why |
|---|---|---|
| URL Configuration → **Site URL** | the production domain (`https://themaroon.site`) | where email links land by default |
| URL Configuration → **Redirect URLs** | only the exact production / preview callback URLs (and later the iOS link scheme) | blocks redirect-origin abuse |
| Sign In / Providers → Email → **Confirm email** | ON (production has unverified accounts, so it's likely on) | verified-only profiles |
| Email → **Secure email change** (double confirm) | ON | both the old and new address must confirm |
| Email → **Secure password change** | ON | Supabase asks for recent sign-in before a password change |
| Password → **Minimum length / requirements** | at least 8; letters + digits; **leaked-password protection** if the plan supports it | weak passwords |
| Rate limits (emails, sign-ins, verifications) | review defaults | abuse |
| SMTP | a custom sender for production | deliverability + branding |
| Email templates | point links at our routes (PKCE / `token_hash`), not the default | correct landing and auto sign-in |
| JWT expiry | consider shortening (now 3600 s) | limits how long a leaked token works (deletion already blocks closed accounts) |

## 4. iOS (Capacitor) compatibility
- **If the app loads the hosted site** (WebView): cookies work like the web. Email links need **Universal Links** so
  they open in the app, plus matching Redirect URLs.
- **For native screens or offline:** the app must send `Authorization: Bearer`. Today only two routes accept it. A
  bearer-aware `getCurrentProfile(request)` would make every route work for both.
- Keep **PKCE** for every email link. Store refresh tokens in the **Keychain**. Sign out = revoke the refresh token.
- **Sign in with Apple** becomes required if any other social login (Google, etc.) is added. Account deletion must
  then also **revoke the Apple token**.

## 5. Proposed plan (each phase needs approval; local isolated testing first)

| Phase | Build | Tests |
|---|---|---|
| **A1. Redirects & verification landing** | `emailRedirectTo` on signup → a new `/auth/confirm` route (PKCE / `token_hash`) that signs the person in, initializes the profile, and sends them to Finish setup; `next` destinations from an allow-list only; dashboard checklist (§3) recorded | signup → link → signed in → setup; a bad or expired link; redirect allow-list; no open redirect |
| **A2. Password** | Settings → **Change password** (current password or a sign-in within 10 min; reuses `lib/account/reauth.ts`); restrict `/api/auth/reset-password` to recovery sessions or recent re-auth; sign out other devices after any change; minimum length 8 + basic rules (app + dashboard) | a stolen non-recovery session can't change the password; recovery works; other sessions revoked; weak passwords refused |
| **A3. Email change** | Settings → **Change email** (re-auth; Supabase secure double-confirm); pending-change state shown; `/auth/confirm` handles `email_change`; username login resolves the email from the auth record (or `profiles.email` is synced from auth); other devices signed out after the change | old and new must confirm; can't steal an address that's already in use; username login still works after the change; profile email in sync |
| **A4. Sessions** | "Sign out" = **this device** (`scope: "local"`); Settings → **Sign out of other devices** (`scope: "others"`) and "everywhere"; push subscription cleanup per device | each scope revokes exactly what it says (token checks like Step 3b) |
| **A5. Onboarding & recovery polish** | A small "Finish setting up your profile" prompt in the app shell for missing / incomplete profiles; remove the stale "Signing up as MM…" text (UI change, needs approval); resend verification without exposing the email | prompt shows only when needed; nothing changes for finished profiles |
| **A6. iOS readiness** | Bearer-aware `getCurrentProfile(request)`; Universal Link routes for confirm / recovery / email change; rename `middleware.ts` → `proxy.ts` (Next 16); Sign in with Apple design (decision first) | every account route works with a cookie or a bearer token; deep links |

**Not in this plan:** account deletion changes (Step 3) and historical player claiming / reassignment. Both stay
separate.

## 6. Decisions for the owner
1. Minimum password rules (length, character classes, breached-password check, which may need a paid Supabase plan).
2. Should "Sign out" mean this device (recommended) or everywhere (today)?
3. After a password or email change: sign out other devices automatically (recommended) or ask?
4. Will V2 offer Google / Apple sign-in at launch? That decides whether Sign in with Apple is required.
5. Who updates the Supabase dashboard settings in §3, and when (they affect V1 users too)?
