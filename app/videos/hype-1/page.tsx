import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function HypeVideoPage() {
  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-7 sm:py-12">
      <Link href="/" className="inline-flex items-center gap-2 font-sans text-sm font-semibold text-maroon-700 hover:text-maroon-600">
        <ArrowLeft size={18} />
        Back to Home
      </Link>
      <h1 className="m-0 mt-4 font-serif text-2xl font-bold text-ink-900 sm:text-3xl">Hype Video</h1>
      <video controls autoPlay playsInline className="mt-6 aspect-video w-full rounded-md bg-ink-900" src="/videos/mm-edit-silver-springs.mp4" />
    </div>
  );
}
