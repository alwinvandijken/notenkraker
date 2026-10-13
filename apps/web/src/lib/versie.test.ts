import { describe, expect, it } from "vitest";
import { versieLabel } from "./versie";

describe("versieLabel", () => {
  it("productie: versie, commit en bouwdatum", () => {
    expect(versieLabel({ semver: "0.2.0", commit: "abc1234", built: "2026-10-13T09:30:00Z", branch: "main" }))
      .toBe("Versie 0.2.0 · abc1234 · 13 okt 2026");
  });
  it("op de testsite staat erbij dat het de testsite is", () => {
    expect(versieLabel({ semver: "0.2.0", commit: "abc1234", built: "2026-10-13T09:30:00Z", branch: "develop" }))
      .toBe("Versie 0.2.0 · abc1234 · 13 okt 2026 · testsite");
  });
  it("een preview van een PR en lokaal heten zo", () => {
    expect(versieLabel({ semver: "0.2.0", commit: "abc1234", built: "2026-10-13T09:30:00Z", branch: "feature/x" })).toMatch(/· preview$/);
    expect(versieLabel({ semver: "0.2.0", commit: "dev", built: "2026-10-13T09:30:00Z", branch: "" })).toMatch(/· lokaal$/);
  });
});
