import { defineConfig } from "vitest/config";

/** alleen de unittests van de hulpcode; de Playwright-specs in tests/ draaien via `pnpm e2e` */
export default defineConfig({ test: { include: ["*.test.ts"] } });
