import { useState } from "react";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text } from "react-native";
import { AuthFrame, AuthMessage } from "~/components/auth/AuthFrame.tsx";
import { Button } from "~/components/Button.tsx";
import { apiUpload } from "~/lib/api.ts";
import { colors, fonts, radius } from "~/lib/theme.ts";

type Picked = { uri: string; name: string; type: string };

/** Add a profile image (website PhotoScreen), optional: pick + square crop (the phone's own editor) → POST /api/account/photo. "Skip for now" saves nothing. */
export default function Photo() {
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhoto({ uri: asset.uri, name: asset.fileName ?? "photo.jpg", type: asset.mimeType ?? "image/jpeg" });
  }

  async function next() {
    if (!photo) { router.replace("/onboarding/settings"); return; }
    setBusy(true); setError(null);
    const r = await apiUpload("/api/account/photo", photo);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.replace("/onboarding/settings");
  }

  return (
    <AuthFrame title="Add a profile image" subtitle="Pick a photo so your golf buddies know it's you." progress="photo">
      <Pressable accessibilityRole="button" accessibilityLabel={photo ? "Change your photo" : "Choose a photo"} onPress={() => void choose()} style={styles.tile}>
        {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel="Your profile photo" />
          : <><SymbolView name="person.crop.circle.badge.plus" size={44} tintColor={colors.goldBright} /><Text style={styles.tap}>Tap to choose a photo</Text></>}
      </Pressable>
      <AuthMessage error={error} />
      <Button label={busy ? "Uploading…" : photo ? "Continue" : "Skip for now"} onPress={() => void next()} disabled={busy} loading={busy} />
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  tile: { alignSelf: "center", width: 200, height: 200, borderRadius: 100, alignItems: "center", justifyContent: "center", gap: 8, overflow: "hidden", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.gold, backgroundColor: colors.wizardFill },
  photo: { width: "100%", height: "100%", borderRadius: radius.pill },
  tap: { fontFamily: fonts.semibold, fontSize: 14, color: colors.wizardMuted },
});
