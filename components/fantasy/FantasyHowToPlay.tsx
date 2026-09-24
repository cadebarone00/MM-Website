export function FantasyHowToPlay({ editionLabel }: { editionLabel: string }) {
  return (
    <div>
      <h2 className="m-0 font-serif text-lg font-bold text-ink-900">How Fantasy Works</h2>
      <p className="mt-2 font-sans text-sm text-ink-600">
        Pick 3 players for {editionLabel}: one from Team Maroon, one from Team White, and a Wildcard from either team. Each pick
        scores points for you on every hole they finish, in every round played:
      </p>
      <ul className="mt-4 flex flex-col gap-1 font-sans text-2xs text-ink-500">
        <li>
          <span className="font-semibold text-ink-800">Eagle or better</span> — 5 points
        </li>
        <li>
          <span className="font-semibold text-ink-800">Birdie</span> — 3 points
        </li>
        <li>
          <span className="font-semibold text-ink-800">Par</span> — 1 point
        </li>
        <li>
          <span className="font-semibold text-ink-800">Bogey</span> — 0 points
        </li>
        <li>
          <span className="font-semibold text-ink-800">Double bogey or worse</span> — -2 points
        </li>
      </ul>
      <p className="mt-4 font-sans text-2xs text-ink-500">
        Picks can be changed any time before the tournament goes live. Once it does, your lineup locks in and Fantasy tracks your
        picks&rsquo; points round by round for the rest of the tournament.
      </p>
    </div>
  );
}
