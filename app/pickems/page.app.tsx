"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** App → Pick'ems was replaced by Leagues. */
export default function AppPickemsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/leagues/"); }, [router]);
  return null;
}
