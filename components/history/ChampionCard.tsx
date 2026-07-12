import Image from "next/image";
import { ImageOff } from "lucide-react";
import { getPlayerDisplayName } from "@/lib/data/players";

export function ChampionCard({ year, playerId, photo }: { year: number; playerId: string; photo: string | null }) {
  const displayName = getPlayerDisplayName(playerId);

  return (
    <div className="relative overflow-hidden rounded-lg border-2 border-gold-400 bg-ink-900 shadow-lg mb-7">
      <div className="border-b-2 border-gold-400 bg-maroon-700 px-4 py-[10px] font-condensed text-[13px] font-extrabold uppercase tracking-[0.12em] text-gold-200">
        {year}
      </div>
      <div className="relative h-[320px] w-full bg-gradient-to-br from-ink-700 to-ink-900">
        {photo ? (
          <Image src={photo} alt={`${displayName}, ${year} Maroon Masters champion`} fill className="object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-400">
            <ImageOff size={28} />
            <span className="font-sans text-xs">Photo coming soon</span>
          </div>
        )}
        <div className="absolute left-4 top-4 font-sans text-[22px] font-black uppercase leading-[1.15]">
          <span className="mm-champion-name">{displayName}</span>
        </div>
      </div>
    </div>
  );
}
