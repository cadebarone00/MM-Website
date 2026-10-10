import Link from "next/link";
import type { ProfileReadModel, ProfileTrip } from "@/lib/profile/profileReadModel";

const day = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`)) : null;
const heading = "m-0 mt-8 font-condensed text-sm font-semibold uppercase tracking-wide text-maroon-700";
const muted = "mt-2 text-maroon-900/60";
const row = "flex items-start justify-between gap-3 border-t border-maroon-900/10 py-3 first:border-t-0";

/**
 * Profile → Overview: tournaments played (with that year's team) and golf trips joined, from the profile read model.
 * A brand-new golfer sees short "will show here" lines, never an error.
 */
export function ProfileHistory({ trips, tournaments, teamHistory }: Pick<ProfileReadModel, "trips" | "tournaments" | "teamHistory">) {
  if (trips.status === "hidden" && tournaments.status === "hidden") return null;
  const legacyYears = teamHistory.filter((entry) => entry.source === "legacy");
  return <>
    <section aria-label="Tournaments">
      <h2 className={heading}>Tournaments</h2>
      {tournaments.status === "unavailable" && !legacyYears.length ? <p className={muted}>Tournaments can&apos;t be loaded right now.</p>
        : tournaments.status === "ok" && !tournaments.value.length && !legacyYears.length ? <p className={muted}>Tournaments you play in will show here.</p>
        : <ol className="mt-2">
          {tournaments.status === "ok" && tournaments.value.map((t) => <li key={t.href} className={row}>
            <Link href={t.href} className="min-w-0">
              <p className="font-semibold">{t.year} · {t.name}</p>
              {t.team && <p className="text-sm text-maroon-900/70">{t.team.name}{t.isCaptain ? " · Captain" : ""}</p>}
            </Link>
          </li>)}
          {legacyYears.map((entry) => <li key={`legacy-${entry.year}`} className={row}>
            <div className="min-w-0">
              <p className="font-semibold">{entry.year} · {entry.tournament}</p>
              <p className="text-sm text-maroon-900/70">{entry.team}</p>
            </div>
          </li>)}
        </ol>}
    </section>
    <section aria-label="Golf trips">
      <h2 className={heading}>Golf trips</h2>
      {trips.status === "unavailable" ? <p className={muted}>Golf trips can&apos;t be loaded right now.</p>
        : trips.status === "ok" && !trips.value.current.length && !trips.value.past.length ? <p className={muted}>Golf trips you join will show here.</p>
        : trips.status === "ok" && <ol className="mt-2">{[...trips.value.current, ...trips.value.past].map((trip) => <TripRow key={trip.href} trip={trip} past={trips.value.past.includes(trip)} />)}</ol>}
    </section>
  </>;
}

function TripRow({ trip, past }: { trip: ProfileTrip; past: boolean }) {
  const dates = [day(trip.startDate), day(trip.endDate)].filter(Boolean).join(" – ");
  return <li className={row}>
    <Link href={trip.href} className="min-w-0">
      <p className="font-semibold">{trip.name}</p>
      <p className="text-sm text-maroon-900/70">{[trip.destination, dates || null, past ? "Past" : null].filter(Boolean).join(" · ")}</p>
    </Link>
  </li>;
}
