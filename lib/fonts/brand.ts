import localFont from "next/font/local";

// Same configured faces and CSS variables as the former Google loaders. No network at build time.

export const spectral = localFont({
  src: [
    {
      path: "../../public/fonts/spectral/Spectral-Light.ttf",
      weight: "300",
      style: "normal"
    },
    {
      path: "../../public/fonts/spectral/Spectral-LightItalic.ttf",
      weight: "300",
      style: "italic"
    },
    {
      path: "../../public/fonts/spectral/Spectral-Regular.ttf",
      weight: "400",
      style: "normal"
    },
    {
      path: "../../public/fonts/spectral/Spectral-Italic.ttf",
      weight: "400",
      style: "italic"
    },
    {
      path: "../../public/fonts/spectral/Spectral-Medium.ttf",
      weight: "500",
      style: "normal"
    },
    {
      path: "../../public/fonts/spectral/Spectral-MediumItalic.ttf",
      weight: "500",
      style: "italic"
    },
    {
      path: "../../public/fonts/spectral/Spectral-SemiBold.ttf",
      weight: "600",
      style: "normal"
    },
    {
      path: "../../public/fonts/spectral/Spectral-SemiBoldItalic.ttf",
      weight: "600",
      style: "italic"
    },
    {
      path: "../../public/fonts/spectral/Spectral-Bold.ttf",
      weight: "700",
      style: "normal"
    },
    {
      path: "../../public/fonts/spectral/Spectral-BoldItalic.ttf",
      weight: "700",
      style: "italic"
    },
    {
      path: "../../public/fonts/spectral/Spectral-ExtraBold.ttf",
      weight: "800",
      style: "normal"
    },
    {
      path: "../../public/fonts/spectral/Spectral-ExtraBoldItalic.ttf",
      weight: "800",
      style: "italic"
    }
  ],
  display: "swap",
  variable: "--font-spectral",
  adjustFontFallback: false,
  fallback: [
    "Spectral Fallback"
  ]
});

export const barlow = localFont({
  src: [
    {
      path: "../../public/fonts/barlow/Barlow-Light.ttf",
      weight: "300",
      style: "normal"
    },
    {
      path: "../../public/fonts/barlow/Barlow-LightItalic.ttf",
      weight: "300",
      style: "italic"
    },
    {
      path: "../../public/fonts/barlow/Barlow-Regular.ttf",
      weight: "400",
      style: "normal"
    },
    {
      path: "../../public/fonts/barlow/Barlow-Italic.ttf",
      weight: "400",
      style: "italic"
    },
    {
      path: "../../public/fonts/barlow/Barlow-Medium.ttf",
      weight: "500",
      style: "normal"
    },
    {
      path: "../../public/fonts/barlow/Barlow-MediumItalic.ttf",
      weight: "500",
      style: "italic"
    },
    {
      path: "../../public/fonts/barlow/Barlow-SemiBold.ttf",
      weight: "600",
      style: "normal"
    },
    {
      path: "../../public/fonts/barlow/Barlow-SemiBoldItalic.ttf",
      weight: "600",
      style: "italic"
    },
    {
      path: "../../public/fonts/barlow/Barlow-Bold.ttf",
      weight: "700",
      style: "normal"
    },
    {
      path: "../../public/fonts/barlow/Barlow-BoldItalic.ttf",
      weight: "700",
      style: "italic"
    }
  ],
  display: "swap",
  variable: "--font-barlow",
  adjustFontFallback: false,
  fallback: [
    "Barlow Fallback"
  ]
});

export const barlowCondensed = localFont({
  src: [
    {
      path: "../../public/fonts/barlow-semi-condensed/BarlowSemiCondensed-Regular.ttf",
      weight: "400",
      style: "normal"
    },
    {
      path: "../../public/fonts/barlow-semi-condensed/BarlowSemiCondensed-Medium.ttf",
      weight: "500",
      style: "normal"
    },
    {
      path: "../../public/fonts/barlow-semi-condensed/BarlowSemiCondensed-SemiBold.ttf",
      weight: "600",
      style: "normal"
    },
    {
      path: "../../public/fonts/barlow-semi-condensed/BarlowSemiCondensed-Bold.ttf",
      weight: "700",
      style: "normal"
    }
  ],
  display: "swap",
  variable: "--font-barlow-condensed",
  adjustFontFallback: false,
  fallback: [
    "Barlow Semi Condensed Fallback"
  ]
});
