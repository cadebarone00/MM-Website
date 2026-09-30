# Data Retention Policy — Internal Draft

**DRAFT — INTERNAL — ATTORNEY/CPA REVIEW REQUIRED**

No final durations are approved yet.

## Principles

- retain only what serves an approved purpose;
- define a retention trigger and end condition for each class;
- separate active data, archives, logs, exports, and backups;
- account for legal holds, disputes, fraud/security, tax/accounting, and historical competition records;
- ensure deletion propagates to processors where required;
- prevent expired data from being permanently restored from backups.

## Retention Classes Requiring Decisions

| Data class | Trigger | Duration | End action |
| --- | --- | --- | --- |
| Account/profile data | account lifecycle | TBD | delete/anonymize |
| TournamentPlayer history | tournament/history lifecycle | TBD | retain/de-link/anonymize as approved |
| Tournament configuration | tournament lifecycle | TBD | archive/delete |
| Scores/results/stats | event finalization | TBD | historical retention decision |
| Invitations | sent/expired | TBD | delete/anonymize |
| Auth/session/security records | creation/event | TBD | delete |
| Application logs | event date | TBD | delete |
| Audit events | event date | TBD | retain/delete based on risk |
| Support records | case closed | TBD | delete/anonymize |
| Privacy requests | request closed | TBD | retain minimal proof |
| Independent DB backups | backup creation | TBD | secure expiry |
| Provider backups/PITR | provider policy | TBD | expire automatically |
| Hosted Maroon media | upload/event lifecycle | TBD | delete/archive |
| Payment/tax records | transaction | future/CPA review | statutory/business retention |

## Backups

Deletion from the live database may not immediately remove information from immutable backups.

Approved policy must define:

- backup retention;
- access controls;
- restoration procedure;
- how deleted data is prevented from being reintroduced permanently after restore.

## Legal Holds

Document a process to suspend ordinary deletion when information must be preserved for litigation, investigation, security, tax, or other lawful obligations.
