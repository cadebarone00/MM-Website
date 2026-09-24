"use client";

const OPTIONS: { label: string; putts: number }[] = [
  { label: "0", putts: 0 },
  { label: "1", putts: 1 },
  { label: "2", putts: 2 },
  { label: "3", putts: 3 },
  { label: "4+", putts: 4 },
];

/** Pill row 0/1/2/3/4+, replacing a plain number input. "4+" records exactly 4. */
export function PuttsPicker({
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: number | null;
  onChange: (putts: number) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-center gap-2" role="group" aria-label={ariaLabel}>
      {OPTIONS.map((option) => {
        const selected = option.putts === 4 ? (value ?? -1) >= 4 : value === option.putts;
        return (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option.putts)}
            disabled={disabled}
            aria-pressed={selected}
            className={`flex h-10 w-10 items-center justify-center rounded-full border font-sans text-sm font-semibold transition-colors ${selected ? "border-maroon-700 bg-maroon-700 text-white" : "border-ink-200 bg-white text-ink-700"} disabled:opacity-50`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
