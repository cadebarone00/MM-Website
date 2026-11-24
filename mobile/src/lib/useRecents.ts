import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addRecent, readRecentList, removeRecent } from "./recentList.ts";

/**
 * A search screen's "Recent" list, saved on this phone only (a convenience: if storage fails the list is just empty).
 * Same behavior as the website's useRecents: newest first, 8 max, remember / forget one / Clear all.
 */
export function useRecents<T extends { id: string }>(key: string, isItem: (value: unknown) => value is T) {
  const [recents, setRecents] = useState<T[]>([]);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key).then((text) => { if (live) setRecents(readRecentList(text, isItem)); }).catch(() => {});
    return () => { live = false; };
  }, [key, isItem]);

  const save = useCallback((next: T[]) => {
    setRecents(next);
    AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
  }, [key]);

  const remember = useCallback((item: T) => save(addRecent(recents, item)), [recents, save]);
  const forget = useCallback((id: string | null) => save(removeRecent(recents, id)), [recents, save]);
  return { recents, remember, forget };
}
