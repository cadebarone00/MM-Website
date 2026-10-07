import { useId } from "react";

type IconProps = { size?: number } & React.SVGProps<SVGSVGElement>;

// Bottom-nav icons drawn from white-on-black pictures in /public/icons.
// The picture is used as a mask, so the icon is painted in currentColor and
// follows the nav's normal/active colors like the lucide icons do.
function imageIcon(src: string) {
  return function ImageIcon({ size = 24, ...rest }: IconProps) {
    const maskId = useId();
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...rest}>
        <mask id={maskId}>
          <image href={src} width="24" height="24" />
        </mask>
        <rect width="24" height="24" fill="currentColor" mask={`url(#${maskId})`} />
      </svg>
    );
  };
}

// Golfer looking through binoculars — "Explore" item on the Play page ribbon.
export const ExploreIcon = imageIcon("/icons/explore.png");

// Hand picking from a row of golfers — "Pick'ems" tab.
export const PickemsIcon = imageIcon("/icons/pickems.png");
