# Saved-trip workspace review — 2026-10-14

Scope revision 1. Implemented locally; production migration and deployment are not verified. Status **review_required**. This is engineering evidence, not legal certification or release authorization. Accountable release/legal/privacy owners, jurisdictions, audience ages and professional reviewer remain unassigned.

## Scope and evidence

Saved trips use the newer settings layout, actual accepted-member rosters and saved scorecards. Organizer configuration is persisted in `golf_trip_setup`; canonical trip dates, capacity and rounds update in the same SQL transaction. Personal itinerary plans are private per profile in `golf_trip_personal_plans`. Existing real member invitation/removal, trip deletion, offline attested scoring and correction APIs retain their authorization. Match generation, server team-draft picks, group travel invitations and net/handicap/outcome engines are not added. No sample players or invented scores/pars populate saved-trip views.

Evidence: `supabase/golf_trip_setup.sql`, `savedTripSetup.ts`, setup/plans API routes, shared workspace/provider components, `scripts/test-saved-trip-setup.mjs` and pure adapter/validation tests. Release/build and browser evidence must be recorded after checks complete.

## Data and controls

| Data | Source, destination and access | Retention/deletion |
| --- | --- | --- |
| Organizer setup, selected courses, group slots, draft schedules, entered history | Organizer input to existing Supabase project through member-checked server routes; only accepted organizer can write. Trip members receive necessary setup; historical entries and correction notes are removed from non-organizer client props. | Trip-scoped; cascade on trip deletion. Long-term retention, account export/deletion treatment and backup retention require review. |
| Personal travel times, locations and notes | Current accepted member only; server rebuilds identity and validates ownership. No other members' plans or confirmation numbers are requested. Group invitations are not exposed in this scope. | Per-trip/per-profile table; cascade on trip/profile deletion. Saved on server after each edit, with visible save errors. |
| Names, round strokes and stats | Existing member/scoring APIs; sample data is excluded. Imported totals/net/handicaps remain absent when source data is unavailable. | Existing scoring lifecycle retained. |

Security: schema-bound field whitelist, depth/size limits, typed nested checks, server-derived profile/trip, database organizer/member checks, service-role-only RPCs and tables under RLS, revision conflicts and idempotent writes. Canonical round edits are rejected once scoring groups exist, using trip/round row locks. Existing score-writing and correction authorization are unchanged. No secret values are sent to client props or stored in setup.

Privacy/personal data/UGC: organizer-entered historical names/scores and personal travel notes now reach Supabase rather than staying only in browser memory. Notices, purpose limitations, contributor authority, rights requests and moderation/support handling require owner review. Account deletion and privacy boundaries must be rehearsed on the deployed schema before release.

IP/provider rules: existing course API references and selected display labels are stored; no new provider, scraping, copied reviews or licensed photos are introduced. Existing golf data license, attribution, permitted storage and refresh requirements remain **review_required**.

Payments/subscriptions/tax/advertising/sponsorship/affiliate links: no new commercial or money flows. Existing Predict remains play-only and is not certified or expanded to paid/redeemable coins or prizes. Professional gambling/contest and commercial platform boundaries remain unresolved under existing reviews; no approval is inferred.

Follow-ups: assign owners and review dates; verify current privacy terms and Supabase processing/regions; define retention and backup deletion; verify production schema and authorization with test users; review any future official team/match assignment, ranking, multiplayer or group-plan invitations separately. All unresolved categories remain **review_required**.
