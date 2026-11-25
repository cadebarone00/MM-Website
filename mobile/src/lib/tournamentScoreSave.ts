/** Wait for a confirmed write, then require a current read before allowing another scoring write. */
export async function saveTournamentScore(
  post: () => Promise<{ ok: true } | { ok: false; error: string }>,
  refresh: () => Promise<boolean>,
): Promise<{ saved: boolean; needsRefresh: boolean; message: string }> {
  let result: { ok: true } | { ok: false; error: string };
  try { result = await post(); }
  catch { result = { ok: false, error: "Could not reach the server." }; }
  if (!result.ok) return { saved: false, needsRefresh: true, message: `${result.error} The save may have reached the server. Refresh and check the score before retrying.` };
  let refreshed = false;
  try { refreshed = await refresh(); } catch { /* The write succeeded, but the read is still unconfirmed. */ }
  return { saved: true, needsRefresh: !refreshed, message: refreshed ? "Saved." : "Saved, but the latest scorecard could not be loaded. Refresh before continuing." };
}
