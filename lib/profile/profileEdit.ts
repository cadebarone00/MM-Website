/**
 * Profile V1 forms (Finish profile setup, Edit profile): the shape checks shared by the screens and the route. The
 * database (supabase/profile_v1.sql) has the final say on usernames (uniqueness, reserved names) and lengths.
 * Only display name, username and bio are ever read from a request — nothing else about a profile is editable here.
 */

export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.]{2,29}$/;
export const USERNAME_RULE = "3–30 letters, numbers, _ or . — starting with a letter or number.";
export const NAME_MAX = 60;
/** Bio: at most 3 lines (owner rule 2026-11-02) in a column 90% of the header wide, in the 13px condensed label font.
 *  150 characters (like Instagram) fits 3 lines of real writing (capitals, emoji) even on a 360px-wide phone, measured
 *  in the simulator; at most 3 typed lines. The database still allows up to 1000 (supabase/profile_v1.sql), so older bios stay valid. */
export const BIO_MAX = 150;
export const BIO_MAX_LINES = 3;
/** Keeps a bio being typed to 3 lines and BIO_MAX characters (extra line breaks are dropped). */
export function limitBio(text: string): string {
  const lines = text.split("\n");
  return (lines.length > BIO_MAX_LINES ? `${lines.slice(0, BIO_MAX_LINES).join("\n")}${lines.slice(BIO_MAX_LINES).join(" ")}` : text).slice(0, BIO_MAX);
}
export function bioProblem(bio: string): string | null {
  if (bio.length > BIO_MAX) return `Bios are ${BIO_MAX} characters at most.`;
  if (bio.split("\n").length > BIO_MAX_LINES) return `Bios are ${BIO_MAX_LINES} lines at most.`;
  return null;
}

/** Gender (supabase/profile_edit_v2.sql): private, only ever shown on your own Edit profile. "" = not set. */
export const GENDERS = [{ value: "man", label: "Man" }, { value: "woman", label: "Woman" }, { value: "prefer_not_to_say", label: "Prefer not to say" }] as const;
export type Gender = (typeof GENDERS)[number]["value"];
export const genderLabel = (gender: Gender | "") => GENDERS.find((g) => g.value === gender)?.label ?? "";
const isGender = (v: unknown): v is Gender | "" => v === "" || GENDERS.some((g) => g.value === v);

export interface ProfileSetupInput { displayName: string; username: string }
export interface ProfileEditInput { displayName?: string; username?: string; bio?: string; gender?: Gender | "" }
type Problem = { ok: false; field: "displayName" | "username" | "bio" | "gender" | "body"; error: string };

const record = (body: unknown): Record<string, unknown> | null => body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;

/** A username the person is choosing now (a new one, or a change). Null = looks fine; the database still checks it's free. */
export function usernameProblem(username: string): string | null {
  return USERNAME_PATTERN.test(username) ? null : `Usernames are ${USERNAME_RULE}`;
}

export function nameProblem(name: string): string | null {
  return name.trim().length >= 1 && name.trim().length <= NAME_MAX ? null : `Your name needs 1–${NAME_MAX} characters.`;
}

export function profileSetupFromBody(body: unknown): { ok: true; input: ProfileSetupInput } | Problem {
  const r = record(body);
  if (!r) return { ok: false, field: "body", error: "Fill in your name and a username." };
  const displayName = typeof r.displayName === "string" ? r.displayName.trim() : "";
  const username = typeof r.username === "string" ? r.username.trim() : "";
  const problem = nameProblem(displayName);
  if (problem) return { ok: false, field: "displayName", error: problem };
  const usernameIssue = usernameProblem(username);
  if (usernameIssue) return { ok: false, field: "username", error: usernameIssue };
  return { ok: true, input: { displayName, username } };
}

/**
 * Edit profile: any of displayName / username / bio. A username is sent only when it changes, so an older username
 * (e.g. the one made at signup) can be kept as it is. Any other field in the body is ignored.
 */
export function profileEditFromBody(body: unknown): { ok: true; input: ProfileEditInput } | Problem {
  const r = record(body);
  if (!r) return { ok: false, field: "body", error: "Nothing to save." };
  const input: ProfileEditInput = {};
  if (r.displayName !== undefined) {
    if (typeof r.displayName !== "string" || nameProblem(r.displayName)) return { ok: false, field: "displayName", error: nameProblem(String(r.displayName ?? "")) ?? "Your name needs 1–60 characters." };
    input.displayName = r.displayName.trim();
  }
  if (r.username !== undefined) {
    const username = typeof r.username === "string" ? r.username.trim() : "";
    const problem = usernameProblem(username);
    if (problem) return { ok: false, field: "username", error: problem };
    input.username = username;
  }
  if (r.bio !== undefined) {
    if (typeof r.bio !== "string") return { ok: false, field: "bio", error: `Bios are ${BIO_MAX} characters at most.` };
    const problem = bioProblem(r.bio.trim());
    if (problem) return { ok: false, field: "bio", error: problem };
    input.bio = r.bio.trim();
  }
  if (r.gender !== undefined) {
    if (!isGender(r.gender)) return { ok: false, field: "gender", error: "Choose Man, Woman or Prefer not to say." };
    input.gender = r.gender;
  }
  if (!Object.keys(input).length) return { ok: false, field: "body", error: "Nothing to save." };
  return { ok: true, input };
}

/** Profile links (supabase/profile_edit_v2.sql): up to 5, a title + an https:// web address, shown under the bio. */
export interface ProfileLink { title: string; url: string }
export const LINKS_MAX = 5;
export const LINK_TITLE_MAX = 40;
const LINK_URL = /^https:\/\/[^\s/$.?#][^\s]*$/;

/** What someone typed as a web address → the address saved: "instagram.com/me" gets https:// in front; http:// is refused. */
export function normalizeLinkUrl(typed: string): string {
  const url = typed.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}
export function linkProblem(link: ProfileLink): string | null {
  const title = link.title.trim();
  if (title.length < 1 || title.length > LINK_TITLE_MAX) return `Each link needs a title of 1–${LINK_TITLE_MAX} characters.`;
  if (!LINK_URL.test(link.url) || link.url.length > 300) return "Links must be web addresses starting with https://";
  return null;
}
/** PUT /api/account/links body { links: [{ title, url }] } → the cleaned list, or the first problem. */
export function profileLinksFromBody(body: unknown): { ok: true; links: ProfileLink[] } | { ok: false; error: string } {
  const list = record(body)?.links;
  if (!Array.isArray(list)) return { ok: false, error: "Links must be a list." };
  if (list.length > LINKS_MAX) return { ok: false, error: `You can add up to ${LINKS_MAX} links.` };
  const links: ProfileLink[] = [];
  for (const item of list) {
    const r = record(item);
    if (!r || typeof r.title !== "string" || typeof r.url !== "string") return { ok: false, error: "Each link needs a title and a web address." };
    const link = { title: r.title.trim(), url: normalizeLinkUrl(r.url) };
    const problem = linkProblem(link);
    if (problem) return { ok: false, error: problem };
    links.push(link);
  }
  return { ok: true, links };
}
/** Saved links read back from the database (anything malformed is skipped, never shown). */
export function profileLinksFromRows(rows: unknown): ProfileLink[] {
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const r = record(row);
    if (!r || typeof r.title !== "string" || typeof r.url !== "string") return [];
    return linkProblem({ title: r.title, url: r.url }) ? [] : [{ title: r.title, url: r.url }];
  }).slice(0, LINKS_MAX);
}
/** The address without https:// and a trailing slash, for showing under the bio. */
export const linkLabel = (url: string) => url.replace(/^https:\/\//, "").replace(/\/$/, "");

/** /profile/<username> for a claimed profile's username; null when there's no username to link (never link otherwise). */
export function profileHref(username: string | null | undefined): string | null {
  return username && username.trim() ? `/profile/${encodeURIComponent(username.trim())}` : null;
}
