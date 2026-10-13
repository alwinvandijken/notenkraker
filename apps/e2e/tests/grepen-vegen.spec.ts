import type { Locator } from "@playwright/test";
import { expect, kiesTab, test } from "../fixtures";

/** Een veeg met de vinger over de noot, als pointer-events (zoals iOS ze geeft). */
async function veeg(vlak: Locator, dx: number) {
  const box = (await vlak.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const opties = { pointerId: 1, pointerType: "touch", isPrimary: true, bubbles: true };
  await vlak.dispatchEvent("pointerdown", { ...opties, clientX: x - dx / 2, clientY: y });
  await vlak.dispatchEvent("pointermove", { ...opties, clientX: x, clientY: y + 4 });
  await vlak.dispatchEvent("pointerup", { ...opties, clientX: x + dx / 2, clientY: y + 6 });
}

// Op de noot naar links of rechts vegen gaat naar de volgende of vorige noot, zonder naar de notenrij te scrollen
test("vegen over de noot kiest de volgende en de vorige noot", async ({ page }) => {
  await page.goto("/oefenen");
  await page.getByRole("button", { name: "Overslaan" }).click();
  await kiesTab(page, "Grepen");
  const noot = page.getByRole("region", { name: "Noot" });
  const geschreven = noot.getByText(/^Geschreven /);
  await expect(geschreven).toBeVisible();
  const eerste = await geschreven.textContent();

  await veeg(noot, -160);
  await expect(geschreven).not.toHaveText(eerste!);
  // de notenrij loopt mee
  const gekozen = page.getByRole("navigation", { name: "Kies een noot" }).getByRole("button", { pressed: true });
  await expect(gekozen).toHaveCount(1);

  await veeg(noot, 160);
  await expect(geschreven).toHaveText(eerste!);

  // een korte of vooral verticale beweging is geen veeg
  await veeg(noot, -20);
  await expect(geschreven).toHaveText(eerste!);
});

// Tijdens het vegen schuift de noot met de vinger mee; loslaten zonder veeg zet hem terug
test("de noot schuift mee met de vinger", async ({ page }) => {
  await page.goto("/oefenen");
  await page.getByRole("button", { name: "Overslaan" }).click();
  await kiesTab(page, "Grepen");
  const noot = page.getByRole("region", { name: "Noot" });
  const schuif = noot.locator("[data-veeg]");
  const box = (await noot.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const opties = { pointerId: 1, pointerType: "touch", isPrimary: true, bubbles: true };
  await noot.dispatchEvent("pointerdown", { ...opties, clientX: x, clientY: y });
  await noot.dispatchEvent("pointermove", { ...opties, clientX: x - 40, clientY: y });
  await expect(schuif).toHaveCSS("transform", /matrix\(1, 0, 0, 1, -40, 0\)/);
  await noot.dispatchEvent("pointerup", { ...opties, clientX: x - 40, clientY: y });
  await expect(schuif).toHaveCSS("transform", "none");
});
