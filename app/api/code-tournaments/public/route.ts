import { searchPublicCodeTournaments } from "@/lib/platform/codeTournamentsServer";
import { reply } from "@/lib/platform/codeTournamentsRequest";

/** GET ?q=: public tournaments whose name has the words in it; no words = the ones live right now. No sign-in needed. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return reply(await searchPublicCodeTournaments(query), (tournaments) => ({ tournaments }));
}
