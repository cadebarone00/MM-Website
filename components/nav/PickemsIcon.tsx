import { useId } from "react";

// Hand picking from a row of golfers — used for the "Pick'ems" bottom-nav tab.
// The artwork is a white-on-black picture used as a mask, so the icon is
// painted in currentColor and follows the nav's normal/active colors.
export function PickemsIcon({
  size = 24,
  ...rest
}: { size?: number } & React.SVGProps<SVGSVGElement>) {
  const maskId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...rest}>
      <mask id={maskId}>
        <image href="/icons/pickems.png" width="24" height="24" />
      </mask>
      <rect width="24" height="24" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}
