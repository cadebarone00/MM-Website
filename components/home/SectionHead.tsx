import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface SectionHeadProps {
  eyebrow?: string;
  title: string;
  action?: string;
  actionHref?: string;
}

export function SectionHead({ eyebrow, title, action, actionHref }: SectionHeadProps) {
  return (
    <div className="mb-0">
      <div className="flex items-end justify-between mb-2">
        <div>
          {eyebrow && <div className="font-condensed text-[11px] font-semibold tracking-eyebrow uppercase text-maroon-600 mb-1">{eyebrow}</div>}
          <h2 className="font-sans text-[28px] font-extrabold text-ink-900 m-0">{title}</h2>
        </div>
        {action && actionHref && (
          <Link href={actionHref} className="flex items-center gap-[5px] font-sans text-[13px] font-semibold text-ink-500 pb-1">
            {action} <ChevronRight width={14} height={14} />
          </Link>
        )}
      </div>
      <div className="border-t-2 border-ink-900 mb-4" />
    </div>
  );
}
