import { MIGRATIONS } from "../../../scripts/fake-supabase.mjs";

/** Every file the test fake loads, plus the Play files the Scoring Simulator needs, in order. */
export const SIM_MIGRATIONS: string[] = [
  ...(MIGRATIONS as string[]),
  "shared_rounds.sql",
  "shared_round_scorekeeper.sql",
  "shared_round_delete.sql",
  "join_codes.sql",
  // The course library Play's course search and scorecard route read (golf_courses, golf_holes, golf_course_external_ids).
  "golf_course_data.sql",
  // The home page reads public.ribbon_content on every load; without it the log shows a red error on every page.
  "ribbon_content.sql",
  // The home page also reads profile photos, profile links and friend requests (profiles.avatar_path, profile_links, my_friend_requests, friend_request_count).
  "profile_photos.sql",
  "profile_edit_v2.sql",
  "profile_socials.sql",
  "profile_friends.sql",
];
