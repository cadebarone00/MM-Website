import { useState } from "react";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "~/components/Button.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { assetUrl } from "~/lib/api.ts";
import { usePlayData } from "~/lib/playData.tsx";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";

/**
 * The featured trip's itinerary (website TripPromos sheet): photo, city, length, price levels, day-by-day plan, stay
 * and what's included. "Plan this trip" fills in a new Golf Trip, which arrives with Golf Trips in the new app.
 */
export default function FeaturedTripSheet() {
  const { trip } = usePlayData();
  const [tierId, setTierId] = useState("standard");
  const [note, setNote] = useState<string | null>(null);
  const tier = trip.tiers.find((t) => t.id === tierId) ?? trip.tiers[0];

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Text style={styles.topTitle} numberOfLines={1}>{trip.city} trip</Text>
        <SheetClose />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.photo}><Image source={{ uri: assetUrl(trip.image) }} style={StyleSheet.absoluteFill} contentFit="cover" /></View>
        <Text style={styles.title}>{trip.city}, {trip.region}</Text>
        <Text style={styles.meta}>{trip.length}</Text>
        {tier && (
          <>
            <View style={styles.tiers} accessibilityRole="radiogroup" accessibilityLabel="Price level">
              {trip.tiers.map((t) => (
                <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ checked: t.id === tier.id }} onPress={() => setTierId(t.id)}
                  style={[styles.tier, t.id === tier.id && styles.tierOn]}>
                  <Text style={[styles.tierLabel, t.id === tier.id && styles.tierTextOn]}>{t.label}</Text>
                  <Text style={[styles.tierPrice, t.id === tier.id && styles.tierTextOn]}>{t.price}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.price}><Text style={styles.bold}>{tier.price}</Text> per person, estimated</Text>
            <View style={styles.days} accessibilityLabel="Itinerary">
              {tier.days.map((d) => (
                <View key={d.day} style={styles.day}><Text style={styles.dayName}>{d.day}</Text><Text style={styles.dayPlan}>{d.plan}</Text></View>
              ))}
            </View>
            <View style={styles.line}><SymbolView name="bed.double" size={15} tintColor={colors.avatarGold} /><Text style={styles.body}>{tier.stay}</Text></View>
            {tier.includes.map((item) => (
              <View key={item} style={styles.line}><SymbolView name="checkmark" size={14} tintColor={colors.avatarGold} /><Text style={styles.body}>{item}</Text></View>
            ))}
          </>
        )}
        <Button label="Plan this trip" onPress={() => setNote("Planning a trip comes with Golf Trips in the new app. For now, use Plan this trip in the current app.")} style={styles.plan} />
        <Text style={styles.note} accessibilityLiveRegion="polite">{note ?? " "}</Text>
        <Text style={styles.fine}>Sample itinerary with estimated prices. Plan this trip fills in the trip setup for you, with suggested dates you can change.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: gutter, paddingBottom: 8 },
  topTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  content: { paddingHorizontal: gutter, paddingBottom: 40, gap: 10 },
  photo: { height: 180, borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.maroon700 },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.cream, marginTop: 4 },
  meta: { fontFamily: fonts.regular, fontSize: 15, color: colors.searchMuted },
  tiers: { flexDirection: "row", gap: 8, marginTop: 4 },
  tier: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorderSoft },
  tierOn: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  tierLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  tierPrice: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  tierTextOn: { color: colors.maroon900 },
  price: { fontFamily: fonts.regular, fontSize: 15, color: colors.cream },
  bold: { fontFamily: fonts.bold },
  days: { gap: 8, marginVertical: 4 },
  day: { flexDirection: "row", gap: 12 },
  dayName: { width: 36, fontFamily: fonts.bold, fontSize: 15, color: colors.avatarGold },
  dayPlan: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.cream },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  body: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.cream },
  plan: { marginTop: 10 },
  note: { minHeight: 40, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.boardLink },
  fine: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.searchFaint },
});
