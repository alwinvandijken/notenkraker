import { describe, expect, it, vi } from "vitest";
import { createUpdateState } from "./update";

describe("createUpdateState", () => {
  it("meldt een nieuwe versie aan wie luistert, ook als die later begint te luisteren", () => {
    const s = createUpdateState();
    const early = vi.fn();
    s.subscribe(early);
    s.needRefresh(async () => {});
    expect(early).toHaveBeenCalledWith(true);
    const late = vi.fn();
    s.subscribe(late);
    expect(late).toHaveBeenCalledWith(true);
  });

  it("werkt bij met de functie van de service worker", async () => {
    const s = createUpdateState();
    const update = vi.fn(async () => {});
    s.needRefresh(update);
    await s.apply();
    expect(update).toHaveBeenCalledWith(true);
  });

  it("doet niets zonder nieuwe versie", async () => {
    const s = createUpdateState();
    const seen = vi.fn();
    s.subscribe(seen);
    expect(seen).toHaveBeenCalledWith(false);
    await expect(s.apply()).resolves.toBeUndefined();
  });
});
