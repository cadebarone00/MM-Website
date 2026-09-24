"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mm.favoriteCourses";

function readFavorites() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeFavorites(favorites: string[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  window.dispatchEvent(new CustomEvent("mm:favorite-courses-changed"));
}

/** Per-device favorite courses for the "My Courses" tab — not synced to an account. */
export function useFavoriteCourses() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setFavorites(readFavorites());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("mm:favorite-courses-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("mm:favorite-courses-changed", sync);
    };
  }, []);

  const isFavorite = useCallback((courseId: string) => favorites.includes(courseId), [favorites]);

  const toggleFavorite = useCallback((courseId: string) => {
    const current = readFavorites();
    const next = current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId];
    writeFavorites(next);
    setFavorites(next);
  }, []);

  return { favorites, isFavorite, toggleFavorite };
}
