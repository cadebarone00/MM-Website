/**
 * A trip's time zone (project_specs.md "Expo app Step 6", part 6c): the organizer picks it in Trip Settings → General, so
 * tee-time and draft reminders arrive at the right moment. Trip times are trip-local; not set = Central time.
 */
export const TRIP_TIME_ZONES: readonly { id: string; label: string }[] = [
  { id: "America/New_York", label: "Eastern" },
  { id: "America/Chicago", label: "Central" },
  { id: "America/Denver", label: "Mountain" },
  { id: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { id: "America/Los_Angeles", label: "Pacific" },
  { id: "America/Anchorage", label: "Alaska" },
  { id: "Pacific/Honolulu", label: "Hawaii" },
  { id: "America/Puerto_Rico", label: "Atlantic (Puerto Rico, Caribbean)" },
  { id: "America/Cancun", label: "Cancún" },
  { id: "America/Mexico_City", label: "Mexico City" },
  { id: "Europe/London", label: "UK & Ireland" },
  { id: "Europe/Paris", label: "Central Europe" },
  { id: "Europe/Lisbon", label: "Portugal" },
  { id: "Atlantic/Bermuda", label: "Bermuda" },
];
export const isTripTimeZone = (value: unknown): value is string => typeof value === "string" && TRIP_TIME_ZONES.some((z) => z.id === value);
export const tripTimeZoneLabel = (id: string | null | undefined) => TRIP_TIME_ZONES.find((z) => z.id === id)?.label ?? "Central (not set)";
