import { Avatar } from "./Avatar";
import { ScoreBadge } from "./ScoreBadge";
import { TrophyBadge } from "./TrophyBadge";
import { WinnerBadge } from "./WinnerBadge";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";

interface LeaderboardRowProps {
  pos?: number;
  name?: string;
  team?: Team;
  avatar?: string | null;
  total?: number;
  highlight?: boolean;
  header?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  defendingChampion?: boolean;
  isWinner?: boolean;
}

const GRID_COLS = "grid-cols-[44px_minmax(0,1fr)]";

export function LeaderboardRow({
  pos,
  name = "",
  team = "maroon",
  avatar = null,
  total = 0,
  highlight = false,
  header = false,
  expanded = false,
  onToggle,
  defendingChampion = false,
  isWinner = false,
}: LeaderboardRowProps) {
  const displayName = getPlayerDisplayName(name);
  const avatarSrc = avatar ?? getPlayerAvatar(name);
  const isMaroon = team === "maroon";
  const panelClasses = isMaroon
    ? "border-maroon-700 bg-gradient-to-r from-maroon-800 via-maroon-700 to-maroon-600 text-cream-50 shadow-[0_6px_16px_rgba(80,0,1,0.18)]"
    : "border-ink-200 bg-gradient-to-r from-white via-cream-50 to-ink-50 text-ink-900 shadow-[0_6px_16px_rgba(36,0,1,0.08)]";
  const teamText = isMaroon ? "text-gold-200" : "text-maroon-700";

  const playerCell = (
    <span className="flex items-center gap-2 min-w-0 w-full sm:gap-3">
      <span className="sm:hidden">
        <Avatar name={displayName} src={avatarSrc} size="xs" team={team} />
      </span>
      <span className="hidden sm:inline-flex">
        <Avatar name={displayName} src={avatarSrc} size="sm" team={team} />
      </span>
      <span className="flex flex-col min-w-0">
        <span className={["font-sans font-semibold text-xs whitespace-nowrap overflow-hidden text-ellipsis inline-flex items-center gap-[6px] sm:text-sm", isMaroon ? "text-cream-50" : "text-ink-900"].join(" ")}>
          {displayName}
          {defendingChampion && <TrophyBadge count={1} />}
          {isWinner && <WinnerBadge />}
        </span>
        <span className={["font-condensed text-[8px] tracking-wide uppercase sm:text-[10px]", teamText].join(" ")}>
          {team === "maroon" ? "Maroon" : "White"}
        </span>
      </span>
      {onToggle && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={["ml-auto shrink-0 transition-transform duration-200", isMaroon ? "text-gold-200" : "text-ink-300", expanded ? "rotate-90" : ""].join(" ")}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </span>
  );

  if (header) {
    return (
      <div
        className={[
          "grid items-center gap-2 py-1 pr-4 font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400 border-b border-gold-200 bg-cream-50 sm:gap-3 sm:py-2",
          GRID_COLS,
        ].join(" ")}
      >
        <span className="text-center">Pos</span>
        <span className="grid grid-cols-[minmax(0,1fr)_56px] items-center sm:grid-cols-[minmax(0,1fr)_72px]">
          <span className="pl-3">Player</span>
          <span className="text-center">Total</span>
        </span>
      </div>
    );
  }

  return (
    <div
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onClick={onToggle}
      onKeyDown={
        onToggle
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
      className={[
        "grid items-center gap-2 px-2 py-[3px] border-b border-ink-100 transition-colors duration-200 sm:gap-3 sm:px-3 sm:py-[8px]",
        GRID_COLS,
        highlight ? "bg-gold-200/35" : "bg-transparent",
        expanded ? "bg-cream-50" : "",
        onToggle ? "cursor-pointer" : "",
        onToggle && !expanded && !highlight ? "hover:bg-cream-50" : "",
      ].join(" ")}
    >
      <span className="font-condensed font-bold text-sm text-ink-900 text-center tabular-nums sm:text-md">{pos}</span>

      <span className={["grid grid-cols-[minmax(0,1fr)_56px] items-center gap-2 rounded-md border px-2 py-1 sm:grid-cols-[minmax(0,1fr)_72px] sm:gap-3 sm:px-3 sm:py-[9px]", panelClasses].join(" ")}>
        {playerCell}
        <span className="flex items-center justify-center">
          <ScoreBadge
            value={total}
            size="sm"
            chip
            className={isMaroon ? "bg-cream-50 text-maroon-700" : "bg-maroon-50 text-maroon-700"}
          />
        </span>
      </span>
    </div>
  );
}
