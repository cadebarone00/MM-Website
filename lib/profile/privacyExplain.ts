import type { RoundsVisibility } from "../platform/playerRoundsPrivacy.ts";

/** What Public / Private profile means (Settings and Edit profile). Shared by the website and the Expo app (mobile/). */
export const PRIVACY_EXPLAIN: Record<RoundsVisibility, string> = {
  public: "Anyone can see your profile: your bio, rounds and public tournaments. Your golf trips stay private.",
  private: "Others see just your name. Your friends (anyone you've been on a golf trip with) can still see and compare your stats, and people you play with see your handicap index.",
};
