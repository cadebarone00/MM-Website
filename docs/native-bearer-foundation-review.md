# Native bearer identity foundation review

2026-10-23. Implemented locally; not deployed. Status: review_required.

Scope: Phase 1 request-local identity boundary, reused from the A1 approach with its missing-RPC fallback removed. Accountable owner, security/policy reviewers, jurisdictions, audience ages, launch scope and professional reviewer remain unassigned. Baseline: main 1b252e4c. No release approval is recorded.

## Data and security decisions

Bearer access tokens arrive in Authorization and are verified by Supabase Auth, then checked through session_is_revoked with the same user's token. Only a successful false reply permits access; absent/failed RPC, unexpected responses, malformed/expired/invalid tokens and conflicting browser accounts return an anonymous client. Tokens are neither logged nor persisted. Cookie-only calls retain the existing SSR cookie client. The anon-key bearer client carries the user's token to PostgreSQL/RLS; it does not use service-role authority. Supabase remains the existing identity/data provider; regions, contractual terms and actual retention remain unverified.

Explicit Request opt-in is used by /api/account/me and accountForRequest's existing callers (account initialization, password change, sessions and deletion). Existing getCurrentProfile and Golf Trip APIs are not opted in. Auth sign-out code and its failure responses are unchanged. No origin protection or CORS rule changes. No device token storage, new analytics, database schema or deployment changes.

## Category findings and follow-ups

All categories remain review_required pending named reviewers and evidence; this is not a compliance certification.

| Categories | Scope assessment / remaining action |
| --- | --- |
| privacy, personal-data, user-accounts, security, audit-logging | Existing account identifiers and tokens cross the existing Supabase Auth/REST boundary. Confirm provider configuration, logging redaction and live RLS. Verify invalidation and account isolation on isolated staging. |
| retention, account-deletion | No new storage. Existing session retention, closure hook and revocation implementation need target-database evidence; confirm deletion/session tests before distribution. |
| intellectual-property, contractor-ownership, open-source | Reuses repository/A1 logic and installed Supabase SDK; no dependency added. Ownership/license review remains unresolved. |
| ugc, media-rights, third-party-golf-content, course-reviews, organizer-responsibility | No new content collection or visibility contract; verify downstream authorization when opting additional routes in. |
| payments, subscriptions, taxes, advertising, sponsorship, affiliate-links | No money or commercial feature change in this scope; reviewer must confirm exclusions for eventual mobile distribution. |
| business-ownership, minors, platform-rules, legal-review | Entity, audience, notices and provider/store/professional review remain unresolved; this implementation authorizes no release. |

## Dependencies and verification limits

supabase/account_deletion.sql defines session_is_revoked and grants execution to authenticated callers. Its presence, installed version, auth.sessions behavior, active-account policies and pre-request hook have NOT been verified in any target database. Missing RPC fails closed. After Auth verification, this boundary also requires matching sub, authenticated role, unexpired exp and a UUID session_id; it refuses sessionless tokens even though the RPC would allow them. The checked-in RPC returns false if auth.sessions is absent: target Auth schema and function semantics must be verified before native integration. No SQL was changed or executed.

Automated tests use the installed Supabase SDK with intercepted Auth/REST responses. They verify verification ordering, caller token propagation, profile identity, cookie behavior, conflicts and fail-closed results; they do not establish actual hosted signature checks, RLS policy correctness or live revocation. Follow-up owner/due date: unassigned. Next step: isolated database verification and a main-backed trip JSON loader using this same opt-in boundary, without copying scoring logic or replacing the existing Android POC.

## Local validation commands and results

Run on 2026-10-23, without dependency installation or database execution:

```powershell
node node_modules/tsx/dist/cli.mjs --test lib/supabase/requestIdentity.test.ts lib/profile/profileIdentity.test.ts lib/auth/returnTo.test.ts lib/auth/passwordSession.test.ts lib/website/signOut.test.ts lib/account/reauth.test.ts lib/compliance/registryStructure.test.ts lib/compliance/featureRegistry.test.ts
```

Exit 0: 40 passed, 0 failed, including 11 new boundary tests. An initial run exposed an already-stale compliance test expecting 28 records (baseline had 32); its uniqueness assertion now uses the actual count and checks the new feature's presence. Auth/REST responses are intercepted, not sent to a real service.

```powershell
node node_modules/eslint/bin/eslint.js lib/supabase/server.ts lib/supabase/requestIdentity.ts lib/supabase/requestIdentity.test.ts lib/profile/profileInitialization.ts app/api/account/me/route.ts lib/compliance/featureRegistry.ts lib/compliance/featureRegistry.test.ts
```

Exit 0, no lint output.

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm.cmd run build
```

Both exit 1 on stale generated route validators referencing removed maroon-u pages under .next/dev and .next-savedtrip-check (the first check also found stale .next/types references). Build compiled successfully using installed Next.js 16.3.8, then failed typechecking; it also emitted the existing middleware-to-proxy deprecation warning. These generated directories and tsconfig were not changed to suppress errors. No production deployment is claimed.

An additional source-only TypeScript check passed (exit 0, zero diagnostics), excluding generated .next* files in memory without changing tsconfig:

```powershell
@'
const ts = require('typescript');
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const files = parsed.fileNames.filter(f => !/[\\/]\.next[^\\/]*[\\/]/.test(f));
const program = ts.createProgram(files, {...parsed.options, incremental: false, noEmit: true});
const errors = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(errors, {getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: f => f, getNewLine: () => '\n'}));
console.log(`Source-only typecheck: ${errors.length} diagnostics (generated .next* files excluded in memory).`);
process.exitCode = errors.length ? 1 : 0;
'@ | node
```

```powershell
npm.cmd run docs:workflow
npm.cmd run docs:workflow:check
npm.cmd run compliance:check
git diff --check
```

All exit 0. Workflow HTML regenerated and verified. Compliance structure check: 33 features, 7 documentation files; structure only, not legal approval. PowerShell's npm.ps1 invocation was initially blocked by execution policy; npm.cmd succeeded without changing policy or environment variables.
