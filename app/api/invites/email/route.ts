import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendCodeInvites } from "@/lib/platform/joinCodesServer";
import { emailsFrom, INVITE_KINDS, type InviteKind } from "@/lib/platform/codeInvites";
import { badRequest, reply, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** POST { kind, id, emails }: the host / organizer emails the round's, trip's, tourney's or league's code. */
export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const body = await request.json().catch(() => null) as { kind?: unknown; id?: unknown; emails?: unknown } | null;
  const emails = Array.isArray(body?.emails) ? emailsFrom(body.emails.filter((e) => typeof e === "string").join(" ")) : [];
  if (!INVITE_KINDS.includes(body?.kind as InviteKind) || typeof body?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id) || !emails.length) return badRequest();
  return reply(await sendCodeInvites(user.id, body.kind as InviteKind, body.id, emails, new URL(request.url).origin), (value) => value);
}
