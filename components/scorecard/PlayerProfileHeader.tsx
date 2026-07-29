import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import type { Team } from "@/lib/data/types";

const BIO_TRUNCATE_CHARS = 220;

function truncateBio(bio: string): string {
  if (bio.length <= BIO_TRUNCATE_CHARS) return bio;
  const cut = bio.slice(0, BIO_TRUNCATE_CHARS);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-[2px] px-4">
      <span className="font-score text-lg font-bold text-ink-900 tabular-nums">{value}</span>
      <span className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400">{label}</span>
    </div>
  );
}

export function PlayerProfileHeader({
  backHref,
  backLabel,
  displayName,
  avatarSrc,
  team,
  editionLabel,
  bio,
  bioHref,
  live,
  position,
  total,
  thru,
}: {
  backHref: string;
  backLabel: string;
  displayName: string;
  avatarSrc: string | null;
  team: Team;
  editionLabel: string;
  bio: string | null;
  bioHref: string;
  live: boolean;
  position: number | null;
  total: number | null;
  thru: string | null;
}) {
  return (
    <div className="mb-6">
      <Link
        href={backHref}
        className="font-condensed text-xs font-semibold tracking-wide uppercase text-ink-500 hover:text-maroon-700 transition-colors"
      >
        ← {backLabel}
      </Link>

      <div className="flex items-start gap-4 mt-4 mb-4 flex-wrap">
        <Avatar name={displayName} src={avatarSrc} size="xl" team={team} className="h-[72px] w-[72px] sm:h-[88px] sm:w-[88px]" />
        <div className="min-w-0">
          {live && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-score-under/10 px-2 py-0.5 mb-1 font-condensed text-3xs font-bold uppercase tracking-wide text-score-under">
              ● Watch Live
            </span>
          )}
          <div className="font-condensed text-3xs font-bold uppercase tracking-eyebrow text-gold-700">Official Score Card</div>
          <h1 className="m-0 font-sans text-[28px] font-extrabold text-ink-900 sm:text-[32px]">{displayName}</h1>
          <span className={["font-condensed text-xs font-semibold tracking-wide uppercase", team === "maroon" ? "text-maroon-600" : "text-ink-500"].join(" ")}>
            {team === "maroon" ? "Team Maroon" : "Team White"} · {editionLabel}
          </span>
        </div>
      </div>

      {bio && (
        <p className="font-sans text-sm leading-relaxed text-ink-600 max-w-[640px]">
          {truncateBio(bio)}{" "}
          <Link href={bioHref} className="font-semibold text-maroon-700 hover:underline whitespace-nowrap">
            Full Bio →
          </Link>
        </p>
      )}

      {(position != null || total != null || thru != null) && (
        <div className="flex divide-x divide-ink-100 mt-4 bg-cream-50 border border-ink-100 rounded-md w-fit">
          {position != null && <Stat label="Position" value={String(position)} />}
          {total != null && <Stat label="Total" value={total === 0 ? "E" : total > 0 ? `+${total}` : String(total)} />}
          {thru != null && <Stat label="Thru" value={thru} />}
        </div>
      )}
    </div>
  );
}
