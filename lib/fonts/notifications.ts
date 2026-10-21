import localFont from "next/font/local";

// Imported only by notification previews: never attach these fonts to the root layout.

export const appleSystem = localFont({
  src: [
    {
      path: "../../public/fonts/inter/Inter-400-normal.ttf",
      weight: "400",
      style: "normal"
    },
    {
      path: "../../public/fonts/inter/Inter-500-normal.ttf",
      weight: "500",
      style: "normal"
    },
    {
      path: "../../public/fonts/inter/Inter-600-normal.ttf",
      weight: "600",
      style: "normal"
    },
    {
      path: "../../public/fonts/inter/Inter-700-normal.ttf",
      weight: "700",
      style: "normal"
    }
  ],
  display: "swap",
  variable: "--font-apple-system",
  adjustFontFallback: false,
  fallback: [
    "Inter Fallback"
  ]
});

export const androidSystem = localFont({
  src: [
    {
      path: "../../public/fonts/roboto/Roboto-400-normal.ttf",
      weight: "400",
      style: "normal"
    },
    {
      path: "../../public/fonts/roboto/Roboto-500-normal.ttf",
      weight: "500",
      style: "normal"
    },
    {
      path: "../../public/fonts/roboto/Roboto-700-normal.ttf",
      weight: "700",
      style: "normal"
    }
  ],
  display: "swap",
  variable: "--font-android-system",
  adjustFontFallback: false,
  fallback: [
    "Roboto Fallback"
  ]
});
