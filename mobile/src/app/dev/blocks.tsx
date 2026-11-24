import { useState, type ReactNode } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "~/components/Avatar.tsx";
import { Button } from "~/components/Button.tsx";
import { Card } from "~/components/Card.tsx";
import { CodeCard } from "~/components/CodeCard.tsx";
import { DateField } from "~/components/DateField.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { PillToggle } from "~/components/PillToggle.tsx";
import { SearchBar, SearchNote, SearchProblem, SearchRow } from "~/components/Search.tsx";
import { SelectField } from "~/components/SelectField.tsx";
import { StateSlot, type SlotState } from "~/components/StateSlot.tsx";
import { useTabBadges } from "~/lib/tabBadges.tsx";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/** Dev only (Profile → Building blocks): every shared piece in every state, to check on the phone (Step 0). */
export default function BuildingBlocks() {
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(true);
  const [handicap, setHandicap] = useState(false);
  const [holes, setHoles] = useState<"18" | "front" | "back" | null>("18");
  const [date, setDate] = useState(new Date());
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState<SlotState["kind"]>("loading");
  const { play, setPlay } = useTabBadges();
  const slotState: SlotState = slot === "loading" ? { kind: "loading" } : slot === "empty" ? { kind: "empty", message: "No rounds yet." }
    : slot === "error" ? { kind: "error", message: "Couldn't load your rounds.", onRetry: () => setSlot("loading") } : { kind: "ready" };

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title="Building blocks" back /></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Buttons">
          <Button label="Primary" onPress={() => {}} />
          <Button label="Secondary" variant="secondary" onPress={() => {}} />
          <Button label="Dark" variant="dark" onPress={() => {}} />
          <Button label="Delete round" variant="danger" onPress={() => {}} />
          <Button label="Tap to load" loading={busy} onPress={() => { setBusy(true); setTimeout(() => setBusy(false), 1500); }} />
          <Button label="Disabled" disabled onPress={() => {}} />
        </Section>

        <Section title="Cards">
          <Card><Text style={styles.body}>Light card on the cream page.</Text></Card>
          <Card tone="dark"><Text style={styles.bodyOnDark}>Dark maroon card.</Text></Card>
        </Section>

        <Section title="Avatars">
          <Card tone="dark">
            <View style={styles.row}>
              <Avatar name="Cade Barone" size={24} />
              <Avatar name="Cade Barone" size={40} />
              <Avatar name="Cam Smith" size={56} />
              <Avatar name="Uncle Rob" size={72} />
              <Avatar name="" size={40} />
            </View>
          </Card>
          <View style={styles.row}>
            <Avatar name="Cade Barone" size={40} onLight />
            <Text style={styles.body}>On a light page</Text>
          </View>
        </Section>

        <Section title="Slide-up (85%)">
          <Button label="Open a slide-up" variant="dark" onPress={() => router.push("/dev/sheet")} />
        </Section>

        <Section title="Page header">
          <Card><PageHeader title="Round" back onBack={() => {}} onSettings={() => {}} /></Card>
        </Section>

        <Section title="Pill toggles">
          <Card>
            <PillToggle label="Track stats" value={stats} onChange={setStats} />
            <PillToggle label="Count toward handicap" value={handicap} onChange={setHandicap} />
            <PillToggle label="Disabled" value={false} onChange={() => {}} disabled />
          </Card>
        </Section>

        <Section title="Select + date">
          <SelectField label="Holes" value={holes} onChange={setHoles}
            options={[{ value: "18", label: "18 holes" }, { value: "front", label: "Front 9" }, { value: "back", label: "Back 9" }]} />
          <DateField label="Date" value={date} onChange={setDate} />
        </Section>

        <Section title="Invite code">
          <CodeCard kind="round" code="ABC234" name="Eagle Pointe" />
        </Section>

        <Section title="Search">
          <View style={styles.searchPage}>
            <SearchBar value={query} onChange={setQuery} onBack={() => {}} onCancel={() => setQuery("")} placeholder="Search golfers" />
            <SearchRow title="Cade Barone" subtitle="@cade" person={{ name: "Cade Barone" }} onPress={() => {}} />
            <SearchRow title="Eagle Pointe Golf Club" subtitle="Tampa, FL" icon="flag" onPress={() => {}} />
            <SearchNote>No golfers match that name.</SearchNote>
            <SearchProblem>Search isn&apos;t working right now. Try again.</SearchProblem>
          </View>
        </Section>

        <Section title="Fixed-size slot (no jumping)">
          <View style={styles.row}>
            {(["loading", "empty", "error", "ready"] as const).map((kind) => (
              <Button key={kind} label={kind} variant={slot === kind ? "dark" : "secondary"} onPress={() => setSlot(kind)} style={styles.small} />
            ))}
          </View>
          <Card height={140}>
            <StateSlot state={slotState} height={108}>
              <Text style={styles.body}>Loaded content, same height as every other state.</Text>
            </StateSlot>
          </Card>
          <Text style={styles.body}>This text never moves.</Text>
        </Section>

        <Section title="Tab badge">
          <View style={styles.row}>
            <Button label="Badge +1" variant="secondary" onPress={() => setPlay(play + 1)} style={styles.small} />
            <Button label="Clear" variant="secondary" onPress={() => setPlay(0)} style={styles.small} />
          </View>
          <Text style={styles.body}>Play tab badge: {play}. Go back to the tabs to see it.</Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream },
  gutter: { paddingHorizontal: gutter },
  content: { paddingHorizontal: gutter, paddingBottom: 48, gap: 28 },
  section: { gap: 10 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  sectionBody: { gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  small: { flex: 1, minWidth: 70, height: 44 },
  body: { fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  bodyOnDark: { fontFamily: fonts.regular, fontSize: 16, color: colors.onMaroon },
  searchPage: { backgroundColor: colors.maroon900, borderRadius: 16, padding: gutter },
});
