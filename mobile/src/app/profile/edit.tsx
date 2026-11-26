import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RoundsVisibility } from "@/lib/platform/playerRoundsPrivacy";
import { BIO_MAX, GENDERS, genderLabel, limitBio, NAME_MAX, nameProblem, USERNAME_RULE, usernameProblem, type ProfileEditInput } from "@/lib/profile/profileEdit";
import { PRIVACY_EXPLAIN } from "@/lib/profile/privacyExplain";
import { SOCIAL_PLATFORMS, SOCIALS_MAX, socialDisplay, socialFromInput, socialLabel, type ProfileSocial, type SocialPlatform } from "@/lib/profile/profileSocials";
import { Avatar } from "~/components/Avatar.tsx";
import { PillToggle } from "~/components/PillToggle.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { apiGet, apiJson, apiUpload, assetUrl } from "~/lib/api.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

type Gender = (typeof GENDERS)[number]["value"];
/** What GET /api/app/profile?view=edit sends (website EditProfileInitial). */
type Initial = {
  displayName: string; username: string; bio: string; bioAvailable: boolean; gender: Gender | ""; genderAvailable: boolean;
  links: ProfileSocial[]; linksAvailable: boolean; photoUrl: string | null; photoAvailable: boolean; visibility: RoundsVisibility | null;
};

/**
 * Edit profile (website EditProfileScreen, Instagram's layout; project_specs.md "Expo app Step 3", part 3b): Back ·
 * Edit profile · Save; photo + avatar; Name, Username, Bio typed in place; Socials and Gender on their own screens;
 * Private profile. Save (dim until something changes) saves Name / Username / Bio / Gender together; photo, socials
 * and Private profile save the moment they change. The rules are the website's (lib/profile/profileEdit.ts).
 */
export default function EditProfile() {
  useLightStatusBar();
  const [initial, setInitial] = useState<Initial | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<{ status: string; form?: Initial }>("/api/app/profile?view=edit").then((reply) => {
      if (reply.ok && reply.data.status === "ok" && reply.data.form) setInitial(reply.data.form);
      else setLoadError(reply.ok ? "Finish setting up your profile first." : reply.error);
    });
  }, []);
  if (!initial) {
    return (
      <SafeAreaView style={styles.page} edges={["top"]}>
        <StateSlot height={240} tone="dark" state={loadError ? { kind: "error", message: loadError, onRetry: () => router.back() } : { kind: "loading" }} />
      </SafeAreaView>
    );
  }
  return <EditForm initial={initial} />;
}

function EditForm({ initial }: { initial: Initial }) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [gender, setGender] = useState<Gender | "">(initial.gender);
  const [links, setLinks] = useState(initial.links);
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [panel, setPanel] = useState<null | "links" | "gender">(null);
  const [busy, setBusy] = useState<null | "save" | "photo" | "visibility">(null);
  const [error, setError] = useState("");

  const usernameChanged = username.trim() !== initial.username;
  const changes: ProfileEditInput = {
    ...(displayName.trim() !== initial.displayName.trim() && { displayName }),
    ...(usernameChanged && { username: username.trim() }),
    ...(initial.bioAvailable && bio.trim() !== initial.bio.trim() && { bio }),
    ...(initial.genderAvailable && gender !== initial.gender && { gender }),
  };
  const dirty = Object.keys(changes).length > 0;
  const name = displayName.trim() || username.trim() || "?";

  async function save() {
    if (!dirty) return;
    const problem = nameProblem(displayName) ?? (usernameChanged ? usernameProblem(username.trim()) : null);
    if (problem) { setError(problem); return; }
    setBusy("save"); setError("");
    const reply = await apiJson("/api/account/profile", { method: "PATCH", body: changes });
    setBusy(null);
    if (reply.ok) router.back();
    else setError(reply.error || "Couldn't save your profile. Try again.");
  }
  const back = () => dirty ? Alert.alert("Discard changes?", "Your changes to name, username, bio or gender won't be saved.", [
    { text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => router.back() },
  ]) : router.back();

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 3 * 1024 * 1024) { setError("That photo is too big. Use one under 3 MB."); return; }
    setBusy("photo"); setError("");
    const reply = await apiUpload<{ url?: string }>("/api/account/photo", { uri: asset.uri, name: asset.fileName ?? "photo.jpg", type: asset.mimeType ?? "image/jpeg" });
    setBusy(null);
    if (reply.ok) setPhotoUrl(typeof reply.body.url === "string" ? reply.body.url : asset.uri);
    else setError(reply.error || "Couldn't change your photo. Try again.");
  }
  async function removePhoto() {
    setBusy("photo"); setError("");
    const reply = await apiJson("/api/account/photo", { method: "DELETE" });
    setBusy(null);
    if (reply.ok) setPhotoUrl(null); else setError(reply.error || "Couldn't change your photo. Try again.");
  }
  const editPicture = () => Alert.alert("Picture or avatar", "Your avatar is your initials. It shows anywhere you don't have a photo.", [
    ...(initial.photoAvailable ? [{ text: photoUrl ? "Change photo" : "Add a photo", onPress: () => void pickPhoto() }] : []),
    ...(photoUrl ? [{ text: "Remove photo", style: "destructive" as const, onPress: () => void removePhoto() }] : []),
    { text: "Cancel", style: "cancel" as const },
  ]);
  async function toggleVisibility() {
    if (!visibility || busy) return;
    const previous = visibility;
    const next: RoundsVisibility = visibility === "private" ? "public" : "private";
    setVisibility(next); setBusy("visibility"); setError("");
    const reply = await apiJson("/api/account/privacy", { method: "PUT", body: { visibility: next } });
    setBusy(null);
    if (!reply.ok) { setVisibility(previous); setError(reply.error || "We couldn't save that. Try again."); }
  }

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.icon}><SymbolView name="chevron.left" size={24} tintColor={colors.cream} /></Pressable>
          <Text style={styles.title}>Edit profile</Text>
          <Pressable accessibilityRole="button" disabled={!dirty || busy === "save"} onPress={() => void save()} style={styles.saveButton}>
            <Text style={[styles.save, (!dirty || busy === "save") && styles.off]}>{busy === "save" ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.circles}>
            {photoUrl ? <View style={styles.photoRing}><Image source={{ uri: assetUrl(photoUrl) }} style={styles.photo} contentFit="cover" /></View>
              : <View style={styles.emptyPhoto}><SymbolView name="camera" size={28} tintColor={colors.wizardMuted} /></View>}
            <Avatar name={name} size={92} />
          </View>
          <Pressable accessibilityRole="button" disabled={busy === "photo"} onPress={editPicture} style={styles.editPicture}>
            {busy === "photo" ? <ActivityIndicator color={colors.goldBright} /> : <Text style={styles.editPictureText}>Edit picture or avatar</Text>}
          </Pressable>
          {!initial.photoAvailable && <Text style={styles.hint}>Profile photos are coming soon.</Text>}

          <Row label="Name"><TextInput value={displayName} onChangeText={setDisplayName} maxLength={NAME_MAX} placeholder="Name" placeholderTextColor={colors.wizardDisabledInk} style={styles.input} accessibilityLabel="Name" /></Row>
          <Row label="Username">
            <TextInput value={username} onChangeText={setUsername} maxLength={30} autoCapitalize="none" autoCorrect={false} placeholder="Username" placeholderTextColor={colors.wizardDisabledInk} style={styles.input} accessibilityLabel="Username" />
            {usernameChanged && <Text style={styles.hint}>{USERNAME_RULE}</Text>}
          </Row>
          {initial.bioAvailable && (
            <Row label="Bio">
              <TextInput value={bio} onChangeText={(t) => setBio(limitBio(t))} maxLength={BIO_MAX} multiline placeholder="Bio" placeholderTextColor={colors.wizardDisabledInk} style={[styles.input, styles.bio]} accessibilityLabel="Bio" />
              <Text style={styles.hint}>{bio.length} / {BIO_MAX}</Text>
            </Row>
          )}
          {initial.linksAvailable && <NavRow label="Socials" value={`${links.length} of ${SOCIALS_MAX}`} onPress={() => setPanel("links")} />}
          {initial.genderAvailable && <NavRow label="Gender" value={genderLabel(gender) || "Not set"} onPress={() => setPanel("gender")} />}
          {visibility && (
            <View style={styles.privacy}>
              <PillToggle tone="dark" label="Private profile" note={PRIVACY_EXPLAIN[visibility]} value={visibility === "private"} disabled={busy === "visibility"} onChange={() => void toggleVisibility()} />
            </View>
          )}
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={panel === "gender"} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPanel(null)}>
        <View style={styles.sheet}>
          <View style={styles.sheetTop}><Text style={styles.sheetTitle}>Gender</Text><SheetClose onPress={() => setPanel(null)} /></View>
          <Text style={styles.hintBig}>This won&apos;t be part of your public profile. Only you can see it. It saves when you tap Save.</Text>
          {GENDERS.map((option) => (
            <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: gender === option.value }} onPress={() => { setGender(option.value); setPanel(null); }} style={styles.option}>
              <Text style={styles.optionText}>{option.label}</Text>
              {gender === option.value && <SymbolView name="checkmark" size={16} tintColor={colors.goldBright} />}
            </Pressable>
          ))}
        </View>
      </Modal>
      <Modal visible={panel === "links"} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPanel(null)}>
        <SocialsPanel initial={links} onClose={(saved) => { if (saved) setLinks(saved); setPanel(null); }} />
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Socials (website SocialsPanel): up to 4, one per app. The list (with remove) and + Add social → pick an app → type
 * the username (or paste the profile link) → Save. Every add / remove saves right away (PUT /api/account/links).
 */
function SocialsPanel({ initial, onClose }: { initial: ProfileSocial[]; onClose: (saved: ProfileSocial[] | null) => void }) {
  const [socials, setSocials] = useState(initial);
  const [step, setStep] = useState<"list" | "pick" | SocialPlatform>("list");
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const used = new Set(socials.map((s) => s.platform));

  async function store(next: ProfileSocial[]) {
    setSaving(true); setError("");
    const reply = await apiJson<{ links?: ProfileSocial[] }>("/api/account/links", { method: "PUT", body: { links: next.map(({ platform, url }) => ({ platform, url })) } });
    setSaving(false);
    if (!reply.ok) { setError(reply.error || "Couldn't save your socials. Try again."); return; }
    setSocials(reply.body.links ?? next); setStep("list"); setTyped("");
  }
  function add(platform: SocialPlatform) {
    const result = socialFromInput(platform, typed);
    if (!result.ok) { setError(result.error); return; }
    void store([...socials, result.social]);
  }
  const title = step === "list" ? "Socials" : step === "pick" ? "Add social" : socialLabel(step);
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetTop}>
        {step !== "list" ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { setError(""); setStep(step === "pick" ? "list" : "pick"); }} style={styles.icon}><SymbolView name="chevron.left" size={22} tintColor={colors.cream} /></Pressable> : null}
        <Text style={[styles.sheetTitle, styles.flex]}>{title}</Text>
        {step !== "list" && step !== "pick"
          ? <Pressable accessibilityRole="button" disabled={saving || !typed.trim()} onPress={() => add(step)}><Text style={[styles.save, (saving || !typed.trim()) && styles.off]}>{saving ? "Saving…" : "Save"}</Text></Pressable>
          : <SheetClose onPress={() => onClose(socials)} />}
      </View>
      {step === "list" && (
        <>
          {socials.map((s) => (
            <View key={s.platform} style={styles.option}>
              <View style={styles.flex}><Text style={styles.optionText}>{socialDisplay(s)}</Text><Text style={styles.hint}>{socialLabel(s.platform)}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${socialLabel(s.platform)}`} disabled={saving} onPress={() => void store(socials.filter((x) => x.platform !== s.platform))} style={styles.icon}>
                <SymbolView name="xmark" size={14} tintColor={colors.wizardMuted} />
              </Pressable>
            </View>
          ))}
          {socials.length < SOCIALS_MAX ? <Pressable accessibilityRole="button" onPress={() => setStep("pick")} style={styles.addSocial}><Text style={styles.editPictureText}>+ Add social</Text></Pressable>
            : <Text style={styles.hint}>You can add up to {SOCIALS_MAX}.</Text>}
        </>
      )}
      {step === "pick" && SOCIAL_PLATFORMS.filter((p) => !used.has(p.id)).map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => { setTyped(""); setStep(p.id); }} style={styles.option}>
          <Text style={styles.optionText}>{p.label}</Text><SymbolView name="chevron.right" size={14} tintColor={colors.wizardMuted} />
        </Pressable>
      ))}
      {step !== "list" && step !== "pick" && (
        <View style={styles.field}>
          <Text style={styles.label}>{SOCIAL_PLATFORMS.find((p) => p.id === step)?.hint}</Text>
          <TextInput value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} autoFocus onSubmitEditing={() => add(step)} style={styles.input} accessibilityLabel={socialLabel(step)} />
        </View>
      )}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><View style={styles.flex}>{children}</View></View>;
}

function NavRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.flex, styles.navValue]}>{value}</Text>
      <SymbolView name="chevron.right" size={14} tintColor={colors.wizardMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  page: { flex: 1, backgroundColor: colors.maroon900 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, height: 52 },
  icon: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  saveButton: { minWidth: minTap + 12, height: minTap, alignItems: "center", justifyContent: "center" },
  save: { fontFamily: fonts.bold, fontSize: 16, color: colors.goldBright },
  off: { opacity: 0.4 },
  body: { paddingHorizontal: gutter, paddingBottom: 48, gap: 4 },
  circles: { flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 8 },
  photoRing: { width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: colors.avatarGold, overflow: "hidden" },
  photo: { width: "100%", height: "100%" },
  emptyPhoto: { width: 92, height: 92, borderRadius: 46, borderWidth: 1, borderStyle: "dashed", borderColor: colors.wizardLine, alignItems: "center", justifyContent: "center" },
  editPicture: { alignSelf: "center", minHeight: minTap, justifyContent: "center", marginVertical: 4 },
  editPictureText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.goldBright },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.wizardLine },
  label: { width: 88, paddingTop: 2, fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  input: { padding: 0, minHeight: 24, fontFamily: fonts.regular, fontSize: 16, color: colors.cream },
  bio: { minHeight: 66, textAlignVertical: "top" },
  navValue: { fontFamily: fonts.regular, fontSize: 16, color: colors.wizardMuted },
  hint: { marginTop: 4, fontFamily: fonts.regular, fontSize: 12, color: colors.wizardMuted },
  hintBig: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.wizardMuted, marginBottom: 8 },
  privacy: { marginTop: 16 },
  error: { marginTop: 12, fontFamily: fonts.regular, fontSize: 14, color: colors.errorOnMaroon },
  sheet: { flex: 1, padding: gutter, gap: 6, backgroundColor: colors.maroon900 },
  sheetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
  option: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.wizardLine },
  optionText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  addSocial: { minHeight: 52, justifyContent: "center" },
  field: { gap: 4, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.wizardFill },
});
