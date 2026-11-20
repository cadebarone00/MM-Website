import type { Metadata } from "next";
import { NotificationCatalog } from "@/components/notifications/NotificationCatalog";

export const metadata: Metadata = { title: "All notification types | The Maroon", robots: { index: false, follow: false } };
export default function Page() { return <NotificationCatalog />; }
