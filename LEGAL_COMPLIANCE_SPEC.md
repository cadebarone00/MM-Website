# The Maroon Legal, Privacy & Compliance Framework

Version 1 — 2026-09-29. Internal requirements and review framework; not legal or tax advice, a legal opinion, public terms, or a claim of compliance. Applicability depends on the operating entity, users, jurisdictions, vendors, distribution channel, and actual feature behavior. Qualified counsel and a CPA must resolve applicable professional questions.

## Purpose and boundaries

Identify, track, flag, and document requirements before every significant feature is considered production-ready. Use [the feature checklist](FEATURE_COMPLIANCE_CHECKLIST.md) and [the machine-readable registry](lib/compliance/featureRegistry.ts). Significant changes include new data collection, visibility, sharing, vendors, media, monetization, countries, audiences, automated decisions, and distribution channels, including changes to existing features.

This first version adds documentation and isolated review metadata only. It does not implement consent, deletion, moderation, payments, logging, age checks, security controls, runtime restrictions, or a CI/deployment gate. Existing features have not been audited or certified by this change. Future-feature examples do not imply availability. Application routes, tournament drafts, persistence, migrations and database schemas are outside this change.

The product spec excludes real-money wagering from the commercial platform and restricts existing wagers/fantasy to Maroon entitlements. This framework does not authorize those features or override that boundary. Any proposed money, prizes, purchasable/redeemable coins, contests or fantasy expansion requires a fresh professional review.

## Operating facts to establish

| Fact | Initial state | Evidence to obtain |
| --- | --- | --- |
| Legal entity, business owners, authorized signers and operating locations | Unknown; do not infer from branding or repository access | Entity and ownership records; accountable business owner |
| Countries/states served, customer types, audience ages and store distribution | Unknown | Written launch scope and distribution plan |
| Controller/processor or equivalent responsibilities; organizer/platform allocation | Review required | Data-flow map and counsel-reviewed agreements |
| Vendors, subprocessors, hosting regions and cross-border transfers | Review required | Vendor inventory, contracts and actual configuration |
| Rights to code, designs, brand, logos, media and imported golf data | Review required | Provenance and license/assignment register |
| Merchant of record, subscription seller, payouts and tax registrations | Undecided for future commercial features | Payment flow and CPA/counsel assessment |
| Policy owners, incident contacts and rights-request channels | Unassigned | Named accountable people and verified contact channels |

Do not insert guessed entity names, addresses, age thresholds, legal bases, retention durations, tax rates or response deadlines into public documents. Assign an owner and resolve them before the relevant launch.

## Review workflow and responsibilities

1. The feature owner records a versioned scope, proposed audience and markets, data flows, vendors, money flows, assets and launch channels.
2. Engineering, policy/operations and professional-review owners assess every registry category, including categories not highlighted by the initial risk hints. Unknown applicability remains `review_required`.
3. Each finding becomes a tracked action with an owner, due date, dependency, acceptance evidence and one of the three tracks below. Restricted contracts, personal data and privileged advice stay in access-controlled systems; the registry stores references only.
4. Engineering tests controls; policy owners verify notices and operating procedures; qualified professionals resolve triggered legal/tax questions. Professional review is not a substitute for implementation evidence.
5. The accountable release owner records the reviewed release/commit, date, evidence and any restrictions. Unresolved applicable actions or professional questions prevent a production-ready designation under this internal process. An exception is not `compliant`: narrow or disable the affected release scope and review that new scope.
6. Reopen review when scope, code, data use, audience, law, contracts, vendors or store rules change; also schedule a next-review date. Incident findings reopen affected reviews immediately.

| Track | Responsibility | Typical evidence |
| --- | --- | --- |
| Engineering requirement | Build and verify technical controls | Tests, data maps, authorization checks, deletion rehearsals, UI captures |
| Policy/document requirement | Establish user-facing promises and operational procedures | Versioned notices, terms, support/moderation procedures, contracts, retention schedule |
| Outside attorney/CPA review | Determine legal/tax applicability and review professional questions | Restricted memo/engagement reference and a shareable decision summary; not privileged advice in source control |

### Status semantics

| Status | Internal meaning |
| --- | --- |
| `not_applicable` | Reviewed exclusion for the stated scope, with rationale, reviewer, date and evidence; not a default |
| `compliant` | Documented internal requirements for this category and scope have evidence and completed review; **not** a legal certification or universal conclusion |
| `implementation_required` | A concrete engineering or document/operations action remains |
| `review_required` | Applicability, evidence or professional assessment is unresolved |
| `blocked` | A recorded dependency, unacceptable unresolved risk or missing required approval explicitly prevents readiness |

The registry helper reports record completeness and unresolved categories only. Its success does not establish legality or permission to deploy. All initial entries are unreviewed and remain `review_required`.

## Business ownership

- **Engineering:** Inventory control of domains, repository, hosting, databases, email, app-store and payment accounts; establish authorized access, recovery and offboarding evidence.
- **Policy/document:** Identify the contracting entity, authorized signers, ownership records and responsibility for policies, incidents and customer support.
- **Outside attorney/CPA:** Review entity structure, founder agreements, business registrations, jurisdiction, liabilities and financial responsibilities before contracting or taking revenue.

## Intellectual property

- **Engineering:** Track provenance and usage rights for code, brand, designs, fonts, datasets, images and AI-assisted assets. Preserve source/license references and removal capability.
- **Policy/document:** Maintain an asset register documenting owner, license, allowed uses, territory, duration, attribution, redistribution and derivative-work restrictions.
- **Outside attorney/CPA:** Counsel reviews trademark clearance, ownership uncertainty, infringement claims and licensing scope. A public URL or attribution alone is not evidence of permission.

## Contractor/developer ownership

- **Engineering:** Track contributions and third-party dependencies; verify offboarding and handover of credentials and deliverables without storing contracts in public code.
- **Policy/document:** Obtain signed agreements covering assignments/licenses, confidentiality, pre-existing materials, subcontractors, AI tools and delivery obligations.
- **Outside attorney/CPA:** Counsel verifies chain of title and appropriate assignment/work-for-hire language. Payment or repository access alone does not establish ownership. US work-made-for-hire eligibility has specific conditions; review the [Copyright Office guidance](https://www.copyright.gov/register/se-hire.html).

## Open-source licensing

- **Engineering:** Inventory direct/transitive packages, bundled scripts, fonts, copied snippets and build-delivered assets. Record versions, license texts and required notices; check changes during upgrades.
- **Policy/document:** Maintain a license inventory/SBOM and distribution notices, source-offer obligations where applicable, and an exception process. Missing license information is unresolved, not permission.
- **Outside attorney/CPA:** Counsel reviews unclear licenses, copyleft/network-use obligations, compatibility and commercial redistribution. A dependency scan alone does not clear legal obligations.

## Privacy/data protection

- **Engineering:** Map collection through use, sharing, storage and disposal, including logs, SDKs, exports, cookies and browser storage. Minimize data; test visibility and access controls, preference handling and rights-request fulfillment.
- **Policy/document:** Prepare accurate notices, purposes, recipient/vendor inventory, transfer records and applicable consent/choice procedures. Record each party's responsibilities, legal-basis analysis where relevant, and regional requirements.
- **Outside attorney/CPA:** Counsel determines jurisdictional applicability, privacy rights, legal bases, processor/controller responsibilities and transfers. The [California AG overview](https://oag.ca.gov/privacy/ccpa) is an applicability starting point, not a conclusion that CCPA applies or that other regimes do not.

## User accounts

- **Engineering:** Review authentication, authorization, recovery, session revocation, identity linking, profile visibility and abuse prevention. Do not expose emails or account existence unintentionally.
- **Policy/document:** Define account terms, acceptable use, suspension/appeal, identity disputes and policy version acceptance records. Distinguish authenticated users from organizer-entered participants without accounts.
- **Outside attorney/CPA:** Counsel reviews contract formation, enforceability, required notices and age-related capacity questions.

## Data retention

- **Engineering:** Inventory primary data, archives, audit/security logs, media derivatives, caches, exports, local drafts and backups. Implement deletion/anonymization jobs only after durations and exceptions are approved; test expiry and restore behavior.
- **Policy/document:** For each data class specify purpose, owner, location/vendor, retention trigger, duration, deletion method, backup expiry, legal hold and verification evidence. Durations initially remain undecided.
- **Outside attorney/CPA:** Counsel and CPA resolve statutory/contractual recordkeeping, disputes, financial records, holds and regional conflicts. Tournament archives are not automatically exempt from review.

## Account deletion

- **Engineering:** Plan verified request intake, session revocation and propagation across auth, profiles, memberships, invitations, media, derived records and vendors. Test partial failures, retries and prevention of reappearance after backup restoration. Distinguish deletion from deactivation.
- **Policy/document:** Explain retained exceptions and timelines, tournament ownership transfer, anonymized history, billing cancellation and backup expiry. Define handling for non-account participants and requests submitted outside an active session.
- **Outside attorney/CPA:** Counsel determines identity-verification standards, applicable deadlines, exceptions and organizer/platform responsibilities; CPA advises on financial retention. Account deletion does not automatically cancel a store subscription or erase every lawful record.

## User-generated content

- **Engineering:** Design report/block controls where needed, moderation queues, access restrictions, removal, appeals and evidence preservation. Cover names, bios, comments, reviews, uploads, links and live streams.
- **Policy/document:** Define permitted content, user license grants, prohibited conduct, moderation responsibility, complaint routes, appeals and takedown procedures. Assign response owners.
- **Outside attorney/CPA:** Counsel reviews platform liability, notice/counter-notice requirements, repeat infringement handling and any safe-harbor prerequisites; do not assume safe-harbor protection.

## Media rights

- **Engineering:** Distinguish device-only playback, third-party links/embeds and hosted copies. Document whether metadata, credentials, IP addresses or files leave the device. Restrict uploads and signed URLs; plan removal of originals, thumbnails, transcodes and cached copies.
- **Policy/document:** Record uploader permission, photographer/videographer rights, participant releases where required, music/broadcast licenses, venue permissions and permitted reuse. External hosting does not automatically clear rights or privacy concerns.
- **Outside attorney/CPA:** Counsel reviews publicity/privacy rights, recording consent, minors, music, broadcast/retransmission, territorial restrictions and infringement complaints.

## Third-party golf logos/content

- **Engineering:** Track origins and rights for club/course logos, scorecards, maps, photographs, ratings, statistics and scraped/imported content. Make attribution, replacement and removal possible.
- **Policy/document:** Record written permissions and API/provider terms; distinguish factual references from licensed expression and branding. Do not imply club endorsement or affiliation without authorization.
- **Outside attorney/CPA:** Counsel reviews trademark use, data/database rights, scraping restrictions, fair-use questions and contested ownership before reuse is cleared.

## Security

- **Engineering:** Threat-model tenant isolation, authorization, secrets, uploads, external URLs, webhooks and abuse. Review encryption, least privilege, dependency vulnerabilities, recovery, incident detection and backups. Keep sensitive payloads out of logs.
- **Policy/document:** Maintain incident response, vulnerability intake, access review, vendor assessment and escalation procedures with named owners and exercises.
- **Outside attorney/CPA:** Counsel reviews breach notification, contractual security promises, reporting duties and sensitive-data exposure. No notification deadline is guessed in this framework.

## Payments

- **Engineering:** Map payer, seller, processor, merchant of record and recipients; use provider-managed payment collection where appropriate. Verify webhook authenticity, idempotency, refunds, reconciliation and access revocation; never log card secrets.
- **Policy/document:** Establish pricing, fees, refunds, disputes, receipts, event cancellation and provider terms; document payment-data handling and operational responsibility.
- **Outside attorney/CPA:** Counsel reviews payment-provider restrictions, PCI scope with the appropriate specialist, consumer protections and any fund handling/payout regulation; CPA reviews accounting and tax. Do not treat virtual coins, prizes or entry fees as automatically unregulated.

## Subscriptions

- **Engineering:** Plan clear plan/price/term display, renewal consent evidence, trial transitions, cancellation, entitlement reconciliation and failed-payment handling; test refunds, duplicate and out-of-order events.
- **Policy/document:** Document renewal, trials, price changes, cancellation timing, refunds and support channels for each sales channel.
- **Outside attorney/CPA:** Counsel reviews recurring-billing and cancellation requirements by region and store; CPA reviews revenue recognition and tax treatment. No payment provider or paid plan is approved here.

## App-store rules

- **Engineering:** For each distribution channel, check current UGC moderation, privacy disclosures, account deletion, SDK behavior, permissions, purchases, restore flows and age ratings against actual behavior.
- **Policy/document:** Keep a submission checklist and dated evidence for each platform, storefront and version. Web/PWA availability does not establish native-store eligibility.
- **Outside attorney/CPA:** Review payment steering, subscriptions, regulated content and contractual exceptions when relevant. Consult current [Apple review guidance](https://developer.apple.com/app-store/review/) and [Google Play account-deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en); rules vary and must be rechecked before submission.

## Advertising

- **Engineering:** Design recognizable ad labels, appropriate preference/consent controls, tracking restrictions and ad-removal controls. Inventory all network SDKs, targeting inputs and onward sharing.
- **Policy/document:** Define advertiser eligibility, claim substantiation, placement rules, audience restrictions and disclosures. Review personalized versus contextual advertising separately.
- **Outside attorney/CPA:** Counsel reviews deceptive claims, sensitive/minor targeting, tracking and regional rules. Disclosures must be assessed in context; see [FTC endorsement guidance](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking).

## Sponsorship

- **Engineering:** Support clear sponsor labels and placement expiry; separate paid placement from editorial ranking and enforce approved asset usage.
- **Policy/document:** Record sponsor contracts, logo licenses, deliverables, exclusivity, cancellation and material relationships. Preserve editorial independence rules.
- **Outside attorney/CPA:** Counsel reviews endorsement representations, restricted sponsor industries, rights and contracts; CPA reviews cash/in-kind benefits and revenue treatment.

## Affiliate links

- **Engineering:** Place conspicuous relationship disclosures near relevant links/content, preserve them across responsive layouts, and review tracking redirects/cookies.
- **Policy/document:** Inventory affiliate partners, terms, compensation and editorial conflicts; label recommendations with material relationships.
- **Outside attorney/CPA:** Counsel reviews disclosure sufficiency and data sharing; CPA reviews commission reporting and tax treatment. Disclosure does not cure a false claim.

## Course reviews/rankings

- **Engineering:** Provide review provenance, abuse reporting, correction/moderation history and separation of sponsored placements from ranking inputs. Do not fabricate experiences or silently present ads as independent rankings.
- **Policy/document:** Publish ranking methodology, conflicts and incentive disclosures; define factual correction, response, moderation and appeal practices without selectively hiding criticism for commercial reasons.
- **Outside attorney/CPA:** Counsel reviews defamation, consumer-review rules, review incentives, suppression and provider-data rights. Use the [FTC reviews rule Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers) as a review source, not automated clearance.

## Tournament organizer responsibility

- **Engineering:** Plan scoped administrative permissions, invitation controls, visibility previews, ownership transfer, exports and participant correction/removal processes. Privacy choices must match actual destinations.
- **Policy/document:** Allocate responsibility for entered participant data, invitations, media permissions, event rules, payments, disputes, minors and notices through organizer terms. Identify contacts and escalation routes.
- **Outside attorney/CPA:** Counsel reviews responsibility allocation, event liability, waivers, authority to provide others' data and privacy roles. Organizer acceptance does not transfer every platform obligation away.

## Minors/age handling

- **Engineering:** Design audience/age handling only after review: minimize age data, plan guardian workflows if needed, and handle reports or discovery of underage use. Review public profiles, location, photos, ads and messaging separately.
- **Policy/document:** Establish intended audience, age policy, parental notices/consent where applicable and an underage-data response procedure. Do not invent a universal age threshold or assume a terms checkbox resolves risk.
- **Outside attorney/CPA:** Counsel determines applicable child privacy, consent and contract-capacity requirements by region. [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) includes audience and actual-knowledge considerations; it is not the complete global analysis.

## Taxes

- **Engineering:** Support accurate transaction/fee/refund and payout records, reconciliation, configurable tax handling and restricted access to required tax information once the approved model is known.
- **Policy/document:** Identify seller/merchant of record, accounting owner, locations, product classification, invoicing, payout recipients, registrations and retention requirements.
- **Outside attorney/CPA:** CPA reviews income, sales/use, VAT/GST, nexus, marketplace obligations, withholding, contractor/prize reporting and deadlines as applicable; counsel reviews structural questions. The [IRS business tax overview](https://www.irs.gov/businesses/business-taxes) explains that business form affects US tax obligations; no rate or threshold is assumed here.

## Audit logging

- **Engineering:** Plan minimal, access-controlled records of actor/reference, action, time, scope, result and correlation ID for permissions, consent/policy changes, publishing, moderation, deletion and financial events. Review tamper resistance and avoid raw tokens, payment data and unnecessary personal content.
- **Policy/document:** Define purpose, access, retention, review frequency, export and legal-hold handling; link evidence to reviewed releases without storing privileged advice in logs.
- **Outside attorney/CPA:** Counsel/CPA review evidentiary, privacy and financial-record requirements. More logging is not automatically safer; audit data has its own deletion and security requirements.

## Professional legal-review triggers

Create an attorney/CPA action before the relevant production release for: unknown ownership or asset rights; new countries or child audiences; new personal/sensitive data use or cross-border vendors; hosting UGC or responding to infringement; scraping or third-party golf content; paid plans, recurring billing, payouts, entry fees or prizes; real-money/convertible-value wagers or fantasy; native app distribution; targeted ads, sponsors or affiliates; contested rankings/reviews; material changes to terms, liability or organizer responsibilities; and unresolved deletion/retention conflicts.

An incident, demand, regulator contact, credible infringement claim or suspected breach requires immediate escalation to the accountable business/security owner and appropriate counsel. Preserve only necessary evidence under an approved process; do not improvise admissions, notification promises or deletion of relevant records. Tax registrations, sales territories, entity changes, subscriptions, payouts and sponsored/in-kind revenue trigger CPA assessment.

Each trigger records the question, affected feature/version, markets, reviewer needed, decision reference, permitted scope, unresolved conditions and next-review date. A developer or coding agent cannot substitute its judgment for professional approval.

## Notifications and analytics cross-cutting checks

Invitations and notifications require a channel/purpose inventory, recipient authority, token expiry, suppression, unsubscribe/preferences where appropriate, and vendor retention review. Separate essential service messages from marketing; consider email, SMS and push separately. Counsel assesses jurisdiction-specific rules; consult [FTC commercial-email guidance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).

Analytics require event/identifier and SDK inventories, purposes, consent/opt-out analysis, retention, redaction, vendor sharing, and verification of pre-choice/post-opt-out behavior. Do not label analytics anonymous merely because names are absent. Session replay and advertising identifiers require explicit review.

## Evidence, maintenance and source limits

Sources above were consulted on 2026-09-29 as official starting points for issue identification. They do not establish The Maroon's jurisdictions or compliance and do not exhaust non-US requirements. Recheck the operative law, contracts and platform terms with appropriate reviewers before launch; search summaries or old policy snapshots are not release evidence.

Store a completed checklist and non-sensitive evidence references for each significant feature/release. Keep contracts, legal advice, identity documents and personal/tax information in restricted storage. Record feature owner, scope revision, reviewed commit, assessment and next-review dates; changes invalidate prior sign-off until reassessed.

## What changed

**2026-09-29 — Documentation/configuration only; not deployed or enforced.** Established the first internal framework, feature review registry and reusable checklist. Before this change there was no framework in these files; afterward significant future features have a common way to record unresolved requirements and evidence. No existing feature is newly declared compliant and no runtime behavior or deployment workflow changes.
