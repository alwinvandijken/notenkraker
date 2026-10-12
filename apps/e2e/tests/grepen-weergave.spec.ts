import { expect, kiesTab, test } from "../fixtures";

// AC-120 PR 4: Grepen met alleen de noot, Luister, de sax en de notenrij; de rest staat op Weergave
test("weergave bepaalt welke noten Grepen laat zien", async ({ page }) => {
  await page.goto("/oefenen");
  await page.getByRole("button", { name: "Overslaan" }).click();
  await kiesTab(page, "Grepen");
  await expect(page.getByRole("button", { name: "Luister" })).toBeVisible();
  // geen keuzes meer op het scherm zelf
  await expect(page.getByRole("group", { name: "Welke noten" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Klank" })).toHaveCount(0);
  // zonder account is er geen ouder of leraar: dan zet je de status zelf
  await expect(page.getByRole("group", { name: "Status" })).toBeVisible();

  const rij = page.getByRole("navigation", { name: "Kies een noot" }).getByRole("button", { pressed: false });
  const mijn = await rij.count();

  await page.getByRole("button", { name: "Weergave", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Weergave" })).toBeVisible();
  await page.getByRole("group", { name: "Welke noten" }).getByRole("button", { name: "Alle" }).click();
  await page.getByRole("button", { name: "← Terug" }).click();

  await expect(page.getByRole("button", { name: "Luister" })).toBeVisible();
  await expect.poll(() => rij.count()).toBeGreaterThan(mijn);
});
