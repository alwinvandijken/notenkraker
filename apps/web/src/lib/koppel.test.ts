import { describe, expect, it } from "vitest";
import { inviteLink, takeInviteFromUrl, pendingInvite, clearInvite, koppelFout } from "./koppel";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe("uitnodigingslink", () => {
  it("maakt een link naar /app met de code", () => {
    expect(inviteLink("https://notenkraker.netlify.app", "K7M2QX")).toBe("https://notenkraker.netlify.app/app?koppel=K7M2QX");
  });

  it("onthoudt de code uit de link en geeft de URL zonder code terug", () => {
    const store = memoryStorage();
    const clean = takeInviteFromUrl(new URL("https://x.nl/app?koppel=k7m2qx&a=1#top"), store);
    expect(pendingInvite(store)).toBe("K7M2QX");
    expect(clean).toBe("/app?a=1#top");
  });

  it("laat URL en opslag met rust zonder code", () => {
    const store = memoryStorage();
    expect(takeInviteFromUrl(new URL("https://x.nl/app"), store)).toBeNull();
    expect(pendingInvite(store)).toBeNull();
  });

  it("vergeet de code na gebruik", () => {
    const store = memoryStorage();
    takeInviteFromUrl(new URL("https://x.nl/app?koppel=ABC234"), store);
    clearInvite(store);
    expect(pendingInvite(store)).toBeNull();
  });
});

describe("foutmelding bij koppelen", () => {
  it("legt een verlopen of gebruikte code uit", () => {
    expect(koppelFout({ message: "code onbekend of verlopen" })).toBe("Deze link of code werkt niet meer: hij is al gebruikt of verlopen. Vraag je ouder om een nieuwe.");
  });
  it("legt uit dat alleen een kind zich kan koppelen", () => {
    expect(koppelFout({ message: "alleen voor leerlingen" })).toBe("Deze link is voor het kind. Log in met het account van je kind om te koppelen.");
  });
  it("valt terug op een algemene melding", () => {
    expect(koppelFout(new Error("Failed to fetch"))).toBe("Koppelen lukte niet. Probeer het opnieuw.");
  });
});
