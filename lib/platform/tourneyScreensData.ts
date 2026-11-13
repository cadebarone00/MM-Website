import "server-only";
import { loadMyPastTournaments, loadMyPlayingTournaments, type MyPastTournaments } from "./pastTournamentsServer";
import { listMyCodeTournaments } from "./codeTournamentsServer";
import { loadMyTournaments, type MyTournaments } from "./myTournamentsServer";
import { loadMyAccess } from "./accessRequestsServer";
import type { MyAccess } from "./accessRequests";
import type { MyCodeTournament } from "./codeTournaments";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The data behind three Tourneys screens, loaded once for whoever is signed in — shared by the website's pages and the
 * iPhone / Android app's data route (/api/app/tourneys?view=…), so the two can't drift apart. Plain data only.
 */

/** Tourneys (/tournaments/join): your past tournaments and the ones you joined by code (none when signed out or before tournament_codes.sql is run). */
export type TourneysHomeData = { past: MyPastTournaments; codeTournaments: MyCodeTournament[] };
export async function loadTourneysHome(): Promise<TourneysHomeData> {
  const past = await loadMyPastTournaments();
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  const coded = user ? await listMyCodeTournaments(user.id) : null;
  return { past, codeTournaments: coded?.ok ? coded.value : [] };
}

/** My Tournaments (/tournaments/mine): the current and upcoming tournaments you're playing in. */
export const loadMyPlaying = (): Promise<MyPastTournaments> => loadMyPlayingTournaments();

/** The organizer studio's home (/tournaments): the tournaments you own or organize, and whether you may create one. */
export type OrganizerHomeData = { signedIn: false } | { signedIn: true; result: Exclude<MyTournaments, { signedIn: false }>; access: MyAccess | null };
export async function loadOrganizerHome(): Promise<OrganizerHomeData> {
  const [result, accessResult] = await Promise.all([loadMyTournaments(), loadMyAccess()]);
  if (!result.signedIn) return { signedIn: false };
  return { signedIn: true, result, access: accessResult.signedIn && accessResult.ok ? accessResult.access : null };
}
