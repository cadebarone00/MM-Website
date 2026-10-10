/**
 * Internal review metadata only. No runtime, persistence or deployment integration.
 * `compliant` means evidence-backed internal review, never legal certification.
 * See LEGAL_COMPLIANCE_SPEC.md and FEATURE_COMPLIANCE_CHECKLIST.md.
 */
export const COMPLIANCE_CATEGORIES = [
  "business-ownership", "intellectual-property", "contractor-ownership", "open-source",
  "privacy", "personal-data", "user-accounts", "retention", "account-deletion",
  "ugc", "media-rights", "third-party-golf-content", "security", "payments",
  "subscriptions", "taxes", "advertising", "sponsorship", "affiliate-links",
  "course-reviews", "organizer-responsibility", "minors", "platform-rules",
  "audit-logging", "legal-review",
] as const;

export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];
export const COMPLIANCE_STATUSES = [
  "not_applicable", "compliant", "implementation_required", "review_required", "blocked",
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];
export type ReviewTrack = "engineering" | "policy_document" | "attorney_cpa";

export interface ComplianceAction {
  id: string;
  track: ReviewTrack;
  requirement: string;
  owner: string | null;
  dueDate: string | null; // YYYY-MM-DD; null means unassigned, not waived.
  status: "open" | "blocked" | "done";
  evidence: string[]; // Non-sensitive references only; never privileged advice or personal data.
}

export interface CategoryAssessment {
  applicability: "undetermined" | "applicable" | "not_applicable";
  status: ComplianceStatus;
  rationale: string;
  owner: string | null;
  reviewer: string | null;
  reviewedOn: string | null;
  nextReviewOn: string | null;
  evidence: string[];
  actions: ComplianceAction[];
}

export interface FeatureComplianceRecord {
  id: string;
  name: string;
  scope: string;
  scopeRevision: number;
  owner: string | null;
  jurisdictions: string[]; // Empty = unknown; does not mean worldwide clearance.
  audience: string | null;
  distributionChannels: string[];
  reviewedCommit: string | null;
  checklistReference: string | null;
  releaseReview: {
    decision: "pending" | "recorded";
    reviewer: string | null;
    reviewedOn: string | null;
    scopeRevision: number | null;
    evidence: string[];
  };
  /** Triage hints, not findings or exclusions. Every category still requires assessment. */
  attentionCategories: ComplianceCategory[];
  assessments: Record<ComplianceCategory, CategoryAssessment>;
}

interface FeatureSeed {
  scopeRevision?: number;
  id: string;
  name: string;
  scope: string;
  attentionCategories: ComplianceCategory[];
}

const seeds: FeatureSeed[] = [
  {
    id: "trip-draft-room", name: "Trip draft room",
    scope: "Two-team room-local Snake/Straight drafting with existing loaded player names and handicaps, searchable available and team rosters. No server writes, official assignment, new vendor, messaging, payment or multiplayer synchronization. Picks discarded on close. Findings and follow-ups: docs/trip-draft-room-review.md.",
    attentionCategories: ["privacy", "personal-data", "security", "retention", "intellectual-property", "ugc", "organizer-responsibility", "legal-review"],
  },
  {
    id: "trip-round-momentum", name: "Round momentum and closed-app push alerts",
    scope: "Member-only durable trip feed, explicit device/trip Web Push opt-in, attested aces and gross birdie streaks at 2/3/4, owner-approved response buckets and linked official matches won before hole 16. Actual organizer-set round pars lock at first score; no guessed par, net birdies or generic match winner inference. Encrypted push outbox with bounded leases/retries, suppression, expired-endpoint cleanup and device sign-out cleanup. Findings, setup and unresolved legal/retention/provider review: docs/trip-momentum-review.md. Implemented locally; no production migration, secrets, scheduler or device delivery verified.",
    attentionCategories: ["privacy", "personal-data", "user-accounts", "ugc", "security", "retention", "account-deletion", "intellectual-property", "third-party-golf-content", "organizer-responsibility", "minors", "platform-rules", "audit-logging", "legal-review"],
  },
  {
    id: "golf-trip-chat-layout", name: "Golf Trip chat layout",
    scope: "Memory-only inbox, pinned Trip Chat, search over supplied match participants and local text composition. No message transport, persistence, notifications, attachments, calls or encryption claims. Findings and follow-ups: docs/golf-trip-chat-review.md.",
    attentionCategories: ["privacy", "personal-data", "ugc", "security", "retention", "account-deletion", "intellectual-property", "organizer-responsibility", "platform-rules", "legal-review"],
  },
  {
    id: "development-haptics-debugger", name: "Development haptics debugger",
    scope: "Local /dev-only intensity/duration/name events from shared haptic helpers; same-origin frame validation, bounded memory-only meter and cancellable phone-frame vibration with reduced-motion support. Native Capacitor feedback remains separate and unchanged. No new data collection, persistence, permissions or production UI. Findings and unresolved distribution/license review: docs/haptics-review.md.",
    attentionCategories: ["security", "open-source", "intellectual-property", "platform-rules", "legal-review"],
  },
  {
    id: "development-app-simulator", name: "Development app viewport simulator", scopeRevision: 3,
    scope: "Development-only /dev control center frames existing routes; source-scoped browser-local setup links real/mock/busy Settings to Home/Golf/Venue/Itinerary, including editable empty travel, actual tournament session mapping and isolated dev scoring/round state. Imported standings and untouched results are preserved; localStorage persistence/retention remain review_required. local viewport/inset/page controls, real tournament adapter or generic/empty/busy fixtures and validated memory-only presentation state. Right-hand canvas review tools retain bounded memory-only stroke history; user-requested local 2x PNG clipboard/download captures the same-origin visible screen and annotations with optional frame; no upload or capture service. Existing page permissions/session remain effective; no auth simulation, source mutation, database or scoring-engine changes. Findings, limitations and follow-ups: docs/dev-simulator-review.md.",
    attentionCategories: ["privacy", "personal-data", "security", "retention", "ugc", "intellectual-property", "media-rights", "open-source", "third-party-golf-content", "organizer-responsibility", "platform-rules", "legal-review"],
  },
  {
    id: "golf-trip-games-preview", name: "Player-created side games preview", scopeRevision: 2,
    scope: "Development preview only: fictional players and rounds, scope/group compatibility, player selection and per-game setup in component memory. Isolated v1 engines and manual/deterministic gross or preview-net hole scoring, Wolf choices, Heads/Tails assignments and results in component memory. No persistence, invitations, money or official Competition changes. Findings and follow-ups: docs/golf-trip-games-review.md.",
    attentionCategories: ["privacy", "personal-data", "ugc", "security", "retention", "intellectual-property", "organizer-responsibility", "legal-review"],
  },
  {
    id: "golf-trip-competition-preview", name: "Golf Trip competition settings preview", scopeRevision: 2,
    scope: "Development-only real/mock/busy competition and schedule setup persists in source-scoped browser localStorage and reaches shared Home/Golf/Venue/Itinerary; imported standings and untouched results are preserved. Legacy provider-backed round arrays remain memory-only. UI locking only, no production authorization or official scoring. Local persistence/retention and source rights remain review_required. Findings: docs/golf-trip-competition-review.md and docs/dev-simulator-review.md.",
    attentionCategories: ["privacy", "personal-data", "security", "retention", "intellectual-property", "organizer-responsibility", "legal-review"],
  },
  {
    id: "backup-recovery", name: "Backup and recovery operations",
    scope: "Explicit operator-only PostgreSQL export and isolated health model; no production execution, retention deletion, provider integration or restore automation. Findings and follow-ups: docs/backup-recovery-review.md.",
    attentionCategories: ["privacy", "personal-data", "user-accounts", "security", "retention", "account-deletion", "ugc", "media-rights", "platform-rules", "audit-logging", "legal-review"],
  },
  {
    id: "tournament-creation", name: "Tournament creation",
    scope: "Review draft names, dates, privacy choices and organizer-entered data. Reassess before any persistence, public site or invitation launch; this record does not connect creation to storage.",
    attentionCategories: ["privacy", "personal-data", "ugc", "security", "retention", "organizer-responsibility", "legal-review"],
  },
  {
    id: "public-tournament-site", name: "Public tournament site",
    scope: "Public /t/[tournament]/[year] pages for published customer tournaments: player names, team membership/captaincy, courses, schedule, rules and organizer-supplied description/media links. Visibility public/unlisted (noindex)/private (members only); emails, handicaps and internal ids are never served. Review participant consent to being named publicly, organizer authority to publish, removal/unpublish requests, external link handling and retention of past editions. Not yet in production.",
    attentionCategories: ["privacy", "personal-data", "ugc", "media-rights", "security", "retention", "organizer-responsibility", "minors", "legal-review"],
  },
  {
    id: "creator-access-requests", name: "Creator access requests",
    scope: "Beta requests to create tournaments (/tournaments/request-access): the signed-in account's email (snapshot), requester name, tournament/group name, year, approximate player count, optional location and optional free-text note; status pending/approved/denied, reviewer, review time and a decision note shown to the requester. Platform-admin review at /admin/tournament-access; approval writes tournament_creator_access. No notifications are sent. Review purpose limitation, free-text content, retention of denied/old requests, deletion with the account (cascade), reviewer access and disclosure in the privacy notice. Not yet in production.",
    attentionCategories: ["privacy", "personal-data", "user-accounts", "security", "retention", "account-deletion", "audit-logging", "platform-rules", "legal-review"],
  },
  {
    id: "tournament-activity", name: "Tournament activity and announcements",
    scope: "Per-edition activity feed: plain-text commissioner announcements (everyone or players only) and automatic count-only events (published, players/teams/schedule changes). Visibility follows the tournament's public/unlisted/private rules first; players-only posts reach only players, commissioners and platform admins; author names only to members. Review organizer-authored content (UGC), moderation/removal, statements about named people, retention of posts and deletion with accounts (actor set null). No notifications. Not yet in production.",
    attentionCategories: ["privacy", "personal-data", "ugc", "security", "retention", "organizer-responsibility", "platform-rules", "legal-review"],
  },
  {
    id: "player-accounts", name: "Player accounts", scopeRevision: 2,
    scope: "Review authentication, recovery, sessions, age handling, account terms, identity linking and deletion, including non-account participants. Platform home/account presentation review: docs/platform-entry-review.md; existing credentials and API destinations retained, with email then password signup, generated default profile identifiers, preserved invitation matching and no mobile authentication. Findings and unresolved follow-ups: docs/signup-review.md.",
    attentionCategories: ["privacy", "personal-data", "user-accounts", "account-deletion", "security", "retention", "minors", "platform-rules", "legal-review"],
  },
  {
    id: "live-scoring", name: "Live scoring",
    scope: "Review participant identity, shared scoring records, authorization, corrections, public results, archives and audit evidence without changing scoring implementation.",
    attentionCategories: ["privacy", "personal-data", "security", "retention", "audit-logging", "organizer-responsibility", "legal-review"],
  },
  {
    id: "player-profiles", name: "Player profiles",
    scope: "Review names, photos, bios, handicap/history, cross-tournament linking, audience visibility, corrections and deletion. Profile Rounds reuses authenticated own-player submitted and archived handicap history in a read-only view; findings and unresolved follow-ups: docs/profile-rounds-review.md.",
    attentionCategories: ["privacy", "personal-data", "ugc", "media-rights", "retention", "account-deletion", "minors", "legal-review"],
  },
  {
    id: "invitations", name: "Invitations",
    scope: "Review organizer-supplied recipient details, authority to contact, service versus marketing purpose, token security, suppression and expired invitations.",
    attentionCategories: ["privacy", "personal-data", "security", "retention", "advertising", "organizer-responsibility", "legal-review"],
  },
  {
    id: "external-device-media", name: "External/device media",
    scope: "Commercial V1 supports none or device_external media. Distinguish device-only playback from embeds and external links; device_external does not authorize copying uploads into Maroon-hosted storage. Review transmission, tracking, licensing, terms and removal capability.",
    attentionCategories: ["privacy", "intellectual-property", "ugc", "media-rights", "security", "retention", "platform-rules", "legal-review"],
  },
  {
    id: "hosted-media", name: "Hosted media",
    scope: "maroon_hosted is reserved for future commercial use, not commercial V1. The founding Maroon Tournament may retain its existing hosted media behavior. Review uploads, playback, music/participant rights, moderation, caches, retention and access; this record does not enable hosting.",
    attentionCategories: ["privacy", "personal-data", "intellectual-property", "ugc", "media-rights", "security", "retention", "minors", "platform-rules", "legal-review"],
  },
  {
    id: "advertising", name: "Advertising",
    scope: "Review labels, ad vendors/SDKs, targeting inputs, consent/choices, advertiser claims, audience restrictions and revenue handling before introducing or changing ads.",
    attentionCategories: ["advertising", "privacy", "personal-data", "minors", "retention", "payments", "taxes", "platform-rules", "legal-review"],
  },
  {
    id: "sponsorships", name: "Sponsorships",
    scope: "Review sponsor contracts, logo/content rights, disclosed relationships, placement terms, editorial independence and cash/in-kind benefits.",
    attentionCategories: ["sponsorship", "advertising", "intellectual-property", "media-rights", "payments", "taxes", "legal-review"],
  },
  {
    id: "subscriptions", name: "Subscriptions",
    scope: "Future commercial review: seller/merchant of record, plans, recurring consent, trials, refunds, cancellation, billing records, store channels and entitlement reconciliation.",
    attentionCategories: ["subscriptions", "payments", "taxes", "privacy", "personal-data", "security", "retention", "platform-rules", "audit-logging", "legal-review"],
  },
  {
    id: "course-reviews", name: "Course reviews",
    scope: "Review submitted reviews, editorial rankings, imported course content, methodology, incentives, paid placement, moderation, factual disputes and appeals.",
    attentionCategories: ["course-reviews", "ugc", "intellectual-property", "third-party-golf-content", "advertising", "sponsorship", "affiliate-links", "privacy", "legal-review"],
  },
  {
    id: "affiliate-links", name: "Affiliate links",
    scope: "Review commission relationships, disclosure placement, redirects/cookies, partner terms, recommendation independence and commission accounting.",
    attentionCategories: ["affiliate-links", "advertising", "privacy", "personal-data", "retention", "taxes", "platform-rules", "legal-review"],
  },
  {
    id: "notifications", name: "Notifications", scopeRevision: 2,
    scope: "Trip Web Push implementation and unresolved findings: docs/trip-momentum-review.md. Review email, SMS and push separately: service/marketing purpose, recipient authority, preferences, opt-out/suppression, lock-screen exposure and vendor retention.",
    attentionCategories: ["privacy", "personal-data", "advertising", "security", "retention", "minors", "platform-rules", "legal-review"],
  },
  {
    id: "analytics", name: "Analytics",
    scope: "Review events, identifiers, SDKs, session replay, cookie/device storage, vendor sharing, retention, redaction and consent/opt-out behavior; anonymity is not assumed.",
    attentionCategories: ["privacy", "personal-data", "security", "retention", "advertising", "minors", "platform-rules", "legal-review"],
  },
];

function createUnreviewedRecord(seed: FeatureSeed): FeatureComplianceRecord {
  const assessments = Object.fromEntries<CategoryAssessment>(COMPLIANCE_CATEGORIES.map(category => [category, {
    applicability: "undetermined", status: "review_required",
    rationale: seed.attentionCategories.includes(category)
      ? "Initial triage flags this category. Determine applicability and record requirements/evidence for the proposed scope."
      : "Not highlighted by initial triage; applicability still requires documented assessment. Omission is not an exemption.",
    owner: null, reviewer: null, reviewedOn: null, nextReviewOn: null, evidence: [], actions: [],
  } satisfies CategoryAssessment])) as Record<ComplianceCategory, CategoryAssessment>;
  return {
    ...seed, scopeRevision: seed.scopeRevision ?? 1, owner: null, jurisdictions: [], audience: null,
    distributionChannels: [], reviewedCommit: null, checklistReference: null,
    releaseReview: { decision: "pending", reviewer: null, reviewedOn: null, scopeRevision: null, evidence: [] },
    assessments,
  };
}

// Persist reviewed or partially reviewed records here by stable feature ID.
// Keep privileged advice and personal information in restricted systems, not this file.
const reviewedRecords: Partial<Record<string, FeatureComplianceRecord>> = {};

export const featureRegistry = {
  schemaVersion: 1,
  createdOn: "2026-09-29",
  purpose: "Internal issue tracking; not legal advice, certification, or a runtime/deployment gate.",
  documentation: [
    "LEGAL_COMPLIANCE_SPEC.md", "FEATURE_COMPLIANCE_CHECKLIST.md",
    "OPEN_SOURCE_LICENSES.md", "DATA_INVENTORY.md",
    "LEGAL_REVIEW_REQUIRED.md", "INITIAL_COMPLIANCE_AUDIT.md",
  ],
  // Descriptive compliance metadata only; no runtime entitlement changes.
  mediaPolicy: {
    commercialV1: ["none", "device_external"],
    reservedFuture: ["maroon_hosted"],
    foundingMaroonExistingHostedMedia: "retained",
  },
  features: seeds.map(seed => reviewedRecords[seed.id] ?? createUnreviewedRecord(seed)),
};

const hasText = (value: string | null) => Boolean(value?.trim());
const hasEvidence = (values: string[]) => values.some(value => value.trim().length > 0);
function isDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Record-quality findings for trusted typed metadata, not an untrusted JSON validator.
 * Empty findings mean complete review metadata ONLY, never legal or release approval.
 * Pass today's date explicitly so stale review evidence is not silently accepted.
 */
export function reviewRecordFindings(record: FeatureComplianceRecord, asOf: string): string[] {
  if (!isDate(asOf)) throw new Error("asOf must be a real YYYY-MM-DD date.");
  const findings: string[] = [];
  if (!hasText(record.owner)) findings.push("Assign an accountable feature owner.");
  if (!hasText(record.scope) || !Number.isInteger(record.scopeRevision) || record.scopeRevision < 1) findings.push("Record a versioned feature scope.");
  if (!hasEvidence(record.jurisdictions) || !hasText(record.audience) || !hasEvidence(record.distributionChannels)) findings.push("Define jurisdictions, audience and distribution channels.");
  if (!hasText(record.reviewedCommit) || !hasText(record.checklistReference)) findings.push("Link the reviewed commit and completed checklist.");
  const release = record.releaseReview;
  if (release.decision !== "recorded" || !hasText(release.reviewer) || !isDate(release.reviewedOn) || release.reviewedOn > asOf || release.scopeRevision !== record.scopeRevision || !hasEvidence(release.evidence)) findings.push("Record release-owner review for the current scope with dated evidence.");

  for (const category of COMPLIANCE_CATEGORIES) {
    const assessment = record.assessments[category];
    if (!assessment) { findings.push(`${category}: missing assessment.`); continue; }
    const closed = assessment.status === "compliant" || assessment.status === "not_applicable";
    if (!closed) findings.push(`${category}: ${assessment.status}.`);
    if (assessment.applicability === "undetermined" || (assessment.status === "compliant" && assessment.applicability !== "applicable") || (assessment.status === "not_applicable" && assessment.applicability !== "not_applicable")) findings.push(`${category}: resolve applicability/status mismatch.`);
    if (!hasText(assessment.rationale) || !hasText(assessment.owner) || !hasText(assessment.reviewer) || !hasEvidence(assessment.evidence)) findings.push(`${category}: record rationale, owner, reviewer and evidence.`);
    if (!isDate(assessment.reviewedOn) || assessment.reviewedOn > asOf || !isDate(assessment.nextReviewOn) || assessment.nextReviewOn <= asOf || (isDate(assessment.reviewedOn) && isDate(release.reviewedOn) && assessment.reviewedOn > release.reviewedOn)) findings.push(`${category}: missing, stale or inconsistent review dates.`);
    for (const action of assessment.actions) {
      if (action.status !== "done" || !hasText(action.requirement) || !hasText(action.owner) || !isDate(action.dueDate) || !hasEvidence(action.evidence)) findings.push(`${category}/${action.id}: unresolved action or missing completion evidence.`);
    }
  }
  return findings;
}
