import Link from "next/link";
import type { RoundScorecard } from "@/lib/data";

function Cell({ value, emphasize, href }: { value: number | string; emphasize?: boolean; href?: string }) {
  const content = (
    <span className={["font-sans text-xs tabular-nums", emphasize ? "font-bold text-ink-700" : "text-ink-500"].join(" ")}>{value}</span>
  );
  return (
    <div className="flex items-center justify-center w-9 shrink-0">
      {href ? (
        <Link href={href} className="hover:opacity-70 transition-opacity">
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}

function TotalCell({ value }: { value: number | string }) {
  return (
    <div className="flex items-center justify-center w-12 shrink-0 px-1">
      <span className="font-sans text-xs font-semibold text-ink-600 tabular-nums">{value}</span>
    </div>
  );
}

function InfoRow({
  label,
  front,
  back,
  frontHrefs,
  backHrefs,
  outValue,
  inValue,
  totalValue,
  emphasize,
}: {
  label: string;
  front: (number | string)[];
  back: (number | string)[];
  frontHrefs?: string[];
  backHrefs?: string[];
  outValue: number | string;
  inValue: number | string;
  totalValue: number | string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-[3px]">
      <div className="flex items-center w-[148px] shrink-0 pr-2 mr-1 border-r border-transparent">
        <span className="font-condensed text-[10px] font-semibold tracking-eyebrow uppercase text-ink-400">{label}</span>
      </div>

      <div className="flex items-center">
        {front.map((v, i) => (
          <Cell key={i} value={v} emphasize={emphasize} href={frontHrefs?.[i]} />
        ))}
      </div>
      <TotalCell value={outValue} />
      <div className="w-px h-6 mx-1 shrink-0" />

      {back.length > 0 && (
        <>
          <div className="flex items-center">
            {back.map((v, i) => (
              <Cell key={i} value={v} emphasize={emphasize} href={backHrefs?.[i]} />
            ))}
          </div>
          <TotalCell value={inValue} />
          <div className="w-px h-6 mx-1 shrink-0" />
        </>
      )}

      <div className="flex items-center justify-center w-14 shrink-0 pl-1">
        <span className="font-sans text-xs font-bold text-ink-700 tabular-nums">{totalValue}</span>
      </div>
    </div>
  );
}

export function CourseInfoHeader({
  round,
  tournamentSlug,
  player,
}: {
  round: RoundScorecard;
  tournamentSlug: string;
  player: string;
}) {
  const front = round.holes.slice(0, 9);
  const back = round.holes.slice(9, 18);

  const outPar = front.reduce((s, h) => s + h.par, 0);
  const inPar = back.reduce((s, h) => s + h.par, 0);
  const outYards = front.reduce((s, h) => s + h.yards, 0);
  const inYards = back.reduce((s, h) => s + h.yards, 0);

  const holeHref = (hole: number) => `/leaderboard/${tournamentSlug}/players/${player.toLowerCase()}/${round.round}/${hole}`;

  return (
    <div className="bg-cream-100 border border-ink-100 rounded-md mb-2 w-max min-w-full">
      <div className="flex items-center gap-1 px-3 pt-2">
        <div className="w-[148px] shrink-0 pr-2 mr-1">
          <div className="font-condensed text-[11px] font-bold tracking-wide uppercase text-maroon-700">{round.course}</div>
          {round.format && <div className="font-condensed text-[9px] font-semibold tracking-wide uppercase text-ink-400">{round.format}</div>}
        </div>
      </div>
      <InfoRow
        label="Hole"
        front={front.map((h) => h.hole)}
        back={back.map((h) => h.hole)}
        frontHrefs={front.map((h) => holeHref(h.hole))}
        backHrefs={back.map((h) => holeHref(h.hole))}
        outValue="OUT"
        inValue="IN"
        totalValue="TOT"
        emphasize
      />
      <InfoRow
        label="Yards"
        front={front.map((h) => h.yards)}
        back={back.map((h) => h.yards)}
        outValue={outYards}
        inValue={inYards}
        totalValue={outYards + inYards}
      />
      <div className="pb-2">
        <InfoRow
          label="Par"
          front={front.map((h) => h.par)}
          back={back.map((h) => h.par)}
          outValue={outPar}
          inValue={inPar}
          totalValue={outPar + inPar}
        />
      </div>
    </div>
  );
}
