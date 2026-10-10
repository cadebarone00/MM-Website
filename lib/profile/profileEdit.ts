/**
 * Profile V1 forms (Finish profile setup, Edit profile): the shape checks shared by the screens and the route. The
 * database (supabase/profile_v1.sql) has the final say on usernames (uniqueness, reserved names) and lengths.
 * Only display name, username and bio are ever read from a request — nothing else about a profile is editable here.
 */

export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.]{2,29}$/;
export const USERNAME_RULE = "3–30 letters, numbers, _ or . — starting with a letter or number.";
export const NAME_MAX = 60;
export const BIO_MAX = 1000;

export interface ProfileSetupInput { displayName: string; username: string }
export interface ProfileEditInput { displayName?: string; username?: string; bio?: string }
type Problem = { ok: false; field: "displayName" | "username" | "bio" | "body"; error: string };

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
    if (typeof r.bio !== "string" || r.bio.length > BIO_MAX) return { ok: false, field: "bio", error: `Bios are ${BIO_MAX} characters at most.` };
    input.bio = r.bio.trim();
  }
  if (!Object.keys(input).length) return { ok: false, field: "body", error: "Nothing to save." };
  return { ok: true, input };
}

/** /profile/<username> for a claimed profile's username; null when there's no username to link (never link otherwise). */
export function profileHref(username: string | null | undefined): string | null {
  return username && username.trim() ? `/profile/${encodeURIComponent(username.trim())}` : null;
}
