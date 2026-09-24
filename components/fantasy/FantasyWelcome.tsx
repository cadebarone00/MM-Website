import { Button } from "@/components/ui/Button";

export function FantasyWelcome({ editionLabel, onStart }: { editionLabel: string; onStart: () => void }) {
  return (
    <div className="mt-6 text-center">
      <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Welcome to Maroon Masters Fantasy</h1>
      <p className="mt-2 font-sans text-sm text-ink-600">
        Pick 3 players for {editionLabel}: one from Team Maroon, one from Team White, and a Wildcard from either team. Each pick
        scores points for you on every hole they finish, in every round played:
      </p>
      <ul className="mx-auto mt-4 flex max-w-[320px] flex-col gap-1 text-left font-sans text-2xs text-ink-500">
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
      <Button className="mt-6" onClick={onStart}>
        Make Your Selections
      </Button>
    </div>
  );
}
