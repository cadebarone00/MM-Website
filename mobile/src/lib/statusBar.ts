import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";

/** Dark (maroon) screens call this so the clock and battery are white while the screen is showing; back to dark after. */
export function useLightStatusBar() {
  useFocusEffect(useCallback(() => {
    setStatusBarStyle("light", true);
    return () => setStatusBarStyle("dark", true);
  }, []));
}
