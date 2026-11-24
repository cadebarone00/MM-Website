import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { initialsFor } from "@/lib/profile/initials";
import { colors, fonts } from "~/lib/theme.ts";

/**
 * The one avatar (website rule: one person = gold-ring initials, their photo once added, EVERY page). Thin gold ring,
 * faint gold fill, gold Spectral initials at 39% of the circle. On a light page the circle gets a maroon fill so the
 * gold still shows. A photo that fails to load falls back to the initials.
 */
export function Avatar({ name, photoUrl, size = 40, onLight = false }: { name: string; photoUrl?: string | null; size?: number; onLight?: boolean }) {
  const [broken, setBroken] = useState(false);
  const showPhoto = Boolean(photoUrl) && !broken;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, onLight && styles.onLight]}
    >
      {showPhoto
        ? <Image source={{ uri: photoUrl! }} style={styles.photo} onError={() => setBroken(true)} />
        : <Text style={[styles.initials, { fontSize: Math.round(size * 0.39) }]} numberOfLines={1}>{initialsFor(name)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderWidth: 1, borderColor: colors.avatarRing, backgroundColor: colors.avatarFill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  onLight: { backgroundColor: colors.maroon900 },
  photo: { width: "100%", height: "100%" },
  initials: { fontFamily: fonts.semibold, color: colors.avatarGold },
});
