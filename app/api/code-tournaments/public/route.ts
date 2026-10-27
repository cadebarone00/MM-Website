import { searchPublicCodeTournaments } from "@/lib/platform/codeTournamentsServer";
import { reply } from "@/lib/platform/codeTournamentsRequest";

/** GET ?q=&date=: public tournaments with the words in the name, course or place, and a round on the date (YYYY-MM-DD);
 *  both optional (none = every public tournament). No sign-in needed. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const date = params.get("date");
  return reply(await searchPublicCodeTournaments(params.get("q") ?? "", date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null), (tournaments) => ({ tournaments }));
}
