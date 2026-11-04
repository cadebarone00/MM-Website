/** A first-visit tip on the trip home: a bubble pointing at the element with data-coach="<target>". */
export type CoachStop = { target: "settings" | "golf-tab" | "scoring"; text: string };

/** The trip home's coach marks, once per account. The organizer also learns where skipped setup lives. */
export function coachStops(isOrganizer: boolean): CoachStop[] {
  const shared: CoachStop[] = [
    { target: "golf-tab", text: "Your rounds, courses and leaderboard live here." },
    { target: "scoring", text: "Enter scores here during a round." },
  ];
  return isOrganizer
    ? [{ target: "settings", text: "Anything you skipped lives in Settings. Tap here to finish setting it up." },
      { target: "settings", text: "Your invite link is in Settings → Players." }, ...shared]
    : [{ target: "settings", text: "Grab the invite link in Settings → Players to bring a friend." }, ...shared];
}
