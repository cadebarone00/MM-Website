"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mm.favoritePlayers";

function normalize(playerId: string) {
  return playerId.trim().toLowerCase();
}

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
  window.dispatchEvent(new CustomEvent("mm:favorites-changed"));
}

export function useFavoritePlayers() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setFavorites(readFavorites());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("mm:favorites-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("mm:favorites-changed", sync);
    };
  }, []);

  const isFavorite = useCallback((playerId: string) => favorites.includes(normalize(playerId)), [favorites]);

  const toggleFavorite = useCallback((playerId: string) => {
    const key = normalize(playerId);
    const current = readFavorites();
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    writeFavorites(next);
    setFavorites(next);
  }, []);

  return { favorites, isFavorite, toggleFavorite };
}
