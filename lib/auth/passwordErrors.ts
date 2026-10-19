/**
 * Plain-language messages for Supabase Auth password errors (shared by signup, change password and reset). Pure.
 * Supabase's own checks stay the final word: its minimum length, its 72-byte limit and, when enabled in the dashboard,
 * leaked-password protection ("weak_password" with reasons).
 */
export function passwordErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "weak_password" && /pwned|leak|breach|compromised/i.test(message)) {
    return "That password has shown up in a data breach somewhere else. Choose a different one.";
  }
  if (code === "weak_password" || /at least|too short/i.test(message)) return "That password is too weak. Use at least 12 characters.";
  if (/longer than 72/i.test(message)) return "That password is too long. Keep it to about 70 letters (emoji and accents count extra).";
  if (code === "same_password" || /different from the old/i.test(message)) return "Your new password must be different from the current one.";
  if (code === "reauthentication_needed" || code === "reauthentication_not_valid") return "For your security, sign in again and then change your password.";
  return "We couldn't change your password. Try again.";
}
