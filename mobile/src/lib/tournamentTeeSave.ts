/** A tee-sheet save needs a current read before a draft can be trusted again. */
export async function saveTournamentTeeSheet(
  post: () => Promise<{ ok: true } | { ok: false; error: string }>,
  refresh: () => Promise<boolean>,
): Promise<{ saved: boolean; needsRefresh: boolean; message: string }> {
  let result: { ok: true } | { ok: false; error: string };
  try { result = await post(); } catch { result = { ok: false, error: "Could not reach the server." }; }
  if (!result.ok) return { saved: false, needsRefresh: true, message: `${result.error} The save may have reached the server. Refresh and review the tee sheet before retrying.` };
  let refreshed = false;
  try { refreshed = await refresh(); } catch { /* The saved sheet still needs a current read. */ }
  return { saved: true, needsRefresh: !refreshed, message: refreshed ? "Tee sheet saved." : "Tee sheet saved, but the latest version could not be loaded. Refresh before continuing." };
}
