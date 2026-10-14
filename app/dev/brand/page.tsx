import type { Metadata } from "next";
import { BrandPreview } from "@/components/brand/BrandPreview";

export const metadata: Metadata = { title: "Logo motion | The Maroon", robots: { index: false, follow: false } };
export default function BrandPage() { return <BrandPreview />; }
