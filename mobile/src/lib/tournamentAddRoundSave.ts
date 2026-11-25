/** A round creation can succeed even when its response is lost; never retry it automatically. */
export async function addTournamentRound(
  post: () => Promise<{ ok: true } | { ok: false; error: string }>,
  refresh: () => Promise<boolean>,
): Promise<{ saved: boolean; needsRefresh: boolean; message: string }> {
  let result: { ok: true } | { ok: false; error: string };
  try { result = await post(); } catch { result = { ok: false, error: "Could not reach the server." }; }
  if (!result.ok) return { saved: false, needsRefresh: true, message: `${result.error} The round may have been added. Refresh and review the round list before retrying.` };
  let refreshed = false;
  try { refreshed = await refresh(); } catch { /* The write succeeded but the latest list is unavailable. */ }
  return { saved: true, needsRefresh: !refreshed, message: refreshed ? "Round added." : "Round added, but the latest list could not be loaded. Refresh and review it before continuing." };
}
