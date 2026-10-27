/**
 * Tournament invites from a file (Created screen → Import players): the rows of a CSV or Excel sheet, read by their
 * headers — a name column, an email column, and (net tournaments) a handicap column. Shared by the page (preview) and
 * the server (which checks again).
 */

export interface InviteRow { name: string; email: string; handicap: number | null }
export interface InviteProblem { row: number; message: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const pick = (keys: string[], test: RegExp) => keys.find((k) => test.test(k.trim().toLowerCase()));

/** Rows from the file (header → value) to invites, with a message for each row that can't be used. `net`: a handicap
 *  (-10 to 54) is required. A repeated email keeps its first row. Up to 500 players. */
export function inviteRows(rows: Record<string, unknown>[], net: boolean): { invites: InviteRow[]; problems: InviteProblem[]; missing: string[] } {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const nameKey = pick(keys, /^(full ?)?name$|^player( name)?$|^golfer$/) ?? pick(keys, /name/);
  const emailKey = pick(keys, /e-?mail/);
  const hcpKey = pick(keys, /handicap|^hcp$|^index$|hcp/);
  const missing = [!nameKey && "Name", !emailKey && "Email", net && !hcpKey && "Handicap"].filter(Boolean) as string[];
  if (missing.length) return { invites: [], problems: [], missing };
  const invites: InviteRow[] = [], problems: InviteProblem[] = [], seen = new Set<string>();
  rows.forEach((r, i) => {
    const row = i + 2; // the header is row 1
    const name = String(r[nameKey!] ?? "").trim().slice(0, 80);
    const email = String(r[emailKey!] ?? "").trim().toLowerCase();
    const rawHcp = hcpKey ? String(r[hcpKey] ?? "").trim() : "";
    if (!name && !email && !rawHcp) return; // an empty line
    const handicap = rawHcp === "" ? null : Number(rawHcp.replace(/^\+/, "-"));
    if (!name) return problems.push({ row, message: "No name" });
    if (!EMAIL.test(email)) return problems.push({ row, message: `${name}: the email doesn't look right` });
    if (handicap !== null && (!Number.isFinite(handicap) || handicap < -10 || handicap > 54)) return problems.push({ row, message: `${name}: the handicap should be -10 to 54` });
    if (net && handicap === null) return problems.push({ row, message: `${name}: no handicap (net tournament)` });
    if (seen.has(email)) return problems.push({ row, message: `${name}: ${email} is already in the file` });
    seen.add(email);
    invites.push({ name, email, handicap: handicap === null ? null : Math.round(handicap * 10) / 10 });
  });
  if (invites.length > 500) { problems.push({ row: 502, message: "Up to 500 players: the rest were left out" }); invites.length = 500; }
  return { invites, problems, missing };
}

/** The file to start from (Name, Email, and Handicap for net). */
export const inviteTemplate = (net: boolean) => (net ? "Name,Email,Handicap\nJordan Smith,jordan@example.com,8.4\n" : "Name,Email\nJordan Smith,jordan@example.com\n");

/** The page an invite link opens (the secret is part of the link; it's never shown on its own). */
export const tournamentInvitePath = (token: string) => `/tournaments/code/invite/${token}`;
export const isTournamentInviteToken = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{32,200}$/.test(value);
