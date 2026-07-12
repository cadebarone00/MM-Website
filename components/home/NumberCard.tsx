interface NumberCardProps {
  value: string;
  label: string;
  sub: string;
  accent?: boolean;
}

export function NumberCard({ value, label, sub, accent = false }: NumberCardProps) {
  return (
    <div className="py-4 border-b border-ink-200">
      <div className={["font-condensed text-[40px] font-bold leading-none", accent ? "text-gold-600" : "text-maroon-700"].join(" ")}>{value}</div>
      <div className="font-condensed text-[11px] font-semibold tracking-[0.12em] uppercase text-ink-700 mt-[6px]">{label}</div>
      <div className="font-sans text-xs text-ink-400 mt-[2px]">{sub}</div>
    </div>
  );
}
