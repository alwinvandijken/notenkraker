import { describe, expect, it } from "vitest";
import { assertLocal, parseStatusEnv } from "./supabase-env";

describe("parseStatusEnv", () => {
  it("leest KEY=\"waarde\"-regels", () => {
    const env = parseStatusEnv('API_URL="http://127.0.0.1:54321"\nANON_KEY="abc"\nruis zonder is\n');
    expect(env).toEqual({ API_URL: "http://127.0.0.1:54321", ANON_KEY: "abc" });
  });
});

describe("assertLocal", () => {
  it("staat localhost en 127.0.0.1 toe", () => {
    expect(() => assertLocal("http://127.0.0.1:54321")).not.toThrow();
    expect(() => assertLocal("http://localhost:54321")).not.toThrow();
  });
  it("weigert de clouddatabase", () => {
    expect(() => assertLocal("https://mtkkxpycnzleqdkvkegy.supabase.co")).toThrow(/alleen tegen een lokale Supabase/);
  });
});
