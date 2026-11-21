/**
 * The Maroon Live, Step 1 (project_specs.md, "Feature: The Maroon Live"; supabase/maroon_live_visibility.sql): who
 * can watch an event's live site, and who gets its share link. Pure rules, used by the server and the settings screens.
 */

export type LiveVisibility = "public" | "link" | "private";
export const LIVE_VISIBILITIES: readonly LiveVisibility[] = ["public", "link", "private"];

export interface LiveSettings { visibility: LiveVisibility; playersCanShare: boolean }

/** Words shown in Settings for each choice. */
export const LIVE_VISIBILITY_COPY: Record<LiveVisibility, { label: string; detail: string }> = {
  public: { label: "Public", detail: "Anyone can find it and watch the golf live." },
  link: { label: "Link only", detail: "Not listed. Anyone with the link can watch the golf live." },
  private: { label: "Private", detail: "No live site. The link doesn't work." },
};

export const isLiveVisibility = (value: unknown): value is LiveVisibility => typeof value === "string" && (LIVE_VISIBILITIES as readonly string[]).includes(value);

/**
 * An event's saved settings. `fallback` covers a database that hasn't run maroon_live_visibility.sql yet: trips keep
 * today's always-on link ("link"); tournaments follow their old Public / Private switch.
 */
export function liveSettingsFrom(visibility: unknown, playersCanShare: unknown, fallback: LiveVisibility): LiveSettings {
  return { visibility: isLiveVisibility(visibility) ? visibility : fallback, playersCanShare: typeof playersCanShare === "boolean" ? playersCanShare : true };
}

/** Does this viewer get the share link? Never when Private; players only when the organizer allows it. */
export function canShareLiveLink(settings: LiveSettings, isOrganizer: boolean): boolean {
  return settings.visibility !== "private" && (isOrganizer || settings.playersCanShare);
}

/** A PATCH body { visibility, playersCanShare }. */
export function liveSettingsFromBody(body: unknown): { ok: true; settings: LiveSettings } | { ok: false; message: string } {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (!isLiveVisibility(value.visibility)) return { ok: false, message: "Pick Public, Link only or Private." };
  if (typeof value.playersCanShare !== "boolean") return { ok: false, message: "Say whether players can share the link." };
  return { ok: true, settings: { visibility: value.visibility, playersCanShare: value.playersCanShare } };
}
