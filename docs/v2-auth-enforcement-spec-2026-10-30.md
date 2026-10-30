# V2 sign-up enforcement: tester allowlist, birthday-first and strict 13+ (design for approval, 2026-10-30)

**Status: DESIGN ONLY.** Nothing built, no SQL, no Supabase setting. Owner decision 7: enforcement sits at the Supabase /
server boundary, including direct API and OAuth paths. **The age gate is not called secure until every bypass test in
section 9 passes.** Builds on the approved pending-accounts architecture (`project_specs.md`, "Pending accounts").

## 1. What exists today (branch code) and what is wrong with it

| Piece | Today | Problem |
|---|---|---|
| Sign-up | `POST /api/auth/signup` calls Supabase `signUp` | Supabase's own sign-up endpoint is public: anyone with the browser key can create a login without our server |
| Birthday | `/onboarding/birthday` after email, password, verification and name; `set_my_birthdate` (write-once, 13+) | Personal data is collected before age is known (release-blocking per spec §15; owner decision 4 of 2026-10-30: birthday first) |
| Apple / Google | `/auth/callback` exchanges the code and creates the profile at once | The login and profile exist before any age check |
| Activation | `activate_my_profile` needs the global switch and the current Terms + Privacy versions | No tester-only path; testers would have to "accept" non-final Terms |
| Search | `search_golfers` (profile_friends.sql) shows complete profiles | Pending accounts are discoverable unless Stage D (disabled) runs |

## 2. Supabase platform facts this design relies on (from Supabase docs, 2026-10-30)

- **Before User Created** hook: runs before a new user is created; can be a **Postgres function** or HTTP endpoint;
  available on **Free** and Pro. Returning an error object with a 4xx code blocks the sign-up and the client gets the message.
- It receives the user being created (`email`, `phone`, `app_metadata.provider`, `user_metadata`, `identities`,
  `is_anonymous`) and request metadata (`ip_address`, request id). The user does not exist yet in Postgres.
- Postgres hooks have **2 seconds**; their errors are not retried (sign-up fails, i.e. fails closed).
- Supabase does **not** document whether users created through the admin API (`createUser`, `inviteUserByEmail`) run the
  hook (bypass test B8 decides).

## 3. Database objects (new file `supabase/signup_gate.sql`, service-role only, RLS on, no browser access)

| Object | Purpose |
|---|---|
| `registration_settings` (one row): `mode` = `closed` / `testers` / `open` | One switch for who may register |
| `signup_allowlist` (`email_normalized` primary key, `note`, `added_by`, `added_at`) | Testers (owner, Cam, dedicated test accounts) |
| `age_passes` (`id`, `nonce_hash`, `birthdate`, `email_hash` null until bound, `created_at`, `expires_at` = +30 min, `used_at`) | Proof that THIS sign-up passed the 13+ check. The birthdate lives only here (server-side), never in the client or Auth metadata |
| `before_user_created_gate(event jsonb) returns jsonb` | The Auth hook (section 5) |
| `consume_age_pass_for_account(account, nonce)` | After the login exists: moves the birthdate into `account_birthdates` (write-once) and deletes the pass |
| Cleanup | Unused passes deleted after expiry by the existing daily account job (no new schedule) |

Under-13 submissions are **not stored anywhere** (no row, no hash). The browser gets a neutral message; a device hint
cookie only smooths the UX and is not a security boundary (approved spec §4).

## 4. Flows

**Email (website and app):**
1. Welcome -> **Birthday first** -> `POST /api/auth/age-check { birthdate }` (no account, no email). Server computes age
   (`lib/account/age.ts`, UTC, 29 Feb rule). Under 13 -> neutral refusal, nothing stored. 13+ -> `age_passes` row; the
   website gets an HttpOnly, SameSite=Strict cookie holding the random nonce; the app gets the nonce in the reply.
2. Sign Up (email, password, Terms line) -> `POST /api/auth/signup`: requires a live pass; binds it to the email
   (`email_hash`), then calls Supabase `signUp` with `options.data.age_pass = <nonce>`.
3. Hook (section 5) checks the pass, the email binding and the allowlist before the login is created.
4. Verification code -> `consume_age_pass_for_account` stores the birthdate -> Name -> Photo -> Settings -> Finish.
   The Birthday step disappears from onboarding for new accounts (it is already done).

**Apple / Google:** see section 6 (the hard case).

## 5. The hook (`before_user_created_gate`)

In order; the first failure returns `{"error": {"http_code": 403, "message": "<fixed text>"}}`:
1. `mode = 'closed'` -> "Registration is closed."
2. Anonymous or phone sign-ups -> refused (not offered).
3. `mode = 'testers'` and the email is not in `signup_allowlist` -> "Registration is invite-only right now."
4. Provider `email`: `user_metadata.age_pass` must match an `age_passes` row: unused, unexpired, bound to this email's hash.
   It is marked used in the same transaction (single use; replay fails).
5. Providers `google` / `apple`: section 6.
6. Otherwise `{}` (allow).

The nonce is random (32 bytes), stored only as a SHA-256 hash, and never carries the birthdate. A direct call to
Supabase's sign-up endpoint without a pass, with a forged / reused / expired pass, or with another email's pass is refused
by the database itself.

**Second line of defense (if the hook were ever switched off by mistake):** `initialize_my_profile` refuses to create a
profile for a login that has no stored birthday (no consumed age pass, no `account_birthdates` row); the app shows the
Birthday / eligibility screen instead. So a hook outage cannot produce a usable account. A daily read-only check
(existing daily job) alerts if `registration_settings.mode <> 'closed'` while the hook is not configured (checked via a
row the hook writes on each call: last-seen time).

## 6. Apple / Google: what the platform can and cannot guarantee

The hook sees only what the provider sends (email, name), not our age pass: Supabase passes no custom data from our
redirect into the hook. **So "no OAuth account is ever created before the age check" cannot be guaranteed by the hook
alone.** Options:

| Option | Guarantee | Cost |
|---|---|---|
| A. **Testers phase:** OAuth new-account creation allowed only for allowlisted emails | Exact: only known adult testers | None |
| B. **Public:** no new accounts through OAuth; Apple / Google can be linked after an email account exists (Settings -> Sign-in methods, approved manual linking) | Exact: every new account passed birthday-first | Fewer one-tap sign-ups. App Store: Sign in with Apple is required only when another third-party sign-in creates accounts; linking-only needs App Review confirmation |
| C. Public: OAuth allowed; `/auth/callback` requires the age-pass cookie from the same browser; without it the just-created login is deleted at once (admin API) and the person is sent to Birthday | Login exists for seconds without an age check, then removed | Residual risk needs legal review; native app needs an equivalent |
| D. Hook matches a recent age pass from the same IP address | Weak (shared networks) | Not recommended |

**Recommendation:** A for testers, B for launch unless legal review accepts C. Approval needed.

## 7. Pending vs Active, and testers without final Terms

- Unchanged: Pending -> Active only through Finish (`activate_my_profile`); Ineligible flow unchanged.
- Amendment to `account_activation.sql`: when `registration_settings.mode = 'testers'` and the account's email is on the
  allowlist, Finish may activate **without** Terms / Privacy versions. It writes a row in a new
  `tester_activations (account_id, activated_at, terms_status = 'not_accepted_preview')`, and **never** writes
  `terms_acceptances`. `activation_enabled` is no longer needed for testers in that mode.
- Pending accounts hidden from `search_golfers`, friends and public profiles (small change, not Stage D).
- Stage D (`account_activation_enforcement.sql`) stays disabled.

## 8. Public launch (tester-only -> open)

1. Final Terms and Privacy published; versions inserted into `legal_document_versions`.
2. `activation_enabled = true`.
3. Every tester with a `tester_activations` row and no `terms_acceptances` meets the existing "accept updated Terms" step
   before Play (no automatic acceptance).
4. OAuth decision (section 6) applied.
5. `registration_settings.mode = 'open'` (age pass still required for every new account).
6. Bypass suite (section 9) re-run against production with dedicated test accounts, then removed.

## 9. Bypass tests (all must pass on `maroon-auth-dev` / local before anything is called secure)

| # | Attack | Expected |
|---|---|---|
| B1 | Direct `POST /auth/v1/signup` with the browser key, no pass | Refused by the hook |
| B2 | Forged nonce / random string | Refused |
| B3 | Valid pass replayed for a second sign-up | Refused (used) |
| B4 | Expired pass (> 30 min) | Refused |
| B5 | Pass bound to email A used for email B | Refused |
| B6 | Mode `testers`, non-allowlisted email (email and OAuth) | Refused |
| B7 | Mode `closed`, allowlisted email | Refused |
| B8 | Admin API `createUser` / `inviteUserByEmail` | Documented result; if the hook does not run, profile creation still refused (second line) and no app route uses it |
| B9 | Under-13 birthday | No account, no row, no hash, neutral message; back-button retry gives the same result for that device (UX only) |
| B10 | OAuth new account per the chosen option (A / B / C) | As designed |
| B11 | Hook switched off on the test project | No profile can be created; the daily check alerts |
| B12 | Hook slower than 2 s / erroring | Sign-up fails closed with a generic message |
| B13 | App (bearer) path for age-check and sign-up | Same guarantees as the website |

## 10. Known limitations (stated, not hidden)

1. OAuth pre-creation age enforcement is impossible with the hook alone (section 6).
2. Admin-API coverage of the hook is undocumented (B8).
3. The hook can only be enabled on production at cutover, because V1 registration stays open until then (decision 5);
   until cutover, production has no Supabase-level gate (V1 behavior), and V2 is tested on non-production projects.
4. A person can lie about their birthday; the system enforces the declared date (approved policy), not identity.
5. Email confirmation and code emails need custom SMTP on the project before testers (built-in sender limits).
