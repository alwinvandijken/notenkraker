import { describe, expect, it } from "vitest";
import { deviceLabel, linearNewUrl } from "./feedback";

describe("deviceLabel", () => {
  it("noemt apparaat en browser kort", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", 390)).toBe("iPhone · Safari · 390 px");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36", 1440)).toBe("Mac · Chrome · 1440 px");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36 Edg/154.0", 1280)).toBe("Windows · Edge · 1280 px");
  });

  it("herkent een iPad die zich als Mac voordoet aan het touchscherm", () => {
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", 1180, 5)).toBe("iPad · Safari · 1180 px");
  });
});

describe("linearNewUrl", () => {
  it("opent een nieuw Linear-issue met titel en tekst ingevuld", () => {
    const url = new URL(linearNewUrl({ kind: "idee", message: "Alleen de nieuwe noten oefenen.\nGraag!", screen: "Notenspel", displayName: "Lotte", role: "leerling", device: "iPhone", version: "abc123" }));
    expect(url.origin + url.pathname).toBe("https://linear.new/");
    expect(url.searchParams.get("title")).toBe("Feedback (idee): Alleen de nieuwe noten oefenen.");
    expect(url.searchParams.get("description")).toContain("Alleen de nieuwe noten oefenen.\nGraag!");
    expect(url.searchParams.get("description")).toContain("Notenspel");
  });

  it("kort een lange titel in", () => {
    const title = new URL(linearNewUrl({ kind: "fout", message: "x".repeat(200), screen: "", displayName: "", role: null, device: "", version: "" })).searchParams.get("title")!;
    expect(title.length).toBeLessThanOrEqual(90);
    expect(title.endsWith("…")).toBe(true);
  });
});
