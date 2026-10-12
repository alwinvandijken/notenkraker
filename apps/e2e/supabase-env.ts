import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** URL en sleutels van de lokale Supabase, uitgelezen met `supabase status -o env` */
export interface SupabaseEnv { url: string; anonKey: string; serviceRoleKey: string }

const REPO = fileURLToPath(new URL("../..", import.meta.url));

export function parseStatusEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const m of text.matchAll(/^([A-Z0-9_]+)="(.*)"$/gm)) env[m[1]!] = m[2]!;
  return env;
}

/** e2e maakt en wijzigt gebruikers: nooit tegen de gedeelde clouddatabase */
export function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") throw new Error(`E2E draait alleen tegen een lokale Supabase, niet tegen ${host}`);
}

let cached: SupabaseEnv | undefined;
export function loadSupabaseEnv(): SupabaseEnv {
  if (cached) return cached;
  let out: string;
  try { out = execSync("supabase status -o env", { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { throw new Error("Start eerst de lokale Supabase: supabase start"); }
  const env = parseStatusEnv(out);
  if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error("Start eerst de lokale Supabase: supabase start");
  assertLocal(env.API_URL);
  return (cached = { url: env.API_URL, anonKey: env.ANON_KEY, serviceRoleKey: env.SERVICE_ROLE_KEY });
}
