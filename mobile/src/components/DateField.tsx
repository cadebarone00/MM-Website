import { useState } from "react";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius } from "~/lib/theme.ts";

/** A date field: the native iOS date pill (tap → calendar); on Android, tapping opens the system date dialog. */
export function DateField({ label, value, onChange, minimumDate, maximumDate }: {
  label: string; value: Date; onChange: (date: Date) => void; minimumDate?: Date; maximumDate?: Date;
}) {
  const [androidOpen, setAndroidOpen] = useState(false);
  const pick = (event: DateTimePickerEvent, date?: Date) => {
    setAndroidOpen(false);
    if (event.type === "set" && date) onChange(date);
  };
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === "ios" ? (
        <DateTimePicker value={value} mode="date" display="compact" onChange={pick} minimumDate={minimumDate} maximumDate={maximumDate}
          accentColor={colors.maroon700} accessibilityLabel={label} />
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setAndroidOpen(true)}>
            <Text style={styles.value}>{value.toLocaleDateString()}</Text>
          </Pressable>
          {androidOpen && <DateTimePicker value={value} mode="date" onChange={pick} minimumDate={minimumDate} maximumDate={maximumDate} />}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14 },
  label: { fontFamily: fonts.regular, fontSize: 17, color: colors.ink },
  value: { fontFamily: fonts.semibold, fontSize: 17, color: colors.maroon700 },
});
