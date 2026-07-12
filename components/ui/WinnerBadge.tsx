import { Trophy } from "lucide-react";

export function WinnerBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill border border-gold-400 bg-gold-200 px-[7px] py-[2px] font-condensed text-[10px] font-extrabold uppercase tracking-wide text-gold-700">
      <Trophy size={12} className="mm-winner-pulse text-gold-600" />
      Winner
    </span>
  );
}
