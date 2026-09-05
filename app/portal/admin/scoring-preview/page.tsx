import Link from "next/link";
import { LiveScoringPreview } from "@/components/portal/tiger/LiveScoringPreview";
export default function ScoringPreviewPage() { return <main className="mx-auto max-w-3xl px-4 py-8 sm:px-7"><Link href="/portal/admin" className="font-condensed text-xs font-bold uppercase tracking-wide text-ink-500 hover:text-maroon-700">← Back to Tiger Center</Link><div className="mt-5"><LiveScoringPreview /></div></main>; }
