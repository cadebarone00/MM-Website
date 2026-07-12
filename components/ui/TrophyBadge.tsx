import { Trophy } from "lucide-react";

export function TrophyBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="inline-flex items-center gap-[2px]">
      {Array.from({ length: count }).map((_, i) => (
        <Trophy key={i} size={14} className="text-gold-500" style={{ filter: "drop-shadow(0 0 4px rgba(201,168,110,0.8))" }} />
      ))}
    </span>
  );
}
