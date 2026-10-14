import type { Metadata } from "next";
import { BrandIntro } from "@/components/brand/BrandIntro";

export const metadata: Metadata = { title: "App entrance | The Maroon", robots: { index: false, follow: false } };
export default function BrandIntroPage() { return <BrandIntro />; }
