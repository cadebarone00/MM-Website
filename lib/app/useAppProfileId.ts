"use client";
import { useEffect, useState } from "react";
import { appSupabase } from "./appAuth";

/**
 * The signed-in person's profile id in the app (a profile's id is its account's id), or "guest" until it's known /
 * when signed out — what the website's pages get from tripProfileId(getCurrentProfile()) on the server.
 */
export function useAppProfileId(): string {
  const [id, setId] = useState("guest");
  useEffect(() => { void appSupabase().auth.getUser().then(({ data }) => setId(data.user?.id ?? "guest")); }, []);
  return id;
}
