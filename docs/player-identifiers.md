# Player identifiers

Persist player relationships using the profile slug, for example `cade-barone`. Profile `id` and `slug` are now the same value. Display names are separate:

- `getPlayerSlug(value)`: resolves historical aliases to a canonical ID.
- `requirePlayerSlug(value)`: validates imported names and rejects unknown players.
- `getPlayerFirstName(value)`: Cade.
- `getPlayerLastName(value)`: Barone.
- `getPlayerDisplayName(value)`: Cade Barone.

Use slugs for record joins, player URLs, roster arrays, scorecards, stats keys, partners, and opponents. Do not store a shortened display name as identity. Existing first-name URLs and favorites resolve through the compatibility lookup. Historical team-only placeholders remain team labels, not invented player identities.

Committed tournament, scorecard, annual stats, and generated career archives use canonical IDs. Both workbook import paths normalize identities before writing. Original workbook snapshots and source record IDs remain intact as provenance.

## Existing database archive rows

Database readers normalize legacy values on read. To convert persisted historical rows, configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY locally, then run:

```sh
npx tsx scripts/migrate-archive-player-ids.ts
npx tsx scripts/migrate-archive-player-ids.ts --apply
npx tsx scripts/migrate-archive-player-ids.ts
```

The first command validates every proposed change and checks participant collisions before any write. The apply command updates identity fields only, checks the previous values to avoid overwriting concurrent edits, and never deletes scores. The last command should report zero pending updates. If interrupted, fix the reported issue and rerun the dry run before applying again.

The local migration could not inspect or update the database because its URL/service-role credentials were unavailable in this workspace.
