# Backup and recovery feature review

2026-09-30; scope revision 1; feature ID `backup-recovery`. Status: **review_required**, release decision pending. Owner, security/privacy reviewers, legal entity, jurisdictions, audience ages, approved retention, attorney reviewer and next-review date remain unassigned. No deployment or production execution is approved by this record. Evidence: `BACKUP_RECOVERY_SPEC.md`, `docs/restore-drill.md`, database-backup and health-model tests.

Before: REST data exports only. After: optional explicit operator `pg_dump` runner, manifest/checksum and fixture-only health calculation. No new application collection, public screen, billing, notifications or media upload. Data would flow from Supabase to an operator's restricted local volume; future off-site vendor/region is undecided.

| Data/asset | Purpose and access | Retention / action |
| --- | --- | --- |
| Tournament rows, participant identifiers, profiles, scores, UGC and media links | Recovery; authorized operators only; may include non-user/minor data | Policy pending; preserve deletion/takedown ledger separately and reapply after restore |
| Auth users/identities/hashes and application-stored secrets | Sensitive recovery payload if role can export them; never ordinary archives | Security review required, encrypted storage/transport and key recovery before real operation |
| Manifest, fingerprints, timestamps and Git commit | Restricted integrity/audit evidence; no raw connection URL | Approve retention, trusted signatures and provenance |
| Hosted media bytes / provider secrets | Excluded from this export's independent coverage | Separate rights-aware object backup and secret-manager recovery plan |

All registry categories remain `review_required`; this local review does not claim legal applicability resolved. Category findings:

- Business ownership, contractor ownership, intellectual property and open source: assign recovery account owners, verify code/content rights and PostgreSQL client/dependency obligations; no new package dependency.
- Privacy, personal data, user accounts, retention, account deletion, minors and organizer responsibility: backups duplicate personal information; verify lawful purpose, access, region/transfers, deletion replay, retention/holds and organizer agreements. Scope includes non-users and potentially minors; their applicability is unresolved.
- UGC, media rights, third-party golf content and course reviews: backed-up rows may include protected content and removed contributions. Preserve takedown decisions and avoid republication after restore; byte backup remains separate.
- Security, audit logging and platform rules: enforce restricted encrypted storage, verify Windows ACLs, least-privilege export coverage, monitoring, provider terms and actual restores. Credentials are not logged; hashes are integrity checks, not signatures or encryption.
- Payments, subscriptions, taxes, advertising, sponsorship and affiliate links: no new money/advertising flow; restored records may contain existing state. Future Stripe/email/analytics recovery must reconcile provider truth and avoid duplicate charges, messages or events. Professional applicability remains unresolved.
- Legal review: counsel must assess backup retention/deletion conflicts, transfers, incident duties and content rights. CPA review trigger for future money records remains undecided; tests cannot settle either.

| Follow-up | Track / owner | Acceptance / due |
| --- | --- | --- |
| Approve encrypted backup destination, ACLs, key recovery and least privilege | Engineering/security; unassigned | Before first real export; evidence of access/restore tests |
| Approve retention, deletion replay, vendor/region and operator policy | Policy/operations; unassigned | Before scheduling or transferring real backups |
| Resolve legal bases, contracts, minors/content and retention/hold questions | Attorney; unassigned | Before production-ready designation; restricted decision reference |
| Assign business RPO/RTO, budget and incident authority | Business/operations; unassigned | Before making any recovery promise |
| Verify provider coverage, Auth/media restoration and end-to-end drill | Engineering/operations; unassigned | Before claiming recoverability |

Registry metadata retains unknown assessments. This is an incomplete feature review under `FEATURE_COMPLIANCE_CHECKLIST.md`, not a completed compliance certification.
