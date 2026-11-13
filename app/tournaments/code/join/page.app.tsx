"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CodeTournamentJoin } from "@/components/platform/CodeTournamentJoin";
import { cleanCode } from "@/lib/platform/codeTournaments";

/** App → Join a code tournament (?code=…, 6 characters); anything else goes back to Join. */
function AppJoinCode() {
  const router = useRouter();
  const code = cleanCode(useSearchParams().get("code") ?? "");
  useEffect(() => { if (code.length !== 6) router.replace("/tournaments/join/"); }, [code, router]);
  return code.length === 6 ? <CodeTournamentJoin code={code} /> : null;
}

export default function AppJoinCodePage() {
  return <Suspense><AppJoinCode /></Suspense>;
}
