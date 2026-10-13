import type { Page } from "@playwright/test";
import { expect, kiesTab, test } from "../fixtures";

/** Hoe ver het midden van de gekozen noot van het midden van de zichtbare rij ligt (px). */
async function afstandTotMidden(page: Page) {
  return page.getByRole("navigation", { name: "Kies een noot" }).evaluate((nav) => {
    const kies = nav.querySelector<Element>('[aria-pressed="true"]')!;
    let rij = kies.parentElement!;
    while (rij && getComputedStyle(rij).overflowX !== "auto") rij = rij.parentElement!;
    const r = kies.getBoundingClientRect(), c = rij.getBoundingClientRect();
    return Math.abs(r.left + r.width / 2 - (c.left + c.width / 2));
  });
}

for (const weergave of ["Letters", "Notenbalk"]) {
  // De gekozen noot staat altijd midden in de notenrij, ook na een paar keer ▶
  test(`de gekozen noot staat midden in de rij (${weergave})`, async ({ page }) => {
    await page.goto("/oefenen");
    await page.getByRole("button", { name: "Overslaan" }).click();
    await kiesTab(page, "Grepen");
    await page.getByRole("button", { name: "Weergave", exact: true }).click();
    await page.getByRole("group", { name: "Welke noten" }).getByRole("button", { name: "Alle" }).click();
    await page.getByRole("button", { name: weergave, exact: true }).click();
    await page.getByRole("button", { name: "← Terug" }).click();

    for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "Volgende noot" }).click();
    await expect.poll(() => afstandTotMidden(page)).toBeLessThan(8);
  });
}
