import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BitByBit Cursats",
    short_name: "Cursats",
    description:
      "Lightning checkout for Argentine educators — pay in sats, settle in pesos.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f0f1a",
    theme_color: "#f7a825",
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
