/**
 * Password rules for every place a password is SET: signup, Settings → Change password, the forgot-password / invite
 * "set your password" page (Accounts V2, phase A2). Never applied at sign-in, so existing (V1) passwords keep working.
 *
 * - At least 12 characters. Passphrases with spaces and any language are welcome; no forced character classes.
 * - At most 72 BYTES (UTF-8). That is Supabase Auth's hard limit (bcrypt): it refuses anything longer, and we don't
 *   hash passwords ourselves. 72 plain letters fit; accented letters / emoji use 2–4 bytes each.
 * - Not just one repeated character or whitespace.
 * Known-breached passwords are refused by Supabase's "leaked password protection" when it's switched on in the
 * dashboard (hosted feature); its answer is passed straight through (lib/auth/passwordErrors.ts).
 */
export const PASSWORD_MIN_CHARS = 12;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN_CHARS} characters. A few words in a row works well.`;

export type PasswordCheck = { ok: true } | { ok: false; error: string };

export function checkNewPassword(password: unknown): PasswordCheck {
  if (typeof password !== "string" || password.length === 0) return { ok: false, error: "Enter a password." };
  const chars = [...password].length;
  if (chars < PASSWORD_MIN_CHARS) return { ok: false, error: `Use at least ${PASSWORD_MIN_CHARS} characters. A few words in a row works well.` };
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return { ok: false, error: "That password is too long. Keep it to about 70 letters (emoji and accents count extra)." };
  if (!password.trim()) return { ok: false, error: "A password can't be only spaces." };
  if (new Set([...password]).size === 1) return { ok: false, error: "Use more than one repeated character." };
  return { ok: true };
}
