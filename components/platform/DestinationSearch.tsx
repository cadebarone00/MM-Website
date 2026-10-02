"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { PlaceLocation, PlaceSuggestion } from "@/lib/platform/location/types";
import styles from "./CreateTournament.module.css";

const MIN_LETTERS = 3;
const PAUSE_MS = 250;

/** Google search session id. randomUUID only exists on https/localhost pages (not a phone on http://192.168…). */
const newSessionToken = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

/**
 * Golf Trip Basics' Destination box with Google Places suggestions (through our /api/places routes; the browser never
 * calls Google). The typed text is always the `destination` answer. Picking a suggestion also fills three hidden
 * answers (destinationPlaceId / Latitude / Longitude); typing over it clears them. If places aren't configured or
 * fail, it stays a plain text box.
 */
export function DestinationSearch() {
  const id = useId();
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState<PlaceLocation | null>(null);
  const textRef = useRef("");
  const session = useRef("");
  const off = useRef(false);

  // Ask for suggestions after a short pause in typing. Nothing is asked once a suggestion is picked.
  useEffect(() => {
    const query = text.trim();
    if (picked || off.current || query.length < MIN_LETTERS) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      session.current ||= newSessionToken();
      try {
        const response = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(query)}&session=${session.current}`, { signal: controller.signal });
        const body = await response.json() as { ok?: boolean; suggestions?: PlaceSuggestion[] };
        if (response.status === 503) off.current = true; // No key on the server: stop asking.
        setSuggestions(body.ok && Array.isArray(body.suggestions) ? body.suggestions : []);
        setActive(-1);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      }
    }, PAUSE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [text, picked]);

  function type(value: string) {
    textRef.current = value;
    setText(value);
    setPicked(null);
    if (value.trim().length < MIN_LETTERS) setSuggestions([]);
  }

  async function pick(suggestion: PlaceSuggestion) {
    textRef.current = suggestion.text;
    setText(suggestion.text);
    setSuggestions([]);
    setActive(-1);
    const token = session.current;
    session.current = ""; // The pick ends this search session; the next search starts a new one.
    try {
      const response = await fetch(`/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}&session=${token}`);
      const body = await response.json() as { ok?: boolean; place?: PlaceLocation };
      // Only keep the coordinates if the box still says what was picked.
      if (body.ok && body.place && textRef.current === suggestion.text) setPicked(body.place);
    } catch {
      // No coordinates: the trip still saves with the typed destination.
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      void pick(suggestions[active]);
    } else if (event.key === "Escape") {
      setSuggestions([]);
    }
  }

  const open = suggestions.length > 0;
  return <div className={styles.field}>
    <label className={styles.fieldLabel} htmlFor={`${id}-input`}>Destination</label>
    <input id={`${id}-input`} className={styles.input} type="text" name="destination" placeholder="Pinehurst, North Carolina"
      autoComplete="off" required value={text} onChange={(event) => type(event.target.value)} onKeyDown={onKeyDown}
      onBlur={() => setSuggestions([])} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
      aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined} />
    {open && <ul id={`${id}-list`} className={styles.suggestions} role="listbox" aria-label="Suggested places">
      {suggestions.map((suggestion, index) =>
        <li key={suggestion.placeId} id={`${id}-option-${index}`} role="option" aria-selected={index === active}
          className={`${styles.suggestion} ${index === active ? styles.suggestionActive : ""}`}
          // mousedown, not click: picking must happen before the box loses focus and closes the list.
          onMouseDown={(event) => { event.preventDefault(); void pick(suggestion); }}>
          <span className={styles.suggestionMain}>{suggestion.mainText}</span>
          {suggestion.secondaryText && <span className={styles.suggestionSecondary}>{suggestion.secondaryText}</span>}
        </li>)}
      <li className={styles.suggestionCredit} role="presentation">Powered by Google</li>
    </ul>}
    <input type="hidden" name="destinationPlaceId" value={picked?.placeId ?? ""} />
    <input type="hidden" name="destinationLatitude" value={picked ? String(picked.latitude) : ""} />
    <input type="hidden" name="destinationLongitude" value={picked ? String(picked.longitude) : ""} />
  </div>;
}
