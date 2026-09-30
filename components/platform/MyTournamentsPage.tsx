import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { formatDateRange, previewBasePath, publicBasePath } from "@/lib/platform/publicSite";
import type { EditionSummary, TournamentSummary } from "@/lib/platform/myTournaments";
import { loadMyTournaments } from "@/lib/platform/myTournamentsServer";
import { loadMyAccess } from "@/lib/platform/accessRequestsServer";
import { CreatorAccessNotice } from "./CreatorAccessNotice";
import { OrganizerStudioShell } from "./OrganizerStudioShell";
import styles from "./MyTournaments.module.css";

const VISIBILITY = { public: "Public", unlisted: "Unlisted", private: "Private" } as const;

function updatedLabel(edition: EditionSummary): string | null {
  if (!edition.updatedAt) return null;
  const date = new Date(edition.updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: edition.timezone });
  } catch {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
}

function EditionRow({ tournament, edition }: { tournament: TournamentSummary; edition: EditionSummary }) {
  const title = `${tournament.name} ${edition.year}`;
  const setup = `/tournaments/${encodeURIComponent(tournament.slug)}/${edition.year}`;
  const updated = updatedLabel(edition);
  return <li className={styles.edition} data-edition={`${tournament.slug}/${edition.year}`}>
    <div className={styles.editionTop}>
      <h3>{edition.year}</h3>
      <span className={styles.published} data-published={edition.published}>{edition.published ? "Published" : "Not published"}</span>
      {edition.stage !== "Published" && <span className={styles.stage}>{edition.stage}</span>}
    </div>
    <div className={styles.progress}>
      <progress value={edition.percent} max={100} aria-label={`${title} setup completion`} />
      <span>{edition.percent}% complete</span>
    </div>
    <p className={styles.meta}>
      {[edition.destination, edition.startDate ? formatDateRange(edition.startDate, edition.endDate) : "Dates to be announced"].filter(Boolean).join(" · ")}
      {updated && <><br /><span>Last updated {updated}</span></>}
    </p>
    <div className={styles.actions}>
      <Link className={styles.primary} href={setup} aria-label={`Continue Setup — ${title}`}>Continue Setup</Link>
      <Link className={styles.secondary} href={previewBasePath(tournament.slug, edition.year)} aria-label={`Preview Website — ${title}`}>Preview Website</Link>
      {edition.published && <a className={styles.secondary} href={publicBasePath(tournament.slug, edition.year)} target="_blank" rel="noopener" aria-label={`Public Site — ${title}`}>Public Site</a>}
    </div>
  </li>;
}

/**
 * My Tournaments: the organizer studio's home. Signed-in only; lists just the
 * tournaments this user owns or organizes (see list_managed_editions).
 */
export async function MyTournamentsPage() {
  const [result, accessResult] = await Promise.all([loadMyTournaments(), loadMyAccess()]);
  if (!result.signedIn) redirect("/login");
  const access = accessResult.signedIn && accessResult.ok ? accessResult.access : null;
  // Unknown access (lookup failed) falls back to the Create link, which is still gated on save.
  const canCreate = access?.canCreate ?? true;

  return <OrganizerStudioShell page="home">
    <main className={styles.page}>
      <header className={styles.intro}>
        <div>
          <h1>My Tournaments</h1>
          <p>Tournaments you own or organize. Pick one to keep setting it up.</p>
        </div>
        {result.ok && result.tournaments.length > 0 && <Link className={styles.primary} href="/tournaments/new"><Plus size={16} aria-hidden="true" /> Create Tournament</Link>}
      </header>

      {!result.ok ? <p className={styles.error} role="alert">We couldn&apos;t load your tournaments right now. Refresh the page to try again.</p>
        : result.tournaments.length === 0 ? <section className={styles.empty} aria-labelledby="empty-title">
          <h2 id="empty-title">No tournaments yet</h2>
          <p>Start with a name. Players, courses and the rest can come later.</p>
          {canCreate ? <Link className={styles.primary} href="/tournaments/new"><Plus size={16} aria-hidden="true" /> Create Tournament</Link>
            : <CreatorAccessNotice signedIn access={access} />}
        </section>
        : <ul className={styles.list}>{result.tournaments.map((tournament) =>
          <li key={tournament.slug} className={styles.tournament} data-tournament={tournament.slug}>
            <div className={styles.tournamentTop}>
              <h2>{tournament.name}</h2>
              <p>{tournament.role === "owner" ? "Owner" : "Organizer"} · {VISIBILITY[tournament.visibility]} · {tournament.editions.length === 1 ? "1 edition" : `${tournament.editions.length} editions`}</p>
            </div>
            <ul className={styles.editions}>{tournament.editions.map((edition) => <EditionRow key={edition.year} tournament={tournament} edition={edition} />)}</ul>
          </li>)}
        </ul>}
    </main>
  </OrganizerStudioShell>;
}
