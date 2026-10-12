import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": bij een nieuwe versie vraagt een balkje of je wilt bijwerken (components/UpdateBalk.tsx)
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Notenkraker",
        short_name: "Notenkraker",
        description: "Noten leren lezen en spelen: grepen, spel en meeluisteren",
        lang: "nl",
        theme_color: "#172440",
        background_color: "#edf2f7",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // saxopnames (audio/sax.ts) na de eerste keer bewaren, zodat ze ook offline klinken
        runtimeCaching: [{
          urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/gh\/nbrosowsky\/tonejs-instruments@/,
          handler: "CacheFirst",
          options: { cacheName: "sax-samples", expiration: { maxEntries: 40 }, cacheableResponse: { statuses: [200] } },
        }],
      },
    }),
  ],
  // versie voor feedback (AC-116): de commit die Netlify bouwt, lokaal "dev"
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify((process.env.COMMIT_REF ?? "dev").slice(0, 7)) },
  resolve: { alias: { "@": "/src" } },
  server: { port: 5173 },
});
