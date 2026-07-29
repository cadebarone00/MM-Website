import { Video } from "lucide-react";

/** Styled "coming soon" placeholder — no real video wiring in this project. */
export function RoundVideoPlaceholder({ roundLabel }: { roundLabel: string }) {
  return (
    <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ink-200 bg-ink-50 py-10 text-center">
      <Video size={28} className="text-ink-300" />
      <p className="m-0 font-sans text-sm text-ink-400">{roundLabel} highlights coming soon.</p>
    </div>
  );
}
