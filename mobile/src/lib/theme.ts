/** The Maroon's colors and fonts (same values as the website's globals.css). Use these, never hard-coded colors. */
export const colors = {
  maroon900: "#240001",
  maroon700: "#500001",
  cream: "#fbf8f1",
  card: "#ffffff",
  ink: "#240001",
  inkMuted: "#6b5552",
  gold: "#c9a86e",
  goldBright: "#e3c27f",
  onMaroon: "#f6eee8",
  tabInactive: "#8d7874",
  error: "#a3261c",
  errorOnMaroon: "#f2a9a0",
  line: "#e6ddd0",
  inputOnMaroon: "rgba(255,255,255,0.05)",
  maroon500: "#872a2e",
  // Avatar (website ProfileAvatar.module.css): thin gold ring, faint gold fill, gold initials.
  avatarGold: "#dcc495",
  avatarRing: "rgba(220,196,149,0.5)",
  avatarFill: "rgba(220,196,149,0.12)",
  // Sheet close X (website SheetClose.module.css): see-through maroon rounded square.
  closeFill: "rgba(135,42,46,0.45)",
  closeRing: "rgba(220,196,149,0.22)",
  pillOff: "#cfc6bb",
  // Standard search (website components/search/Search.module.css): solid maroon page.
  searchInk: "#f4efe6",
  searchMuted: "rgba(244,239,230,0.6)",
  searchFaint: "rgba(244,239,230,0.5)",
  searchField: "rgba(244,239,230,0.1)",
  searchLine: "rgba(244,239,230,0.15)",
  problem: "#9b1c1c",
  white: "#ffffff",
  money: { up: "#2e7d4f", down: "#a3261c" },
} as const;

/** Rounded corners used everywhere. */
export const radius = { card: 16, control: 12, close: 10, pill: 999 } as const;

/** Smallest tap target (Apple's 44pt rule). */
export const minTap = 44;

export const fonts = {
  regular: "Spectral_400Regular",
  semibold: "Spectral_600SemiBold",
  bold: "Spectral_700Bold",
} as const;

/** Everything sits 16px from the phone's edges (same rule as the website's --page-gutter). */
export const gutter = 16;
