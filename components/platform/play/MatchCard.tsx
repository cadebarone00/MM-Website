import { readableText, safeColor } from "@/components/platform/tournament-site/theme";
import type { Match, Player, Team } from "@/components/platform/tournament-site/types";
import styles from "./Play.module.css";

/** Live · Thru 12 / Final / tee time — the one status treatment for a match. */
export function MatchStatus({ match }: { match: Match }) {
  if (match.status === "live") return <span className={styles.live}><span className={styles.liveDot} aria-hidden="true" />Live{match.progress ? ` · ${match.progress}` : ""}</span>;
  if (match.status === "final") return <span className={styles.matchStatus}>Final</span>;
  return <span className={styles.matchStatus}>{match.teeTime}</span>;
}

function Side({ side, players, teams }: { side: Match["sideA"]; players: Player[]; teams: Team[] }) {
  const team = teams.find((t) => t.id === side.teamId);
  const color = safeColor(team?.color ?? "", "#3a1620");
  return <div className={styles.matchSide}>
    <span className={styles.teamBar} style={{ background: color }} aria-hidden="true" />
    <span className={styles.matchNames}>
      {side.players.map((id) => players.find((p) => p.id === id)?.name ?? "TBD").join(" & ")}
      {team && <small>{team.name}</small>}
    </span>
  </div>;
}

/** One match: both sides, format, status and the result/standing text as posted. */
export function MatchCard({ match, players, teams, round }: { match: Match; players: Player[]; teams: Team[]; round?: string }) {
  return <article className={styles.matchCard} data-status={match.status}>
    <div className={styles.matchCardHead}>
      <span>{[round, match.format].filter(Boolean).join(" · ")}</span>
      <MatchStatus match={match} />
    </div>
    <Side side={match.sideA} players={players} teams={teams} />
    <Side side={match.sideB} players={players} teams={teams} />
    {match.result && <p className={styles.matchCardResult} style={resultStyle(match, teams)}>{match.result}</p>}
  </article>;
}

/** Final results take the winning side's color when the text names a team; everything else stays neutral. */
function resultStyle(match: Match, teams: Team[]) {
  if (match.status !== "final") return undefined;
  const winner = teams.find((t) => match.result?.toLowerCase().startsWith(t.name.replace(/^Team\s+/i, "").toLowerCase()));
  if (!winner) return undefined;
  const color = safeColor(winner.color);
  return { background: color, color: readableText(color) };
}
