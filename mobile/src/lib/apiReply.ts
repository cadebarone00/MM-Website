/** One shape for every server reply, so screens never crash on a bad or unexpected answer. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const NETWORK_ERROR = "Couldn't reach Balata. Check your connection and try again.";

/** The server's `/api/app/*` routes answer `{ ok: true, data }` or `{ ok: false, error }`. Anything else is an error. */
export function parseApiReply<T>(status: number, text: string): ApiResult<T> {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
  if (typeof body !== "object" || body === null) return { ok: false, error: NETWORK_ERROR };
  const reply = body as { ok?: unknown; data?: unknown; error?: unknown };
  if (status >= 200 && status < 300 && reply.ok === true && "data" in reply) return { ok: true, data: reply.data as T };
  if (reply.ok === false && typeof reply.error === "string" && reply.error.trim()) return { ok: false, error: reply.error };
  return { ok: false, error: NETWORK_ERROR };
}
