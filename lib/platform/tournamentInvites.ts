import "server-only";
import { randomBytes } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { emailConfigured, escapeHtml, sendEmail } from "@/lib/email/sendEmail";
import { formatCode } from "./codeTournaments.ts";
import { tournamentInvitePath, type InviteRow } from "./inviteImport.ts";

/**
 * Tournament email invites (supabase/tournament_invites.sql). The organizer's file becomes one invite per email: the
 * server makes each link's secret (only its hash is stored), emails "Join <tournament>" with the code, the link and the
 * app links, and records which went out. The organizer id always comes from the signed-in session.
 */

export type InvitePreview = { tournamentId: string; tournamentName: string; scoring: "Gross" | "Net"; status: "live" | "ended"; invitedName: string; handicap: number | null; organizerName: string | null; accepted: boolean };
export type SendResult =
  | { ok: true; sent: number; failed: string[]; emailReady: boolean; links: { name: string; email: string; url: string }[] }
  | { ok: false; code: "not_installed" | "refused" | "failed"; message: string };

const db = () => createSupabaseServiceRoleClient();
const missingFn = (code?: string) => code === "PGRST202" || code === "42883" || code === "42P01";

/** The app download links for the email (set them once the app is in the stores). */
const appLinks = () => ({ ios: process.env.NEXT_PUBLIC_IOS_APP_URL || null, android: process.env.NEXT_PUBLIC_ANDROID_APP_URL || null });

function inviteEmail(t: { name: string; code: string; organizer: string | null }, invitedName: string, url: string) {
  const code = formatCode(t.code), apps = appLinks();
  const subject = `Join ${t.name}`;
  const appText = [apps.ios && `iPhone: ${apps.ios}`, apps.android && `Android: ${apps.android}`].filter(Boolean).join("\n");
  const text = `Hi ${invitedName},\n\n${t.organizer ?? "The organizer"} invited you to ${t.name} on The Maroon.\n\nJoin here: ${url}\n\n`
    + `${appText ? `Get the app:\n${appText}\n\n` : ""}Already have The Maroon? Open Tourneys → Join a Tournament and enter code ${code}.\n`;
  const button = (href: string, label: string) => `<a href="${escapeHtml(href)}" style="display:inline-block;margin:4px;padding:12px 20px;border-radius:999px;background:#e8c98a;color:#3b0d18;font-weight:700;text-decoration:none">${escapeHtml(label)}</a>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#240001;color:#fbf8f1;border-radius:16px">
<p style="margin:0;color:#c9a86e;font-size:12px;letter-spacing:.12em;text-transform:uppercase">You're invited</p>
<h1 style="margin:8px 0 16px;font-family:Georgia,serif;font-size:28px">Join ${escapeHtml(t.name)}</h1>
<p>Hi ${escapeHtml(invitedName)}, ${escapeHtml(t.organizer ?? "the organizer")} invited you to play in ${escapeHtml(t.name)} on The Maroon.</p>
<p style="text-align:center;margin:24px 0">${button(url, "Join the tournament")}</p>
${apps.ios || apps.android ? `<p style="text-align:center">${apps.ios ? button(apps.ios, "Download for iPhone") : ""}${apps.android ? button(apps.android, "Download for Android") : ""}</p>` : ""}
<p style="text-align:center;color:#e8d7b2">Tournament code</p>
<p style="text-align:center;margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:.14em;color:#e8c98a">${escapeHtml(code)}</p>
<p style="color:#e8d7b2;font-size:14px">New to The Maroon? The link takes you through making your profile, then straight into the tournament. Already have it? Open Tourneys → Join a Tournament and enter the code.</p>
</div>`;
  return { subject, text, html };
}

/** Saves the invites and emails each one (when email is set up). `origin` is the site the links point at. */
export async function sendTournamentInvites(organizer: string, id: string, invites: InviteRow[], origin: string): Promise<SendResult> {
  const withTokens = invites.map((i) => ({ ...i, token: randomBytes(24).toString("base64url") }));
  const added = await db().rpc("add_code_tournament_invites", { p_organizer: organizer, p_tournament: id, p_invites: withTokens });
  if (added.error) {
    if (missingFn(added.error.code)) return { ok: false, code: "not_installed", message: "Email invites aren't set up yet (supabase/tournament_invites.sql)." };
    if (added.error.code === "42501" || added.error.code === "22023") return { ok: false, code: "refused", message: added.error.message };
    console.error("add_code_tournament_invites failed:", added.error.message);
    return { ok: false, code: "failed", message: "Couldn't save the invites. Try again." };
  }
  const rows = added.data as { id: string; name: string; email: string; token: string }[];
  const { data: t } = await db().from("code_tournaments").select("name, code, organizer").eq("id", id).maybeSingle();
  const { data: who } = await db().from("profiles").select("display_name").eq("id", organizer).maybeSingle();
  const tournament = { name: (t?.name as string) ?? "the tournament", code: (t?.code as string) ?? "", organizer: (who?.display_name as string | null) ?? null };
  const links = rows.map((r) => ({ name: r.name, email: r.email, url: `${origin}${tournamentInvitePath(r.token)}` }));
  const emailReady = emailConfigured();
  const sentIds: string[] = [], failed: string[] = [];
  if (emailReady) {
    // A few at a time, so a big field doesn't hit the email service all at once.
    for (let i = 0; i < rows.length; i += 5) {
      await Promise.all(rows.slice(i, i + 5).map(async (r, k) => {
        const result = await sendEmail({ to: r.email, ...inviteEmail(tournament, r.name, links[i + k].url) });
        if (result.ok) sentIds.push(r.id); else failed.push(r.email);
      }));
    }
    if (sentIds.length) await db().rpc("mark_code_tournament_invites_sent", { p_tournament: id, p_ids: sentIds });
  }
  return { ok: true, sent: sentIds.length, failed, emailReady, links };
}

/** What an invite link shows. Null for an unknown link (or before tournament_invites.sql is run). */
export async function getTournamentInvite(token: string): Promise<InvitePreview | null> {
  const { data, error } = await db().rpc("get_code_tournament_invite", { p_token: token });
  if (error) { if (!missingFn(error.code)) console.error("get_code_tournament_invite failed:", error.message); return null; }
  return (data as InvitePreview | null) ?? null;
}

/** The signed-in person joins from their invite. Returns the tournament id, or a message for them. */
export async function acceptTournamentInvite(profile: string, token: string, handicap: number | null): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error } = await db().rpc("accept_code_tournament_invite", { p_profile: profile, p_token: token, p_handicap: handicap });
  if (!error && typeof data === "string") return { ok: true, id: data };
  if (error && (error.code === "22023" || error.code === "42501")) return { ok: false, message: error.message };
  if (error) console.error("accept_code_tournament_invite failed:", error.message);
  return { ok: false, message: "Couldn't join the tournament. Try again." };
}
