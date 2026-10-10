# Player rounds ← scoring: integration contract

For the Golf Trip scoring work (and later tournament / personal scoring). The Profile Identity work owns
`supabase/player_rounds.sql`; scoring owns its own files. This is the only meeting point.

`player_rounds` is each golfer's **finished-round history** (Profile → Rounds, Stats, handicap). It is not the
live-scoring engine. Scoring keeps its own cards. When a card is final, scoring **publishes** it here.

## The one call

```sql
select public.publish_player_round(p_profile uuid, p_round jsonb);  -- service_role only
```

- `p_profile` is the golfer, a `profiles.id`. For a trip this is `scorecard_submissions.golfer_profile_id`.
- `p_round` takes the `playerRoundPayload` shape (`lib/platform/playerRoundsRows.ts`): `source`, `sourceLabel`,
  `datePlayed`, `course {ref,name,place}`, `tee {name,rating,slope}`, `holesPlayed`, `format`,
  `holes [{number,par,strokes,putts,fairway,green,penalties?}]`, `total`, `countsForHandicap`, `notCountedReason`,
  `differential` and `enteredBy`. On top of that it takes a `context` object:

| source       | context (required)                       | context (optional)                                        | source_key built                 |
|--------------|------------------------------------------|-----------------------------------------------------------|----------------------------------|
| `trip`       | `golfTripId`, `golfTripRoundId`          | `scorecardSubmissionId`, `submissionRevision`             | `trip:<tripId>:<tripRoundId>`    |
| `tournament` | `editionId`, `editionRoundId`            | `tournamentPlayerId`, `scorecardSubmissionId`, `submissionRevision` | `tournament:<editionId>:<editionRoundId>` |
| `personal`   | `personalRoundId` (made at round start)  | `visibility` (`public`/`private`; omit = profile setting), `submissionRevision` | `personal:<personalRoundId>`     |

- Don't send `sourceKey`. If you do send one, it must equal the built key, or the call is refused. Never build a
  key from the course and date.
- `submissionRevision` defaults to 1. Use `scorecard_submissions.revision`.
- Build the handicap fields with `buildPlayerRound` / `handicapEligibility` (`lib/platform/playerRounds.ts`).
  Alternatively, send `countsForHandicap: false` and a `notCountedReason`. The database re-checks them either way.

**Result:** `{ result: "created" | "updated" | "unchanged", round }`. If the round is refused, the call **raises**.

## When to call it

| Event | What to do | What happens here |
|---|---|---|
| Initial submit (revision 1 is final) | Call it in the **same transaction** as `submit_trip_scorecard` | `created`: one row for this profile and round |
| Approved correction (revision N > stored) | Call it in the same transaction as the approve step, with `submissionRevision: N` | `updated`: the **same row** is rewritten (same `id` and `created_at`; new `updated_at`). The golfer's hide and visibility choices are kept |
| Failure (validation, conflict, anything raises) | Let it raise, and let your transaction roll back | Nothing is written. Never call it before your own card is saved |
| Replay or retry (offline queue, double tap, re-run) | Call it again with the same revision | `unchanged`. An older revision is also `unchanged`, so a stale retry can never undo a correction |
| Reopened card (correction requested, not yet approved) | **Don't call it** | History keeps the last approved revision |
| Trip, round or scorecard deleted | Nothing | The history row stays. No foreign keys point at the trip side; `source_label` keeps the trip's name |
| Player removed from the trip | Nothing | Their finished rounds stay theirs |
| Account (profile) deleted | Nothing | That profile's history goes with it (the only foreign key) |

One official card feeds one row: `scorecard_submission_id` is unique where set. Re-using a submission id for another
round is refused.

## Recommendations for the scoring side (not built here)

- Participants are identified by `profile_id`, and that is enough for history. You can add `golf_trip_member_id` or
  `tournament_player_id` to scoring participants if scoring needs them, but `player_rounds` doesn't. For
  tournaments, pass `tournamentPlayerId` in `context`.
- A Just Play / personal round needs a stable id made when the round **starts** (for example
  `scoring_groups.id` with `source = 'personal'`). Pass it as `personalRoundId`. That one id is the whole identity, so
  two rounds at the same course on the same day are two rounds.
- Read history with `list_profile_rounds(viewer, owner)` (server: `getProfileRounds` in
  `lib/platform/playerRoundsServer.ts`). Never read `player_rounds` directly.
