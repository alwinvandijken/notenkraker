// Na de build, vóór vite preview: de bundel moet naar de lokale Supabase wijzen (apps/web/.env kan de cloud-URL bevatten).
import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** null als de bundel goed is, anders de reden. supabase-js noemt zelf "*.supabase.co"; dat telt niet. */
export function bundleProblem(js, want) {
  if (!want || !js.includes(want)) return `bundel bevat ${want} niet`;
  const cloud = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/);
  if (cloud) return `bundel wijst naar de clouddatabase (${cloud[0]})`;
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dir = new URL("../web/dist/assets/", import.meta.url);
  const want = process.env.VITE_SUPABASE_URL;
  const js = readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
  const problem = bundleProblem(js, want);
  if (problem) { console.error(`check-build: ${problem}`); process.exit(1); }
  console.log(`check-build: bundel gebruikt ${want}`);
}
