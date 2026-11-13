# Leagues — feature review

Status: **review_required**. Built locally on `cam/explore-content` (project_specs.md "Feature: Leagues", Stages 1–2); not committed. `supabase/leagues.sql` not run on the live database yet. Nothing here establishes legal compliance or authorizes release.

## What it is

- **A league is one round, on one course, on one day.** An organizer (anyone signed in and Active) creates it and shares a 6-character code or a join link. Players join with their handicap index.
- **Groups:** the players play in tee-time groups, and one scorer per group enters the group's hole scores.
- **What everyone in the league sees:**
  - a Gross/Net leaderboard
  - league-wide skins
  - a random 2-person pairs game
- **Group games:** each group can also play its own game (Play a round's games).
- **Data:** `leagues`, `league_players`, `league_groups` and `league_holes`.
  - RLS is on with no policies, and every table is revoked from anon and authenticated.
  - All access goes through security-definer functions granted only to `service_role`. The server calls them with the session's user id (lib/platform/leaguesServer.ts).

## Findings

- **Personal data:**
  - Players' display names, handicap indexes and hole scores are shown to everyone in the same league. Strangers can't see them: `get_league` returns null for non-members.
  - The code lookup shows only the league's name, course, date, organizer name and player count.
- **Access:**
  - Only the organizer changes settings, tee times, scorers or pairs, and only the organizer can end, copy or delete the league.
  - Only a group's scorer (or the organizer) enters that group's scores, until the card is submitted.
  - These rules are tested against Postgres (PGlite) with the real SQL file.
- **Retention:**
  - A league stays until the organizer deletes it, and deleting removes every row.
  - A player's own account deletion removes their league rows through the `profiles` cascade.
  - No retention period is set. **Follow-up** (LR-15).
- **No money:**
  - Skins, pairs and group games are counted only: no stakes, payouts or betting (owner decision on Wagers; Apple's rules).
  - Group games reuse Play a round, which has no money either.
- **Platform rules:**
  - The feature works in the iPhone app (static pages that call `/api/leagues`).
  - Shared join links point to themaroon.site.
- **Minors:** same account age rules as the rest of the app. No new rules.

## Not verified

- A signed-in pass against the live database, which needs `supabase/leagues.sql` to be run first.
- A real-device run.
