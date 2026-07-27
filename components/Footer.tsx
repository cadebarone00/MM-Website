import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { nextTournament } from "@/lib/data";

const PLAYER_PORTAL_HREF = "/portal";

export function Footer() {
  return (
    <footer className="bg-maroon-900 text-maroon-200">
      <div className="max-w-(--container-mm-lg) mx-auto px-7 py-7 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <Image src="/assets/wordmark-light.svg" alt="The Maroon Masters" width={520} height={92} className="h-[26px] w-auto" />
        <span className="font-sans text-xs text-maroon-300 text-center sm:text-left">
          The Maroon Masters · An annual match-play golf trip · Next up {nextTournament.dateLabel}
        </span>
        <Link
          href={PLAYER_PORTAL_HREF}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-white/20 bg-white/10 px-4 py-2 font-sans text-xs font-semibold text-white transition-colors hover:bg-white/20"
        >
          Player Portal
          <ChevronRight size={14} />
        </Link>
      </div>
    </footer>
  );
}
