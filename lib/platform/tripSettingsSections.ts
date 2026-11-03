/**
 * Trip Settings card lists. Players lives in General for everyone (Trip Builder, 2026-11-03): the invite link sits at
 * the top; only the organizer can edit anything on it.
 */
export const GENERAL_CARDS = ["Players", "Scorecard View", ...Array.from({ length: 4 }, () => "Place holder")];
/** A saved trip's General section. */
export const LIVE_GENERAL_CARDS = ["Players", "Scorecard View"];
// Individual and Team competition are separate boxes; each opens the competition page for just that type.
export const ORGANIZER_SECTIONS = [
  { title: "Overview", cards: ["Golf Schedule", "Games", "Player Scoring"] },
  { title: "Competition", cards: ["Individual Competition", "Team Competition", "Skins", "Match Selection", "Predict"] },
  { title: "History", cards: ["History", "Delete Trip"] },
];
