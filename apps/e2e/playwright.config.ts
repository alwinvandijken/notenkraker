import { defineConfig, devices } from "@playwright/test";
import { loadSupabaseEnv } from "./supabase-env";

const supabase = loadSupabaseEnv();
const PORT = 4173;

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${PORT}`, serviceWorkers: "block", trace: "retain-on-failure", screenshot: "only-on-failure", locale: "nl-NL" },
  projects: [
    { name: "webkit-ipad", use: { ...devices["iPad Pro 11"] } },
    { name: "webkit-iphone", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    // productiebuild met de lokale Supabase; omgevingsvariabelen gaan in Vite vóór apps/web/.env
    command: `pnpm --filter @notenkraker/web build && node apps/e2e/check-build.mjs && pnpm --filter @notenkraker/web preview --port ${PORT} --strictPort`,
    cwd: "../..",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_SUPABASE_URL: supabase.url, VITE_SUPABASE_ANON_KEY: supabase.anonKey },
  },
});
