import { test as base, expect, type Page } from "@playwright/test";

export { expect };
export const test = base;

/** hamburgermenu rechtsboven openen en een keuze maken */
export async function kiesInMenu(page: Page, label: string | RegExp) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Hoofdmenu" }).getByRole("button", { name: label }).click();
}

/**
 * Eén ronde notenspel met de knoppen: steeds de eerste naamknop tikken tot "▶ Spelen" terugkomt
 * (ronde vol of levens op). Goed of fout maakt niet uit; de noten zijn willekeurig.
 */
export async function speelRonde(page: Page) {
  const spelen = page.getByRole("button", { name: "▶ Spelen" });
  await page.getByRole("button", { name: "Knoppen" }).click();
  await spelen.click();
  const naam = page.getByRole("button", { name: /^[A-G][a-z]{0,2}$/ }).first();
  for (let i = 0; i < 40; i++) {
    await expect(spelen.or(naam)).toBeVisible();
    if (await spelen.isVisible()) return;
    await naam.click();
  }
  throw new Error("ronde notenspel eindigde niet na 40 antwoorden");
}
