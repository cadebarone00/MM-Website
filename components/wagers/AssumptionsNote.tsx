/** Lists the last-year defaults a future is priced on, until Tiger sets this year's. */
export function AssumptionsNote({ assumptions }: { assumptions: string[] }) {
  if (!assumptions.length) return null;
  return (
    <ul className="m-0 mt-2 list-none p-0 font-sans text-2xs italic text-ink-400">
      {assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
    </ul>
  );
}
