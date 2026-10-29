import { timingSafeEqual } from "node:crypto";
import { resumeAccountDeletions, sweepOrphanedDeletionFiles } from "@/lib/account/accountDeletion";
import { resumeIneligibleCleanups } from "@/lib/account/ineligibleAccounts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Account-deletion retry job (Vercel Cron, vercel.json). Finishes any deletion left half-way (database / Storage / Auth
 * steps, each idempotent) and removes files that still belong to finished deletions. Only the cron secret can run it
 * (same check as /api/internal/trip-push): a browser session, even an admin's, can't. Answers counts only: no ids,
 * names or emails.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${expected ?? ""}`);
  if (!expected || supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Pending accounts Phase 4: finish the cleanup of Ineligible (under-13) registrations the server didn't get to. Its own
  // failure never stops the existing deletion work below; with account_activation.sql not installed it does nothing.
  let ineligible: Awaited<ReturnType<typeof resumeIneligibleCleanups>> | null = null;
  try {
    ineligible = await resumeIneligibleCleanups();
  } catch (error) {
    console.error("Ineligible cleanup job:", (error as Error).message.slice(0, 160));
  }
  try {
    const resumed = await resumeAccountDeletions();
    const filesRemoved = await sweepOrphanedDeletionFiles();
    return Response.json({
      ok: true,
      resumed: resumed.length,
      completed: resumed.filter((r) => r.state === "completed").length,
      stillPending: resumed.filter((r) => r.state !== "completed").length,
      filesRemoved,
      ineligible,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // account_deletion.sql not installed yet, or the database is unreachable: nothing to do, try next time.
    console.error("Account deletion job:", (error as Error).message.slice(0, 160));
    return Response.json({ ok: false, error: "Not available." }, { status: 503 });
  }
}
