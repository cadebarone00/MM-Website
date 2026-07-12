import Image from "next/image";
import { nextTournament } from "@/lib/data";

export function Footer() {
  return (
    <footer className="bg-maroon-900 text-maroon-200">
      <div className="max-w-(--container-mm-lg) mx-auto px-7 py-7 flex items-center justify-between gap-6">
        <Image src="/assets/wordmark-light.svg" alt="The Maroon Masters" width={520} height={92} className="h-[26px] w-auto" />
        <span className="font-sans text-xs text-maroon-300">The Maroon Masters · An annual match-play golf trip · Next up {nextTournament.dateLabel}</span>
      </div>
    </footer>
  );
}
