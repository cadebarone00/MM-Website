# Round & Format Archive course/tee source

Apply `supabase/round_format_setups.sql` after `archived_handicap_tees.sql` and `course_library_tee_setups.sql` before using the new write endpoint. The migration preserves unanimous existing assignments and creates a shared record keyed by season year and true round number. Round 0 is the historical individual round. No tee or date is inferred from a course name.

The Career Stats Round & Format Archive receives `entry.setup` (also `orphan.setup`) with `seasonYear`, `round`, `courseName`, `datePlayed`, and `teeSetup`. It displays saved metadata now. The planned editing controls can use:

- `GET /api/portal/tiger/round-format-setups` returns `{ ok: true, setups }`, including future seasons.
- `POST /api/portal/tiger/round-format-setups` accepts `{ seasonYear, round, courseId, teeSetId, datePlayed }`. Both endpoints require Tiger/host access. The server resolves the selected locked Course Library tee and snapshots its rating, slope, name, and holes; client-provided rating/slope are not accepted.

One record applies to the whole tournament round. This matches the existing field-wide tee assignment behavior. If players used different tees within a round, player-specific overrides need a separate extension before those rounds can be represented correctly.

The old Scorecard Archive assignment endpoint now writes this same shared source. Handicap reads prefer it over legacy player snapshots. Missing shared-table migration falls back to old snapshots for reads; saves clearly report the missing prerequisite. Later Course Library edits do not silently alter an already-saved historical rating. Resaving the round's tee selection deliberately refreshes that snapshot.

Future live rounds automatically populate the source when the course and matchups are locked. Subsequent pre-start changes update live-sourced setups; changes after play begins and explicit Tiger archive overrides are preserved. The handicap reader now includes confirmed Career Archive holes for future seasons, excludes incomplete/pickup rounds and alternate shot, and avoids double counting a year/round also present in the historical archive. No new hardcoded tournament year is required.

This adds the storage, API, shared display data, and handicap integration. It does not enter the missing historical tees/dates or build the editing controls the user is adding to Round & Format Archive.
