import type { Metadata } from "next";
import { NotificationPreviewScreen } from "@/components/notifications/NotificationPreviews";

export const metadata: Metadata = { title: "Live Activity | The Maroon", robots: { index: false, follow: false } };
export default function Page() { return <NotificationPreviewScreen surface="live" />; }
