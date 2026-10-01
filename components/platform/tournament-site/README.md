# Public Tournament Site UI kit

Presentation components for a future public tournament website. No application route, auth, persistence, scoring service, network fetch, or media pipeline is included.

## Files and exports

- `types.ts`: public presentation data, branding, team/player/course/session/match types and page links.
- `theme.ts`: scoped branding variables, color validation, readable black/white team text, image URL filtering and state labels. Color validation, contrast and fallbacks come from the shared `lib/theme/tournamentTheme.ts` (the one place tournament theme colors are defined).
- `components.tsx`: TournamentTheme, TournamentHeader, TournamentHero, TournamentNav, TournamentStatusBanner, TeamScoreSummary, LeaderboardPreview, MatchPreview, SchedulePreview, PlayerGrid, TeamCard, CourseCard, TournamentInfoCard, SponsorSlot, Footer, EmptyState, LockedSection, ComingSoonSection, Section.
- `pages.tsx`: TournamentHome, TournamentLeaderboard, TournamentMatches, TournamentSchedule, TournamentPlayers, TournamentTeams, TournamentCourses, TournamentResults, and TournamentSite composition.
- `tournament-site.css`: scoped `.ts-*` presentation styles. Import this once in the eventual consuming layout. No framework theme classes or global body resets.
- `fixtures.ts`: fictional Texas Cup 2027 (16 players, Blue/Gold, three days, two fictional courses, Fourball/Alternate Shot/Singles) and Coastal Open 2028 (four individual competitors, different palette, final standings). Texas scores/matches are a display snapshot, not a simulated complete scoring ledger.

## Using the kit later

Pass `TournamentSite` a `TournamentSiteData`, a `SitePage` and caller-owned `SiteLinks`. Wrap individually composed components in `TournamentTheme` with the event's `Branding`. Colors use six-digit hex values and CSS variables; invalid values fall back safely. Team labels use a border and a black/white foreground chosen for contrast, even with white/pale backgrounds. Optional logos/photos/hero/course images accept root-relative or HTTPS URLs and have text/initial placeholders when absent. No fixture loads external assets.

The future `/t/[tournament]/[year]` adapter will resolve and authorize the event outside this kit, project approved public data into these types, choose a page and supply actual navigation links. Do not pass private database rows or secrets into client props. The handicap visibility flag is a display guard, not authorization: the future server adapter must omit private values before serialization. A Draft or Locked label does not enforce access control or publishing readiness. Results are supplied by the caller, never calculated here.

No founding-event team keys, names, colors or date assumptions are embedded in presentation logic. The second fixture is individual stroke play solely as a display example; it does not add scoring-engine support. Locale-facing date and tee-time strings are caller-provided, with an explicit tournament timezone label. Final match/standing status ignores progress text and displays Final rather than Thru 18.

## Local preview and checks

From the repository root (PowerShell):

```powershell
npx.cmd tsx scripts/preview-tournament-site.tsx
node scripts/test-tournament-site-browser.cjs
npx.cmd tsx --test components/platform/tournament-site/tournament-site.test.tsx
```

Open `out/tournament-site-preview/index.html` locally. The clearly labeled fictional preview has event selection, all eight page concepts, status/locked/coming-soon examples and white-team contrast. It is static HTML in the ignored `out` directory, not an application route or production tournament. Do not deploy this demo as event data. Browser checks write screenshots beside it.

## Compliance review — 2026-09-29

Scope: new fixture-only UI components and a local preview. Reviewed the master compliance spec, feature checklist and feature registry. Production approval is not requested or implied. Accountable production owner/professional reviewer: unassigned. Relevant existing registry features: player-profiles, live-scoring, external-device-media, hosted-media, sponsorships. Unresolved legal questions remain **review_required**.

| Area | Assessment and future dependency |
| --- | --- |
| Privacy / personal data / retention | Fixtures are fictional and in source; no collection or durable user data. Public projection, participant permission, deletion and retention for real event data remain review_required before integration. |
| IP / open source / media rights | No third-party image assets added. Existing React stack and original CSS are reused; real logos/photos/course content require provenance and rights review. |
| UGC / security | React text rendering; no HTML injection or data calls. Optional image URLs are filtered. Future asset providers, user content, links, authorization and moderation remain review_required. |
| Payments / subscriptions / taxes | No transactions, entitlements, prices or checkout. Any future commercial integration requires separate review. |
| Advertising / sponsorship / affiliate links | SponsorSlot is visibly an unfilled placeholder. No partner claims, tracking or affiliate links. Actual placements/disclosures remain review_required. |
| Platform/provider rules / minors / professional legal review | No native-store or external provider integration introduced. Real audiences, publication, assets and policy promises remain review_required. |
| Commercial-media boundary | Compatible with none/device_external; optional branding images only. No upload, broadcast, highlights or hosted-media dependency. maroon_hosted remains reserved for future commercial use; existing founding-event behavior is untouched. |

This review documents scope and outstanding requirements; it does not mark registry features compliant or alter their existing review state.
