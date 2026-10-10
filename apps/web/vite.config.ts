import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Notenkraker",
        short_name: "Notenkraker",
        description: "Noten leren lezen en spelen: grepen, spel en meeluisteren",
        lang: "nl",
        theme_color: "#e0862e",
        background_color: "#f4f1ea",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] },
    }),
  ],
  resolve: { alias: { "@": "/src" } },
  server: { port: 5173 },
});
