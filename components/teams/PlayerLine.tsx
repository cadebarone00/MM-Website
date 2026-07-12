import { Avatar } from "@/components/ui/Avatar";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { TrophyBadge } from "@/components/ui/TrophyBadge";
import { individualTitleCount } from "@/lib/data";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";

export function PlayerLine({ name, team, toPar, last }: { name: string; team: Team; toPar: number | null; last: boolean }) {
  const displayName = getPlayerDisplayName(name);
  const avatar = getPlayerAvatar(name);
  const titles = individualTitleCount(name);

  return (
    <div className={["flex items-center gap-[14px] px-[22px] py-3", last ? "border-b-0" : "border-b border-ink-100"].join(" ")}>
      <Avatar name={displayName} src={avatar} size="md" team={team} />
      <div className="flex-1">
        <span className="font-sans text-base font-semibold text-ink-900 inline-flex items-center gap-2">
          {displayName}
          <TrophyBadge count={titles} />
        </span>
      </div>
      {toPar != null && (
        <div className="text-right">
          <ScoreBadge value={toPar} size="md" chip />
          <div className="font-condensed text-[10px] tracking-wide uppercase text-ink-400 mt-[3px]">Total</div>
        </div>
      )}
    </div>
  );
}
