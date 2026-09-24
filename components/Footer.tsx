import Image from "next/image";
import { AccountBadge } from "@/components/AccountBadge";
import type { NextTournamentOverride } from "@/lib/data/types";

export function Footer({ nextTournamentOverride }: { nextTournamentOverride: NextTournamentOverride }) {
  return (
    <footer className="hidden bg-maroon-900 text-maroon-200 lg:block">
      <div className="max-w-(--container-mm-lg) mx-auto px-7 py-7 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <Image src="/assets/wordmark-light.svg" alt="The Maroon Masters" width={520} height={92} className="h-[26px] w-auto" />
        <span className="font-sans text-xs text-maroon-300 text-center sm:text-left">
          The Maroon Masters · An annual match-play golf trip · Next up {nextTournamentOverride.dateLabel}
        </span>
        <AccountBadge position="footer" />
      </div>
    </footer>
  );
}
