/**
 * Start next year (supabase/platform_next_edition.sql): a new edition of the same tournament. Returning players are
 * the SAME tournament players (picked by id, never matched by name); each gets a fresh roster row with no team.
 * The database decides permissions and duplicates; this checks the form on the way in and reads the page's data.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;

export interface NextEditionInput { seasonYear: number; startDate: string | null; endDate: string | null; keepTeams: boolean; playerIds: string[] }

export function nextEditionInputFromBody(body: unknown): { ok: true; input: NextEditionInput } | { ok: false; field: string; error: string } {
  const r = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const year = Number(r.seasonYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return { ok: false, field: "seasonYear", error: "Pick a year between 2000 and 2200." };
  const date = (v: unknown) => typeof v === "string" && v ? v : null;
  const [startDate, endDate] = [date(r.startDate), date(r.endDate)];
  if (startDate && !isDate(startDate)) return { ok: false, field: "startDate", error: "That start date isn't a real date." };
  if (endDate && !isDate(endDate)) return { ok: false, field: "endDate", error: "That end date isn't a real date." };
  if (startDate && endDate && endDate < startDate) return { ok: false, field: "endDate", error: "The end date can't be before the start date." };
  const ids = Array.isArray(r.playerIds) ? r.playerIds : [];
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) return { ok: false, field: "playerIds", error: "One of those players no longer exists. Reload the page." };
  return { ok: true, input: { seasonYear: year, startDate, endDate, keepTeams: r.keepTeams === true, playerIds: [...new Set(ids as string[])] } };
}

export interface NextEditionPlayer { id: string; name: string; joined: boolean; onFromRoster: boolean; lastSeason: number | null }
export interface NextEditionDraft { fromYear: number; suggestedYear: number; existingYears: number[]; teams: { name: string; color: string }[]; players: NextEditionPlayer[] }

export function nextEditionDraftFromJson(value: unknown): NextEditionDraft | null {
  const r = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!r || !Number.isInteger(r.fromYear) || !Number.isInteger(r.suggestedYear) || !Array.isArray(r.existingYears)) return null;
  const players = (Array.isArray(r.players) ? r.players : []).flatMap((row): NextEditionPlayer[] => {
    const p = row && typeof row === "object" ? row as Record<string, unknown> : null;
    if (!p || typeof p.id !== "string" || !UUID.test(p.id) || typeof p.name !== "string") return [];
    return [{ id: p.id, name: p.name, joined: p.joined === true, onFromRoster: p.onFromRoster === true, lastSeason: Number.isInteger(p.lastSeason) ? p.lastSeason as number : null }];
  });
  const teams = (Array.isArray(r.teams) ? r.teams : []).flatMap((row) => {
    const t = row && typeof row === "object" ? row as Record<string, unknown> : null;
    return t && typeof t.name === "string" && typeof t.color === "string" ? [{ name: t.name, color: t.color }] : [];
  });
  return { fromYear: r.fromYear as number, suggestedYear: r.suggestedYear as number, existingYears: (r.existingYears as unknown[]).filter(Number.isInteger) as number[], teams, players };
}

/** "Select last year's roster": the players on the year you start from (the organizer can untick any of them). */
export const lastYearsRoster = (draft: NextEditionDraft) => draft.players.filter((p) => p.onFromRoster).map((p) => p.id);
