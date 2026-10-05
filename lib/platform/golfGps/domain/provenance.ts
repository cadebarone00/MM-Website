/**
 * Where golf-course data came from and how much it has been checked. One course can mix data from several providers,
 * so every course, hole and shape can carry its own source.
 */

/**
 * Every data provider The Maroon knows about. Adding one is a one-line change here plus an adapter that turns its
 * responses into these domain types — the UI never sees a provider's raw format.
 */
export type GolfDataProvider =
  | "maroon" // entered or corrected inside The Maroon (organizers, admins)
  | "open_golf" // OpenGolfAPI
  | "openstreetmap"
  | "golf_intelligence";

/** One provider's id for a course or hole, e.g. { provider: "openstreetmap", id: "relation/4082113" }. */
export interface GolfExternalId {
  provider: GolfDataProvider;
  /** The provider's own id, stored as text exactly as they give it. */
  id: string;
}

/** Lightweight "where did this come from" stamp. Timestamps are ISO 8601 strings (e.g. "2026-10-05T14:00:00Z"). */
export interface GolfSourceMetadata {
  provider: GolfDataProvider;
  /** The provider's id for the specific record this data came from, if it has one. */
  providerRecordId?: string;
  importedAt?: string;
  /** When the provider last changed it (not when we imported it). */
  lastUpdatedAt?: string;
  /** 0–1, only when the provider gives one or we computed one. Absent means unknown, not zero. */
  confidence?: number;
  /** Credit line the license requires the UI to show, e.g. "© OpenStreetMap contributors". */
  attribution?: string;
}

/**
 * How trustworthy a piece of data is:
 * - unverified: nobody has checked it and we don't know where it came from
 * - imported: loaded from a provider, not reviewed by anyone at The Maroon
 * - community_submitted: added or corrected by a player / organizer, not yet reviewed
 * - admin_verified: reviewed and approved by a Maroon admin
 * - professional_source: from a professional survey / paid course-data provider
 */
export type GolfVerificationStatus =
  | "unverified"
  | "imported"
  | "community_submitted"
  | "admin_verified"
  | "professional_source";

export interface GolfVerification {
  status: GolfVerificationStatus;
  /** When `status` was last set (ISO 8601). */
  updatedAt?: string;
  /** When an admin verified it (ISO 8601); only for admin_verified. */
  verifiedAt?: string;
  /** Maroon user id of whoever verified or submitted it. */
  verifiedBy?: string;
  note?: string;
}
