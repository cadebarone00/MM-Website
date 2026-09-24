import { Button } from "@/components/ui/Button";

export function FantasyWelcome({ editionLabel, onStart }: { editionLabel: string; onStart: () => void }) {
  return (
    <div className="mt-6 text-center">
      <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Welcome to Maroon Masters Fantasy</h1>
      <p className="mt-2 font-sans text-sm text-ink-600">
        You haven&rsquo;t made your picks for {editionLabel} yet. Pick a Maroon player, a White player, and a Wildcard from
        either team — see the How To Play tab for the full scoring rules.
      </p>
      <Button className="mt-6" onClick={onStart}>
        Make Your Selections
      </Button>
    </div>
  );
}
