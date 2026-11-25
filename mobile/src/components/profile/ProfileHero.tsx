import type { ReactNode } from "react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { socialDisplay, socialLabel } from "@/lib/profile/profileSocials";
import { Avatar } from "~/components/Avatar.tsx";
import { assetUrl } from "~/lib/api.ts";
import type { ProfileModel } from "~/lib/profileTypes.ts";
import { colors, fonts, minTap } from "~/lib/theme.ts";

export type ProfileTab = "overview" | "rounds" | "stats";
const TABS: { key: ProfileTab; label: string }[] = [{ key: "overview", label: "Overview" }, { key: "rounds", label: "Rounds" }, { key: "stats", label: "Stats" }];

/**
 * A profile's maroon top (website ProfileView): mine = pencil · search (+ friend-request badge) · gear, photo, name,
 * @username, Friends · Rounds · Handicap; someone else's = Back, @username, Rounds · Friends · Handicap, then `actions`
 * (Add friend / Compare). Bio and up to 4 socials under it, then the tabs (greyed out on a Private profile).
 */
export function ProfileHero({ profile, friends, requests = 0, tab, onTab, onFriends, actions }: {
  profile: ProfileModel; friends: number | null; requests?: number; tab: ProfileTab; onTab: (tab: ProfileTab) => void; onFriends?: () => void; actions?: ReactNode;
}) {
  const { identity, isOwner } = profile;
  const isPrivate = profile.access === "private";
  const handicap = profile.modernStats?.handicapIndex == null ? "—" : String(profile.modernStats.handicapIndex);
  const rounds = String(profile.modernStats?.roundsPlayed ?? 0);
  const friendsText = friends === null ? "—" : String(friends);
  const photo = identity.avatarSrc
    ? <View style={styles.photoRing}><Image source={{ uri: assetUrl(identity.avatarSrc) }} style={styles.photo} contentFit="cover" /></View>
    : <Avatar name={identity.displayName || identity.username} size={86} />;
  const stat = (label: string, value: string, onPress?: () => void) => (
    <Pressable key={label} disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={`${label}: ${value}`} style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.hero}>
      <View style={styles.iconRow}>
        {isOwner ? (
          <>
            {identity.canEditBio ? <Icon name="pencil" label="Edit profile" onPress={() => router.push("/profile/edit")} /> : <View style={styles.icon} />}
            <View style={styles.flex} />
            <Icon name="magnifyingglass" label="Search golfers" onPress={() => router.push("/profile/search")} badge={requests} />
            <Icon name="gearshape" label="Settings" onPress={() => router.push("/settings")} />
          </>
        ) : (
          <>
            <Icon name="chevron.left" label="Back" onPress={() => router.back()} />
            <View style={styles.usernameTitle}>
              {isPrivate && <SymbolView name="lock.fill" size={13} tintColor={colors.avatarGold} />}
              <Text style={styles.usernameText} numberOfLines={1}>{identity.username}</Text>
            </View>
            <View style={styles.icon} />
          </>
        )}
      </View>

      {isOwner ? (
        <View style={styles.row}>
          {photo}
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>{identity.displayName}</Text>
            <Text style={styles.username} numberOfLines={1}>@{identity.username}</Text>
            <View style={styles.stats}>{[stat("Friends", friendsText, onFriends), stat("Rounds", rounds), stat("Handicap", handicap)]}</View>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.row}>
            {photo}
            <View style={[styles.flex, styles.stats]}>
              {[stat("Rounds", rounds), ...(isPrivate ? [] : [stat("Friends", friendsText, onFriends)]), stat("Handicap", handicap)]}
            </View>
          </View>
          <Text style={[styles.name, styles.otherName]} numberOfLines={1}>{identity.displayName}</Text>
        </>
      )}

      {identity.bio ? <Text style={styles.bio} numberOfLines={3}>{identity.bio}</Text> : null}
      {identity.links.length > 0 && (
        <View style={styles.socials}>
          {identity.links.map((social) => (
            <Pressable key={social.platform} accessibilityRole="link" accessibilityLabel={`${socialLabel(social.platform)}: ${socialDisplay(social)}`}
              onPress={() => { Linking.openURL(social.url).catch(() => {}); }} style={styles.social}>
              <Text style={styles.socialText} numberOfLines={1}>{socialDisplay(social)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {actions ? <View style={styles.actions}>{actions}</View> : null}

      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Pressable key={t.key} accessibilityRole="tab" disabled={isPrivate} accessibilityState={{ selected: tab === t.key, disabled: isPrivate }} onPress={() => onTab(t.key)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t.key && !isPrivate && styles.tabOn, isPrivate && styles.tabOff]}>{t.label}</Text>
            {tab === t.key && !isPrivate && <View style={styles.tabBar} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Icon({ name, label, onPress, badge = 0 }: { name: "pencil" | "magnifyingglass" | "gearshape" | "chevron.left"; label: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} friend requests` : label} onPress={onPress} style={styles.icon}>
      <SymbolView name={name} size={name === "chevron.left" ? 24 : 23} tintColor={colors.cream} />
      {badge > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text></View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { backgroundColor: colors.maroon900, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingHorizontal: 20, paddingBottom: 4 },
  iconRow: { flexDirection: "row", alignItems: "center", height: minTap + 8, marginHorizontal: -8 },
  icon: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: "#d64545" },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: colors.white },
  usernameTitle: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  usernameText: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  row: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 4 },
  photoRing: { width: 86, height: 86, borderRadius: 43, borderWidth: 3, borderColor: colors.avatarGold, overflow: "hidden", backgroundColor: colors.cream },
  photo: { width: "100%", height: "100%" },
  name: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  otherName: { marginTop: 12, fontSize: 16 },
  username: { marginTop: 2, fontFamily: fonts.semibold, fontSize: 13, color: colors.avatarGold },
  stats: { flexDirection: "row", marginTop: 10 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  statLabel: { fontFamily: fonts.regular, fontSize: 13, color: "rgba(251,248,241,0.7)" },
  bio: { marginTop: 8, maxWidth: "90%", fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: "rgba(251,248,241,0.85)" },
  socials: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", rowGap: 6, maxWidth: "90%" },
  social: { width: "50%", paddingRight: 12 },
  socialText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.avatarGold },
  actions: { marginTop: 12, flexDirection: "row", gap: 8 },
  tabs: { flexDirection: "row", marginTop: 16, minHeight: 56 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabText: { fontFamily: fonts.semibold, fontSize: 17, color: "rgba(251,248,241,0.65)" },
  tabOn: { fontFamily: fonts.bold, color: colors.cream },
  tabOff: { color: "rgba(251,248,241,0.3)" },
  tabBar: { position: "absolute", bottom: 6, width: 32, height: 3, borderRadius: 2, backgroundColor: colors.avatarGold },
});

