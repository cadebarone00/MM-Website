import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { TRIP_TIME_ZONES, tripTimeZoneLabel } from "@/lib/platform/tripTimeZones";
import { SelectField } from "~/components/SelectField.tsx";
import { apiJson } from "~/lib/api.ts";
import { colors, fonts } from "~/lib/theme.ts";

/**
 * Trip Settings → General → Time zone (organizer; project_specs.md "Expo app Step 6", part 6c). Tee times and the draft
 * time are trip-local, so "Tee time in 30 minutes" and "The draft starts in 15 minutes" need it. Not set = Central.
 * Claude's call: the list suggests the phone's own time zone first when it's one of them.
 */
export function TripTimeZone({ tripId }: { tripId: string }) {
  const [zone, setZone] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiJson<{ timeZone?: string | null }>(`/api/golf-trips/${encodeURIComponent(tripId)}/time-zone`).then((r) => {
      if (r.ok) setZone(r.body.timeZone ?? null);
      else { setZone(null); setError(r.code === "not_installed" ? "Time zones aren't switched on yet." : r.error); }
    });
  }, [tripId]);

  async function pick(next: string) {
    const before = zone;
    setZone(next); setError(null);
    const r = await apiJson(`/api/golf-trips/${encodeURIComponent(tripId)}/time-zone`, { method: "PUT", body: { timeZone: next } });
    if (!r.ok) { setZone(before); setError(r.error); }
  }

  const phone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const options = [...TRIP_TIME_ZONES].sort((a, b) => Number(b.id === phone) - Number(a.id === phone))
    .map((z) => ({ value: z.id, label: z.label, detail: z.id === phone ? "Your phone's time zone" : undefined }));
  return (
    <View style={styles.box}>
      <SelectField tone="dark" label="Time zone" value={zone ?? null} placeholder={zone === undefined ? "Loading…" : tripTimeZoneLabel(null)} options={options} onChange={(id) => void pick(id)} />
      <Text style={styles.note}>Tee times and the draft are in this time zone. Reminders go out 30 minutes before each tee time and 15 minutes before the draft.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, marginTop: 12 },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.wizardMuted },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.errorOnMaroon },
});
