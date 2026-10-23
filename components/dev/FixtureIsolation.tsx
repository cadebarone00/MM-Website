"use client";
import { createContext, useContext } from "react";
/** Only the separately guarded iPhone canvas supplies this context. */
export const FixtureIsolation = createContext(false);
export function useFixtureIsolation() {
  const isolated = useContext(FixtureIsolation);
  return process.env.NODE_ENV === "development" && isolated;
}
