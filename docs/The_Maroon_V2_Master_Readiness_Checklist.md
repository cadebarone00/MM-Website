# The Maroon V2.0 — Master Readiness Checklist

**Baseline:** October 27, 2026  
**Invite-only beta:** November 30, 2026  
**Public launch:** December 31, 2026

## Rules for checking an item

- **Beta Ready** means its beta acceptance criteria are proven in the actual invite-only mobile build using real accounts/devices as appropriate.
- **Launch Ready** means production release criteria, security, quality, documentation and monitoring are verified. It does **not** become checked merely because Beta Ready is checked.
- Both checkboxes start empty. The status below describes prior implementation evidence only, not release approval.
- When an item is legitimately post-launch or not in the agreed launch scope, record **N/A — deferred by decision** rather than checking it as if done.
- Store proof in the evidence register: test date, branch/commit, build, platform, tester and result.

## Website and V1 consolidation - October 28, 2026

Owner-approved scope: retire V1 shell, public tournament pages, player portal, fantasy/wagers, journal and admin UI; preserve V2 and all shared data/rules/APIs. The marketing footer is adapted into the new website. Tap In retains silent leaderboard/match graphics behind website sign-in. This local web change does not prove native replacement parity, arbitrary saved-trip TV integration, beta readiness or deployment. Decisions, dependency inventory and verification: `docs/v1-retirement-review.md`, `docs/v1-retirement-dependencies.json` and `docs/app-workflow.md`. Existing readiness boxes remain unchanged.

## Readiness checklist

### A. Platform, accounts and security

#### 1. Product vision and scope
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Established.
- **What must be done:** Agree the target audience, essential beta journeys, supported platforms and what is excluded from V2.0; write acceptance criteria.
- **Evidence / owner / last verified:** _TBD_

#### 2. Technical architecture
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Built foundation.
- **What must be done:** Confirm Next.js/React, Supabase, Vercel and Capacitor boundaries; document build, hosting and app-backend dependencies.
- **Evidence / owner / last verified:** _TBD_

#### 3. A1 — Account signup
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Implemented locally.
- **What must be done:** Verify new-account validation, unique users, correct error messages and signup from iOS and Android.
- **Evidence / owner / last verified:** _TBD_

#### 4. A2 — Password security
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Foundation implemented.
- **What must be done:** Confirm 12+ character policy, change requiring old password, reset via email, expired link handling and session invalidation.
- **Evidence / owner / last verified:** _TBD_

#### 5. A3 — Email verification
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Foundation implemented.
- **What must be done:** Verify email delivery, duplicate-safe profile creation, retries, expiry, and mobile deep-link completion.
- **Evidence / owner / last verified:** _TBD_

#### 6. A4 — Sessions and devices
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs testing.
- **What must be done:** Test current-device sign-out, other-device sign-out, all-device sign-out, persistence and revoked sessions across platforms.
- **Evidence / owner / last verified:** _TBD_

#### 7. A5 — Account onboarding
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Implemented locally.
- **What must be done:** Verify first-login profile setup, unfinished onboarding recovery, sign-in redirects and one-time initialization.
- **Evidence / owner / last verified:** _TBD_

#### 8. Permanent profile identity
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Architecture established.
- **What must be done:** Ensure each user has one stable profile_id used across trips, scores, rounds, history and social relationships.
- **Evidence / owner / last verified:** _TBD_

#### 9. Account deletion and retention
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Policy/design developed.
- **What must be done:** Validate deletion requests, removal of personal details, tombstoned historical scores, organizer transfer and data retention disclosures.
- **Evidence / owner / last verified:** _TBD_

#### 10. Security and privacy
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Foundation; audit outstanding.
- **What must be done:** Review Supabase RLS, role checks, profile visibility, API auth, service-role use, abuse protection and secret exposure.
- **Evidence / owner / last verified:** _TBD_

### B. Golf trips, competition and player data

#### 11. Golf Trips
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Partially complete.
- **What must be done:** Create/edit/open/delete trips; load member lists, schedules and saved details; test whole trip lifecycle with real accounts.
- **Evidence / owner / last verified:** _TBD_

#### 12. Invitations and membership
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Foundation developed.
- **What must be done:** Invite, accept, join, decline/leave, remove member and role protection; guard private trip data.
- **Evidence / owner / last verified:** _TBD_

#### 13. Tournament and competition management
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Foundation developed.
- **What must be done:** Organizer creates/configures rounds, formats, pairings and standings; start/lock/finalize workflows work for real players.
- **Evidence / owner / last verified:** _TBD_

#### 14. Golf formats and games
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Simulator developed.
- **What must be done:** Validate Singles, Fourball, Foursomes and selected side games against example scorecards; connect supported formats to real persisted scoring.
- **Evidence / owner / last verified:** _TBD_

#### 15. Live scoring
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Foundation developed.
- **What must be done:** Test per-hole entries, simultaneous players, attest/lock/correct, realtime leaderboard updates, and save/reload reliability.
- **Evidence / owner / last verified:** _TBD_

#### 16. Course GPS and mapping
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Prototype.
- **What must be done:** Validate course lookup, permission prompts, physical-device location, front/center/back yardages, accuracy and unavailable-course fallback.
- **Evidence / owner / last verified:** _TBD_

#### 17. Travel and trip integrations
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Destinations/weather developed.
- **What must be done:** Keep destination/weather reliable; provide manual flight, stay and transport details; third-party sync only if stable and approved.
- **Evidence / owner / last verified:** _TBD_

#### 18. Player statistics and handicaps
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** UI and architecture developed.
- **What must be done:** Compute rounds, scoring averages, and applicable handicap from actual saved rounds; verify edge cases and privacy.
- **Evidence / owner / last verified:** _TBD_

#### 19. Historical tournament data
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Mapping developed.
- **What must be done:** Validate all intended 2024–2026 hole records, player matching, source provenance, duplicates and round/result display.
- **Evidence / owner / last verified:** _TBD_

### C. Development simulator and native apps

#### 20. Development simulator
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Built.
- **What must be done:** Keep mock states aligned with production flows; identify simulation-only features and use real-device tests as release evidence.
- **Evidence / owner / last verified:** _TBD_

#### 21. A6 — Mobile architecture
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** In progress.
- **What must be done:** Validate Capacitor builds, app routing, backend access, login/deep links, permissions and lifecycle/resume behavior.
- **Evidence / owner / last verified:** _TBD_

#### 22. Android first-device milestone
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Initial packaging reported.
- **What must be done:** Confirm installable APK on device/emulator and repeat sign-in, trip retrieval and persisted score test.
- **Evidence / owner / last verified:** _TBD_

#### 23. iOS application development
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Environment established.
- **What must be done:** Build/install on iPhone, configure bundle/signing, test auth, navigation, score save and prepare TestFlight archive.
- **Evidence / owner / last verified:** _TBD_

#### 24. Android production follow-up
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Integration outstanding.
- **What must be done:** Validate native back button, permissions, secure storage, app links, Play-compatible signing and AAB release.
- **Evidence / owner / last verified:** _TBD_

### D. Infrastructure, launch and collaboration

#### 25. Launch blocker register
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Open.
- **What must be done:** Track each production blocker with reproduction, severity, owner, fix, verification evidence and target date.
- **Evidence / owner / last verified:** _TBD_

#### 26. Supabase migrations
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Written; parity unverified.
- **What must be done:** Inspect applied migrations, RLS, indexes, staging vs production parity, backups and repeatable release procedure.
- **Evidence / owner / last verified:** _TBD_

#### 27. Production marketing website
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Substantially built.
- **What must be done:** Finish public landing page, features/support/download sections, legal links, mobile views, analytics and deployment.
- **Evidence / owner / last verified:** _TBD_

#### 28. Collaboration and workflow
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Established.
- **What must be done:** Agree main/feature branch policy, PR reviews, CI checks, ownership, releases and preventing unmerged work from being forgotten.
- **Evidence / owner / last verified:** _TBD_

#### 29. Milestone and sprint planning
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs updating.
- **What must be done:** Sequence Nov 30 beta and Dec 31 launch; define scope freeze, owners, critical path and go/no-go checkpoints.
- **Evidence / owner / last verified:** _TBD_

#### 30. Minimum usable mobile journey
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not verified end-to-end.
- **What must be done:** On both platforms: install → signup/login → open saved trip → enter round → save → exit/reopen → retrieve score.
- **Evidence / owner / last verified:** _TBD_

#### 31. Overall production readiness
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Demonstrate all launch gates met: tested core paths, security, reliability, stores, monitoring, support and rollback.
- **Evidence / owner / last verified:** _TBD_

### E. Additional product and device quality

#### 32. Individual Play a Round
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Start standalone round outside a trip, choose course/tees, enter hole scores, finalize and see personal history.
- **Evidence / owner / last verified:** _TBD_

#### 33. Course search and tee data
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Search/select reliable courses; persist tee boxes, pars, stroke indexes and course metadata with clear manual fallback.
- **Evidence / owner / last verified:** _TBD_

#### 34. Round completion and history
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Finish/edit where allowed, store immutable/audited results, list historical rounds, and prevent accidental duplicate rounds.
- **Evidence / owner / last verified:** _TBD_

#### 35. Leaderboard scoring stress tests
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Test multiple players saving together, ordering, tie rules, delayed events, reloads, and final standings.
- **Evidence / owner / last verified:** _TBD_

#### 36. Offline and reconnect behavior
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Queue score changes offline, retry idempotently, resolve conflicts visibly and avoid score loss or duplicates.
- **Evidence / owner / last verified:** _TBD_

#### 37. Essential notifications
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Define essential email/in-app trip and account alerts; confirm delivery, consent and fallback; optional push can follow later.
- **Evidence / owner / last verified:** _TBD_

#### 38. Friends and profile comparisons
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Recent code commits; unverified.
- **What must be done:** Verify search, requests, acceptance, removal, private profile access and comparison with genuine saved rounds.
- **Evidence / owner / last verified:** _TBD_

#### 39. Light/dark visual consistency
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Recent UI work; unverified.
- **What must be done:** Audit every primary screen in both themes for contrast, card layering, accessible text and platform consistency.
- **Evidence / owner / last verified:** _TBD_

#### 40. Accessibility and device layouts
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Test dynamic text, touch targets, contrast, screen readers, safe areas, keyboard handling and common phone sizes.
- **Evidence / owner / last verified:** _TBD_

#### 41. iOS deep links and auth redirects
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Confirm verification/reset/invite links return to correct installed app screen; handle cold start and expired links.
- **Evidence / owner / last verified:** _TBD_

#### 42. Android links and navigation
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Confirm app links, Android back behavior, authentication return paths, orientation and permission lifecycle.
- **Evidence / owner / last verified:** _TBD_

### F. Beta distribution, reliability and compliance

#### 43. TestFlight invite-only distribution
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Configure signing/App Store Connect, upload beta build, create internal/external tester groups and verify invite installation.
- **Evidence / owner / last verified:** _TBD_

#### 44. Google Play invite-only distribution
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Set up Play Console app, signing, closed testing track, tester list, release AAB and install verification.
- **Evidence / owner / last verified:** _TBD_

#### 45. Analytics/crash/error monitoring
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Instrument crashes and critical funnel steps without exposing private score/account data; set alerts and owner.
- **Evidence / owner / last verified:** _TBD_

#### 46. Staging, backups and recovery
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Separate testing from production; prove restore procedure, data integrity and schema migration rollback plan.
- **Evidence / owner / last verified:** _TBD_

#### 47. Secrets, API limits and costs
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Audit all server/client keys, host limits, billing alerts, spam/rate limiting and production access permissions.
- **Evidence / owner / last verified:** _TBD_

#### 48. Beta feedback and issue process
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Recruit golfers, provide feedback intake, triage critical bugs, define response ownership and track retests.
- **Evidence / owner / last verified:** _TBD_

#### 49. Privacy policy, terms and deletion guidance
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Publish accurate data-use disclosures, account deletion path, support contact and app-store required declarations.
- **Evidence / owner / last verified:** _TBD_

#### 50. Apple and Google developer enrollment
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Confirm active memberships, legal entity and tax/contact details, roles, certificates and publishing permission.
- **Evidence / owner / last verified:** _TBD_

### G. Public launch and business readiness

#### 51. Marketing website final content
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** In progress.
- **What must be done:** Finalize homepage copy, features, screenshots, FAQs, download calls to action and responsive testing.
- **Evidence / owner / last verified:** _TBD_

#### 52. iOS App Store assets/listing
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Prepare icon, screenshots, description, keywords, age rating, privacy info, reviewer account and approval submission.
- **Evidence / owner / last verified:** _TBD_

#### 53. Android Play Store assets/listing
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Prepare listing copy, screenshots, data safety, content rating, policies, app signing and review submission.
- **Evidence / owner / last verified:** _TBD_

#### 54. Public website and app links
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Configure production domain, universal/app links, correct store URLs, redirects, analytics and support/legal navigation.
- **Evidence / owner / last verified:** _TBD_

#### 55. Support workflow
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Test support inbox, FAQ, issue escalation, incident response, deleted-account inquiries and reasonable turnaround expectations.
- **Evidence / owner / last verified:** _TBD_

#### 56. First-use guidance
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs verification.
- **What must be done:** Create concise first-run explanations of trips, scoring, game rules and privacy; test confusion points with beta golfers.
- **Evidence / owner / last verified:** _TBD_

#### 57. Performance, rollout and rollback
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Measure speed and concurrent usage, monitor errors, set controlled rollout and ability to disable/fix faulty releases.
- **Evidence / owner / last verified:** _TBD_

#### 58. Public launch marketing
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Not established.
- **What must be done:** Prepare announcement content, waitlist/outreach, social assets, beta testimonials with permission and launch-day timeline.
- **Evidence / owner / last verified:** _TBD_

#### 59. Founder responsibilities
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Needs agreement.
- **What must be done:** Assign Cade/Cam owners for engineering, QA, releases, finances, customer support and escalation decisions.
- **Evidence / owner / last verified:** _TBD_

#### 60. Monetization and success metrics
- [ ] **Beta Ready**  - [ ] **Launch Ready**
- **Current reported implementation:** Planning.
- **What must be done:** Decide free/paid launch approach, record cost per user, activation, retained players, completed rounds and future revenue hypotheses.
- **Evidence / owner / last verified:** _TBD_

## Evidence register (fill as Claude verifies each item)

| Item | Owner | Target (beta/launch/deferred) | PR/commit | Test proof | Verified date | Decision |
|---|---|---|---|---|---|---|
| _#_ | _Cade/Cam_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

## Release gates

**Beta by Nov 30:** real-device account access, trip/join, reliable saved rounds and competition flows in included scope, safe backend rules, tester distribution and crash/feedback intake.

**Public by Dec 31:** beta blockers resolved, production data/recovery and operational controls tested, disclosures and support published, final builds approved and distributed on target stores.
