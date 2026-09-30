# Backup & Recovery specification

2026-09-30. Implemented locally; no production backup, restore, provider inspection, PITR activation or deployment was performed. Accountable operator and business approver: to be assigned. This is a recovery design, not a recovery guarantee.

## Audit: protections and gaps

| Asset | Existing protection found | Limits / required recovery evidence |
| --- | --- | --- |
| Application data | `npm run backup:production`, `scripts/backup-production.ts`, `lib/platform/tableBackup.ts`: authenticated GET exports of OpenAPI-discovered REST resources, 1,000-row pages, ordering and count checks; JSON and `_row-counts.json` in ignored `out/backups/` | Only exposed resources accessible to the service key. Not every database table; discovery is not a verified schema inventory. No shared transaction snapshot, schedule, encryption, off-site copy, checksum or manifest. Concurrent updates can produce inconsistent exports even if counts match. Provider error bodies currently reach its error log: treat existing exporter diagnostics as restricted. |
| Database schema | SQL under `supabase/`, local migration regression harness | Git describes intended schema, not verified deployed state. REST export omits schema, sequences, constraints, indexes and grants. |
| Functions, triggers, policies | Checked-in SQL and rollback files | No independent capture of deployed drift in the REST export. Git files alone do not prove rebuild order or completeness. |
| Auth | Supabase Auth and profile references | REST backup does not verify or capture `auth` schema users, identities, password hashes or sessions. Profiles alone cannot restore login. |
| Hosted media | Founding Maroon uses Supabase Storage and R2 (`lib/r2/client.ts`); some assets are tracked code assets | Database rows/URLs and storage metadata are not object bytes. No complete independent media backup was found. The ignored local video is not protected by Git. Inventory bucket keys, sizes, hashes, policies and rights separately. |
| Commercial media | `device_external` links / device content | Server-held link/configuration rows need database recovery; external files and device media are the organizer/device owner's responsibility, not a server backup promise. |
| Application code | Git history; GitHub is the intended remote source copy | Verify pushed commit, remote access, protected branches and an independent repository mirror. Uncommitted/ignored files, hosting configuration and dependencies are not guaranteed by GitHub. |
| Environment variables | Ignored `.env*`; deployment settings | Not backed up by this work. Maintain approved secret-manager recovery and separate non-secret configuration inventory. Never put credentials in Git, manifests, tickets or ordinary backup archives. |
| External providers | Supabase plus media/hosting integrations | Account access, DNS, project settings, OAuth/SMTP configuration and vendor service state require separate recovery records. Future Stripe, email and analytics need vendor-specific export/replay and reconciliation plans. |

Existing repair tooling (`repair-historical-archive.ts`, `archive-repair-sql.ts`) preserves a scoped archive snapshot and uses stale-data checks. Its local cache artifacts and same-database repair table do not protect against provider/database loss. C1/C2 rollback SQL and local PGlite migration tests are useful but are not full restores. Google Sheet handoff documents describe a future backup; they explicitly do not establish working sync or failover. No migration/backfill code was changed.

## Production database and independent export

Primary system: production Supabase PostgreSQL. Actual plan, provider backup timestamps, retention, PITR status and successful restore evidence are **unknown** until an authorized operator records them. Do not infer protection from the presence of a Supabase project.

New optional command: `npm run backup:database`. An operator must inject `PRODUCTION_DATABASE_URL` through a protected process environment; no `.env` fallback or generic `DATABASE_URL` is accepted. Use the provider's direct or session connection suitable for `pg_dump`, with database credentials and TLS. Only the `sslmode` URI option is supported. Install a compatible PostgreSQL client on PATH (prefer matching server major; older clients cannot dump newer servers). Missing input/client fails closed. The command is read-only at the database but may consume resources and take locks; schedule deliberately. It was not executed against production.

The command writes `out/backups/database/<UTC timestamp>-<UUID>/database.dump` using PostgreSQL custom format, and `manifest.json`. It requests all schemas without filters, preserving database-level definitions/data available to that role. Permission errors fail the attempt. Verify `auth`, functions, triggers, RLS policies, grants, sequences, extensions and storage metadata in the archive inventory and a restore drill before claiming coverage. A logical dump is not cluster backup: global roles/tablespaces, provider-managed components and service configuration need separate approved inventories. Provider role restrictions and managed-schema conflicts may require a reviewed restore plan. Do not bypass them with a blanket success claim.

The manifest records ID, UTC start timestamp, production environment, a hashed host/port/database identifier, Git commit if available, method, running/success/failed state and file size/SHA-256. Row counts are explicitly null: separate live counts would not represent the dump's snapshot. Interrupted attempts remain running or failed and must not be used. No manifest means an incomplete attempt. Success means a dump was produced and hashed, **not** that recovery was tested. Compare the database fingerprint against a restricted expected-project inventory; the environment label cannot prove the operator supplied the right project. Hashes detect accidental corruption, not malicious replacement; keep a signed/trusted manifest copy separately for that threat.

Credentials are passed only in the child environment and child diagnostics are suppressed. Local process administrators can still read process memory/environment. PostgreSQL exports can contain auth hashes, personal data and application-stored secrets: treat them as highly sensitive, not ordinary archives. There is no encryption/upload automation here. Before real use, select an access-restricted encrypted volume, verify Windows ACLs (POSIX modes do not enforce Windows ACLs), and arrange encrypted off-site transfer with separately recoverable keys. Keep manifests restricted too. No cleanup or restore command is supplied.

## Provider backups, Auth and PITR readiness

Provider backups and independent dumps complement each other. Provider recovery may include Auth database records, but application compatibility, login, identities, MFA/session behavior and OAuth/SMTP settings need explicit validation. Recovery into a new project also requires correct project URLs, keys, redirect settings and ownership access. Do not replay real emails or notifications from a practice environment.

PITR would reduce the gap between periodic snapshots by allowing recovery to a point within the retained log window. It does not back up object bytes or replace off-site copies and drills. With simultaneous tournaments, a shared database rollback can discard valid scores from every event after the recovery point. Rehearse restoring to an isolated database and reconciling affected data before deciding on any production recovery.

PITR remains disabled/unverified by this work. Future readiness checklist:

- [ ] Confirm provider plan, PostgreSQL version and support for intended restore destination.
- [ ] Obtain cost approval; record accountable owner and billing access.
- [ ] Choose retention window against approved RPO and incident discovery delay.
- [ ] Verify operator access, MFA and emergency account recovery.
- [ ] Record downtime, new-project/in-place options, credentials and restore procedure.
- [ ] Complete isolated restore tests including concurrent tournament impact.
- [ ] Alert on backup failures, stale evidence, log retention and billing/plan changes.

Current provider behavior must be checked before execution. References: [Supabase database backups](https://supabase.com/docs/guides/platform/backups), [restore to a new project](https://supabase.com/docs/guides/platform/clone-project), [Supabase restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html). Provider documentation distinguishes database contents from storage object bytes; no project-specific backup availability was verified here.

## Recovery objectives: decisions pending

RPO is tolerable data loss; RTO is time to restore usable service, including validation. The following are discussion examples only, not approved promises or current capability:

| Tier | Example RPO for discussion | Example RTO for discussion | Decision evidence required |
| --- | --- | --- | --- |
| Development | One working day | Next working day | Rebuildable fixtures and developer availability |
| Beta | Several hours | Several hours | Scheduled independent exports, measured restore and support coverage |
| Live production tournament | Minutes or less | Tens of minutes | PITR/independent capture design, staffed response and measured end-to-end drill |

Business owner, approved RPO/RTO, measurement scope, backup frequency, alert thresholds, budget, date and exceptions: all pending. Unsaved/device-only inputs are not recovered by database PITR. Measure detection delay, restore duration and correctness checks separately.

## Proposed retention architecture

Future architecture: frequent daily copies, selected weekly/monthly recovery points, plus pinned pre/post-migration artifacts linked to Git and drill evidence. Durations and copy counts require policy/cost approval; none are hardcoded. Use encrypted off-site storage in a separate failure/account domain, restricted backup writers/readers, immutability where appropriate, monitored transfers and periodic integrity verification. Protect manifests and key recovery separately. Keep migration backups until rollback windows and validation are formally closed. Legal holds and deletion requests must be reconciled, and erased records must not silently reappear after restore. No automatic deletion is implemented.

## Health model and operational readiness

`lib/platform/backupHealth.ts` is an isolated pure model with explicit clock and caller-supplied planning thresholds. Fixtures only; no API, route or public UI. It exposes provider/independent timestamps, PITR state, restore-drill timestamp/age, independent backup age, database size, warnings and healthy/warning/critical/unknown status. Missing or future evidence cannot be healthy. Either backup channel exceeding the critical threshold is critical; no usable backup timestamps is unknown. A healthy fixture is not production readiness or compliance approval. Wire only validated successful backup/drill evidence later, with provenance and its own observation freshness. UI deferred to avoid shared-route work.

Follow [the restore drill](docs/restore-drill.md), [migration checklist](docs/production-migration-checklist.md) and [feature review](docs/backup-recovery-review.md). Scheduling, encryption/upload, media export, provider monitoring, signed manifests, snapshot row-count capture and an actual measured restore remain outstanding.
