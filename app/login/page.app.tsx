"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { START } from "@/lib/account/onboardingRoutes";

/** App → /login: Cade's Log in screen is the app's sign-in. */
export default function AppLogin() {
  const router = useRouter();
  useEffect(() => { router.replace(`${START.logIn}/`); }, [router]);
  return null;
}
