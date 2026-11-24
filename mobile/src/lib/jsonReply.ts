import { NETWORK_ERROR } from "./apiReply.ts";

/** A reply from a website route that answers `{ ok: true, ...fields }` or `{ ok: false, code?, message? }` (the /api/rounds/*,
 *  /api/courses/* routes). Anything that isn't JSON, or an ok reply with an error status, counts as an error. */
export type JsonResult<T> = { ok: true; body: T } | { ok: false; error: string; code: string | null };

export function parseJsonReply<T>(status: number, text: string, messages: Partial<Record<string, string>> = {}): JsonResult<T> {
  let body: unknown;
  try { body = JSON.parse(text); } catch { return { ok: false, error: NETWORK_ERROR, code: null }; }
  if (typeof body !== "object" || body === null) return { ok: false, error: NETWORK_ERROR, code: null };
  const reply = body as { ok?: unknown; code?: unknown; message?: unknown; error?: unknown };
  if (status >= 200 && status < 300 && reply.ok === true) return { ok: true, body: body as T };
  const code = typeof reply.code === "string" ? reply.code : null;
  const fromCode = code ? messages[code] : undefined;
  // Some routes say why in `message`, others (Golf Trips) in `error`.
  const said = typeof reply.message === "string" ? reply.message : typeof reply.error === "string" ? reply.error : null;
  const message = said && said.trim() ? said : null;
  return { ok: false, error: fromCode ?? message ?? (code === "signed_out" ? "You're signed out. Sign in again." : NETWORK_ERROR), code };
}

/** A path on the website as a full link (images like "/schedule/x.webp" from the server). Full links pass through. */
export function absoluteUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
