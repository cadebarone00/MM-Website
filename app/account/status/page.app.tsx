import { Suspense } from "react";
import { AppAccountStatus } from "@/components/app/AppOnboarding";

/** App → Your account (blocked / unfinished accounts), the same messages as the website. */
export default function AppAccountStatusPage() {
  return <Suspense><AppAccountStatus /></Suspense>;
}
