/** A lost response can leave organizer settings changed on the server. */
export async function saveTournamentSettings(
  post: () => Promise<{ ok: true } | { ok: false; error: string }>,
  refresh: () => Promise<boolean>,
): Promise<{ saved: boolean; needsRefresh: boolean; message: string }> {
  let result: { ok: true } | { ok: false; error: string };
  try { result = await post(); } catch { result = { ok: false, error: "Could not reach the server." }; }
  if (!result.ok) return { saved: false, needsRefresh: true, message: `${result.error} The settings may have changed. Refresh and review them before trying again.` };
  let refreshed = false;
  try { refreshed = await refresh(); } catch { /* The write succeeded but current settings are unavailable. */ }
  return { saved: true, needsRefresh: !refreshed, message: refreshed ? "Saved." : "Saved, but current settings could not be loaded. Refresh and review them before continuing." };
}
