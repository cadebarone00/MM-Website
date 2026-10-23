import { NextResponse } from "next/server";
import type { CodeRoundSetup, TournamentCut } from "./codeTournaments.ts";
import type { Result } from "./codeTournamentsServer.ts";

/**
 * Checks what the app sends for tournaments by code before it goes to the database (which checks again): a round's
 * course (name + 9 or 18 pars, optional stroke index), tee (name, rating, slope or nulls) and date; a handicap index.
 * Also the routes' shared reply.
 */

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

export function handicapFrom(value: unknown): number | null {
  const n = num(value);
  return n !== null && n >= -10 && n <= 54 ? Math.round(n * 10) / 10 : null;
}

/** A cut as sent: undefined = not valid; null = no cut. Top 1–500 players, or a cut number of -50 to +100, after round 1–9. */
export function cutFrom(value: unknown): TournamentCut | null | undefined {
  if (value === null || value === undefined) return null;
  const { after, kind, value: n } = value as { after?: unknown; kind?: unknown; value?: unknown };
  if (!Number.isInteger(after) || (after as number) < 1 || (after as number) > 9 || !Number.isInteger(n)) return undefined;
  if (kind === "top" && (n as number) >= 1 && (n as number) <= 500) return { after: after as number, kind, value: n as number };
  if (kind === "score" && (n as number) >= -50 && (n as number) <= 100) return { after: after as number, kind, value: n as number };
  return undefined;
}

export function roundFrom(value: unknown): { setup: CodeRoundSetup; date: string } | null {
  if (!value || typeof value !== "object") return null;
  const { setup, date } = value as { setup?: unknown; date?: unknown };
  if (!isDate(date) || !setup || typeof setup !== "object") return null;
  const { course, tee } = setup as { course?: Record<string, unknown>; tee?: Record<string, unknown> | null };
  if (!course || typeof course.name !== "string" || typeof course.ref !== "string" || !Array.isArray(course.par)) return null;
  // Only the course's own holes (some listings run extra, unlabelled holes past 18).
  const par = course.par.slice(0, 18);
  if (![9, 18].includes(par.length) || !par.every((p) => Number.isInteger(p) && p >= 3 && p <= 6)) return null;
  const strokeIndex = Array.isArray(course.strokeIndex) ? course.strokeIndex.slice(0, par.length).map((s) => Number.isInteger(s) ? s as number : null) : undefined;
  return {
    date,
    setup: {
      course: { ref: course.ref, name: course.name.slice(0, 120), place: typeof course.place === "string" ? course.place.slice(0, 120) : "", par: par as number[], ...(strokeIndex && { strokeIndex }) },
      tee: tee && typeof tee.name === "string" ? { name: tee.name.slice(0, 40), rating: num(tee.rating), slope: num(tee.slope) } : null,
    },
  };
}

export const reply = <T,>(result: Result<T>, value: (v: T) => object) => result.ok ? NextResponse.json({ ok: true, ...value(result.value) }, { headers: { "Cache-Control": "no-store" } })
  : NextResponse.json({ ok: false, code: result.code, message: result.message }, { status: result.code === "not_installed" ? 503 : result.code === "refused" ? 400 : 500 });
export const signedOut = () => NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
export const badRequest = () => NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
