import { formatCode } from "./codeTournaments.ts";

/**
 * One way to join everything (project_specs.md, "Feature: One way to join everything"): the four kinds of thing that
 * have an invite code, where each one's Join page is, and the "Email the code" message. Plain, so it's easy to test.
 */

export type InviteKind = "round" | "trip" | "tourney" | "league";
export const INVITE_KINDS: InviteKind[] = ["round", "trip", "tourney", "league"];
export const KIND_NAME: Record<InviteKind, string> = { round: "round", trip: "golf trip", tourney: "tournament", league: "league" };
/** Where each tab tells people to type the code. */
const WHERE: Record<InviteKind, string> = { round: "Play", trip: "Golf Trips", tourney: "Tourneys", league: "Leagues" };

/** A 6-character invite code as stored (no look-alikes; never starting with W, which watch codes use). */
export const isInviteCode = (value: unknown): value is string => typeof value === "string" && /^[A-HJKMNP-Z2-9]{6}$/.test(value);
export const cleanInviteCode = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Each kind's own Join page for a code (the link in emails and the Share sheet). */
export function joinPath(kind: InviteKind, code: string): string {
  switch (kind) {
    case "round": return `/rounds/join?code=${code}`;
    case "trip": return `/golf-trips/join/${code}`;
    case "tourney": return `/tournaments/code/join?code=${code}`;
    case "league": return `/leagues/join?code=${code}`;
  }
}

/** Up to 50 addresses from what was typed (commas, spaces or new lines between them); anything not an email is dropped. */
export function emailsFrom(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254) seen.add(email);
  }
  return [...seen].slice(0, 50);
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "Cam invited you to Thursday Night League": the code in big letters, a Join button, and where to type the code instead. */
export function codeInviteEmail(kind: InviteKind, target: { name: string; code: string; sender: string | null }, origin: string): { subject: string; html: string; text: string } {
  const who = target.sender?.trim() || "Someone";
  const code = formatCode(target.code);
  const url = new URL(joinPath(kind, target.code), origin).href;
  const subject = `${who} invited you to ${target.name} on The Maroon`;
  const text = `${who} invited you to join the ${KIND_NAME[kind]} ${target.name} on The Maroon.\n\nYour code: ${code}\n\nJoin: ${url}\n\nOr open The Maroon, go to ${WHERE[kind]} and enter the code.`;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#2a0a12;max-width:480px">
  <p style="font-size:16px">${escapeHtml(who)} invited you to join the ${KIND_NAME[kind]} <b>${escapeHtml(target.name)}</b> on The Maroon.</p>
  <p style="font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#7a5c3a;margin:24px 0 4px">Your code</p>
  <p style="font-size:34px;font-weight:700;letter-spacing:.14em;margin:0 0 20px">${code}</p>
  <p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:#500f23;color:#fbf8f1;text-decoration:none;font-weight:600">Join</a></p>
  <p style="font-size:14px;color:#6b5a50">Or open The Maroon, go to ${WHERE[kind]} and enter the code.</p>
</div>`;
  return { subject, html, text };
}
