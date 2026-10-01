// Golf leaderboard sign on a post — used for the "Tourneys" bottom-nav tab.
// Takes the same size/aria props as the lucide icons beside it.
export function LeaderboardIcon({
  size = 24,
  ...rest
}: { size?: number } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {/* board */}
      <rect x="2" y="3" width="20" height="11.5" rx="1.5" strokeWidth="2" />
      {/* rows */}
      <path d="M2 6.2h20M2 9h20M2 11.8h20" strokeWidth="1.25" />
      {/* score columns */}
      <path d="M17 6.2v8.3M19.5 6.2v8.3" strokeWidth="1.25" />
      {/* post */}
      <path d="M12 14.5V21" strokeWidth="2" />
    </svg>
  );
}
