import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { roundStats } from "@/lib/profile/roundStats";
import { Avatar } from "~/components/Avatar.tsx";
import { apiGet } from "~/lib/api.ts";
import { statText } from "~/lib/play.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/** The parts of /api/app/profile this card reads (server: loadMyProfileScreen). */
type ProfileReply = {
  page?: {
    status: string;
    profile?: {
      identity: { displayName: string; username: string; avatarSrc: string | null };
      modernStats: { handicapIndex: number | null } | null;
      rounds: { status: string; value?: unknown[] };
    };
  };
};
type Snapshot = { name: string; username: string | null; photo: string | null; handicap: number | null; average: number | null; adjusted: number | null };

/**
 * Play home's profile row (website PlatformHome): avatar, name, @username (tap → Profile) and HDP · AVG · ADJ
 * (tap → Profile). The numbers come from the shared roundStats, so they match the website. Refreshes when Play is shown.
 */
export function ProfileSnapshot() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useFocusEffect(useCallback(() => {
    let live = true;
    apiGet<ProfileReply>("/api/app/profile").then((reply) => {
      if (!live || !reply.ok) return;
      const profile = reply.data?.page?.status === "ok" ? reply.data.page.profile : undefined;
      if (!profile) return;
      const rounds = profile.rounds.status === "ok" && Array.isArray(profile.rounds.value) ? profile.rounds.value : [];
      let stats: ReturnType<typeof roundStats> = null;
      try { stats = roundStats(rounds as Parameters<typeof roundStats>[0]); } catch { stats = null; }
      setSnap({
        name: profile.identity.displayName, username: profile.identity.username, photo: profile.identity.avatarSrc,
        handicap: profile.modernStats?.handicapIndex ?? null, average: stats?.average18 ?? null, adjusted: stats?.adjustedAverage18 ?? null,
      });
    });
    return () => { live = false; };
  }, []));

  const openProfile = () => router.navigate("/profile");
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={openProfile} style={styles.who}>
        <Avatar name={snap?.name ?? "You"} photoUrl={snap?.photo} size={40} />
        <View style={styles.names}>
          <Text style={styles.name} numberOfLines={1}>{snap?.name ?? "Your profile"}</Text>
          <Text style={styles.username} numberOfLines={1}>{snap?.username ? `@${snap.username}` : "View your profile"}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="View profile stats" onPress={openProfile} style={styles.stats}>
        {([["HDP", snap?.handicap], ["AVG", snap?.average], ["ADJ", snap?.adjusted]] as const).map(([label, value]) => (
          <View key={label} style={styles.stat}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statValue}>{statText(value)}</Text>
          </View>
        ))}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: gutter, paddingBottom: 12, marginBottom: 16 },
  who: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  names: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  username: { fontFamily: fonts.regular, fontSize: 13, color: colors.avatarGold },
  stats: { flexDirection: "row", alignItems: "center", gap: 12 },
  stat: { alignItems: "center", gap: 4, minWidth: 30 },
  statLabel: { fontFamily: fonts.capsSemibold, fontSize: 10, color: colors.avatarGold },
  statValue: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
});
