import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "~/components/Avatar.tsx";
import { apiGet } from "~/lib/api.ts";
import { turnOffPush } from "~/lib/push.ts";
import { supabase } from "~/lib/supabase.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";
import Settings from "~/app/settings.tsx";

type Identity = { displayName: string; username: string; avatarSrc: string | null };
type Reply = { page?: { status: string; profile?: { identity: Identity } } };

export function PlayMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  useFocusEffect(useCallback(() => {
    if (!visible) return;
    let active = true;
    void apiGet<Reply>("/api/app/profile").then((reply) => {
      if (active) setIdentity(reply.ok && reply.data?.page?.status === "ok" ? reply.data.page.profile?.identity ?? null : null);
    });
    return () => { active = false; };
  }, [visible]));

  const open = (destination: "/settings" | "/profile") => {
    if (destination === "/profile") { onClose(); router.navigate(destination); return; }
    progress.setValue(0);
    setShowSettings(true);
    Animated.timing(progress, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  };
  const backToMenu = () => Animated.timing(progress, { toValue: 0, duration: 250, useNativeDriver: true }).start(({ finished }) => { if (finished) setShowSettings(false); });
  async function logOut() {
    setBusy(true); setError("");
    try {
      await turnOffPush();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      onClose();
    } catch { setError("Couldn't Log Out. Please Try Again."); }
    finally { setBusy(false); }
  }
  const items: { label: string; action?: () => void }[] = [
    { label: "App Settings", action: () => open("/settings") },
    { label: "Your Activity", action: () => open("/profile") },
    { label: "Account & Security", action: () => open("/settings") },
    { label: "Notifications", action: () => open("/settings") },
    { label: "Resources" },
    { label: "Help", action: () => open("/settings") },
    { label: "Reviews" },
  ];
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={showSettings ? backToMenu : onClose}>
      <SafeAreaProvider>
      <SafeAreaView style={styles.page}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close Menu" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open Your Profile" onPress={() => open("/profile")} style={styles.identity}>
            <Avatar name={identity?.displayName ?? "You"} photoUrl={identity?.avatarSrc ?? null} size={48} />
            <Text style={styles.username} numberOfLines={1}>{identity?.username || "Your Profile"}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.list}>
            {items.map(({ label, action }) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled: !action }} disabled={!action} onPress={action} style={styles.item}>
              <Text style={[styles.itemText, !action && styles.disabled]}>{label}</Text><Text style={styles.chevron}>{action ? "›" : "Coming Soon"}</Text>
            </Pressable>)}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void logOut()} style={styles.item}><Text style={styles.itemText}>{busy ? "Logging Out…" : "Log Out"}</Text></Pressable>
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          </View>
        </ScrollView>
      </SafeAreaView>
      {showSettings && <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }] }]}><Settings onBack={backToMenu} /></Animated.View>}
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.darkBackground },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 64, paddingHorizontal: gutter },
  close: { position: "absolute", left: gutter, width: 44, height: 44, alignItems: "center", justifyContent: "center", zIndex: 1 },
  closeText: { color: colors.cream, fontSize: 32 },
  content: { paddingHorizontal: gutter, paddingBottom: 32 },
  identity: { flexDirection: "row", alignItems: "center", gap: 12, maxWidth: "65%" },
  username: { color: colors.cream, fontFamily: fonts.semibold, fontSize: 20, flexShrink: 1 },
  list: { marginTop: 12 },
  item: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.wizardLine },
  itemText: { color: colors.cream, fontFamily: fonts.semibold, fontSize: 18 },
  disabled: { opacity: 0.65 },
  chevron: { color: colors.wizardMuted, fontFamily: fonts.regular, fontSize: 16 },
  error: { color: colors.errorOnMaroon, marginTop: 12, fontFamily: fonts.regular },
});
