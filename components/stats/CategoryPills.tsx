export function CategoryPills<T extends string>({
  categories,
  selected,
  onSelect,
}: {
  categories: { key: T; label: string }[];
  selected: T;
  onSelect: (key: T) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {categories.map((c) => {
        const active = c.key === selected;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelect(c.key)}
            className={[
              "shrink-0 whitespace-nowrap rounded-pill px-4 py-2 font-sans text-sm font-semibold cursor-pointer transition-colors",
              active ? "bg-maroon-700 text-white" : "border border-ink-200 bg-cream-100 text-maroon-700 hover:border-maroon-400",
            ].join(" ")}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
