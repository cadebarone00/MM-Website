import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Maroon",
    short_name: "The Maroon",
    start_url: "/",
    id: "/",
    display: "standalone",
    theme_color: "#240001",
    background_color: "#240001",
    icons: [
      { src: "/icons/mm-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/mm-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
