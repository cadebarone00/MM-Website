import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Maroon Masters",
    short_name: "Maroon Masters",
    start_url: "/",
    display: "browser",
    icons: [
      { src: "/icons/mm-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/mm-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
