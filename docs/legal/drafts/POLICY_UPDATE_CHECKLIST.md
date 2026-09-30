# Policy Update Checklist

Use this whenever a material feature or business model changes.

## Trigger Questions

Did the change affect any of the following?

- personal data collected;
- data purpose;
- data visibility;
- public tournament information;
- vendors/subprocessors;
- cookies/storage/analytics;
- media;
- user-generated content;
- payments/subscriptions;
- advertising/sponsorship/affiliate links;
- marketing communications;
- age/minors;
- jurisdiction;
- account creation/deletion;
- retention;
- security;
- tournament organizer responsibilities;
- app-store distribution.

If yes, review the relevant policy drafts before release.

## Required Review

1. Update `DATA_INVENTORY.md`.
2. Update `lib/compliance/featureRegistry.ts` scope/review metadata as appropriate.
3. Run `npm run compliance:check`.
4. Update affected legal drafts.
5. Record policy version/date.
6. Determine whether users need notice or renewed acceptance.
7. Recheck production browser/network behavior for cookies/SDKs if relevant.
8. Recheck third-party vendor terms.
9. Escalate legal/tax questions listed in `LEGAL_REVIEW_REQUIRED.md`.
10. Do not mark a draft effective until professional review and launch facts are complete.

## Pre-Publication Gate

Before any public legal document becomes effective, confirm:

- correct legal entity;
- correct mailing/contact details;
- actual jurisdictions;
- actual vendors;
- actual feature availability;
- actual data flows;
- actual cookie/storage behavior;
- actual retention schedule;
- account deletion flow exists;
- privacy-rights intake exists;
- final payment/refund/subscription terms if applicable;
- age/minors decision;
- copyright contact/DMCA process if applicable;
- attorney review complete;
- CPA/tax review complete where applicable.
