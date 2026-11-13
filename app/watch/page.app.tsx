"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WatchPage } from "@/components/platform/WatchPage";

/** App → Watch with a code (/watch/?code=W12345): the same read-only view as the website. */
function AppWatch() {
  const code = (useSearchParams().get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^W[A-Z0-9]{5}$/.test(code) ? <WatchPage code={code} /> : <p style={{ padding: 32, textAlign: "center" }}>That watch code isn&apos;t valid.</p>;
}

export default function AppWatchPage() {
  return <Suspense><AppWatch /></Suspense>;
}
