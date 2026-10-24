import "server-only";

/**
 * Sends an email through Resend (resend.com) when it's set up: RESEND_API_KEY, and EMAIL_FROM (a verified sender, e.g.
 * "The Maroon <invites@yourdomain.com>"). Without them nothing is sent and the result says "not_configured", so callers
 * can still hand out links themselves.
 */
export type EmailResult = { ok: true } | { ok: false; code: "not_configured" | "failed" };

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, code: "not_configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (response.ok) return { ok: true };
    console.error("Email send failed:", response.status, await response.text().catch(() => ""));
  } catch (error) {
    console.error("Email send failed:", error instanceof Error ? error.message : error);
  }
  return { ok: false, code: "failed" };
}

/** Text that's safe inside the email's HTML. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
