import { describe, expect, it } from "vitest";
import { bundleProblem } from "./check-build.mjs";

const LOCAL = "http://127.0.0.1:54321";

describe("bundleProblem", () => {
  it("accepteert een bundel met de lokale URL, ook als supabase-js *.supabase.co noemt", () => {
    expect(bundleProblem(`const u="${LOCAL}";e.push("*.supabase.co")`, LOCAL)).toBeNull();
  });
  it("weigert een bundel zonder de lokale URL", () => {
    expect(bundleProblem(`const u="https://abc.example"`, LOCAL)).toMatch(/bevat .* niet/);
  });
  it("weigert een bundel met een cloudproject", () => {
    expect(bundleProblem(`const u="${LOCAL}";const v="https://mtkkxpycnzleqdkvkegy.supabase.co"`, LOCAL)).toMatch(/clouddatabase/);
  });
});
