type IconProps = { size?: number } & React.SVGProps<SVGSVGElement>;

/** A golf bag with three clubs, drawn to match lucide's stroke style (lucide has no golf equipment icon). */
export function GolfBagIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {/* Club shafts and heads */}
      <path d="M9 9 8 3H6" />
      <path d="M12 9V2h2" />
      <path d="m15 9 1-5.5 2 .5" />
      {/* Bag, strap and pocket */}
      <rect x="7" y="9" width="10" height="13" rx="2" />
      <path d="M17 11c2 1.5 2 6 0 7.5" />
      <path d="M10 15h4" />
    </svg>
  );
}
