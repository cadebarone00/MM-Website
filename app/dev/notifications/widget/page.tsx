import type { Metadata } from "next";
import { WidgetPreviewScreen } from "@/components/notifications/WidgetPreviews";

export const metadata: Metadata = { title: "Home screen widget | The Maroon", robots: { index: false, follow: false } };
export default function Page() { return <WidgetPreviewScreen />; }
