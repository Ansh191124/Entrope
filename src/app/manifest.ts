import type { MetadataRoute } from "next";

// Next.js auto-detects this file and serves it at /manifest.webmanifest,
// linking it from every page's <head> automatically — no manual <link> tag
// needed. start_url targets the student experience specifically: this PWA
// packaging is for students installing CampusGuard on their phone, not the
// admin/officer consoles.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/student",
    name: "CampusGuard",
    short_name: "CampusGuard",
    description: "Generate your entry QR and scan to exit — campus access for students.",
    start_url: "/student",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    categories: ["education", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
