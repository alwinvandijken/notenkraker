import { expect, inloggen, kiesInMenu, kiesTab, nieuwEmail, test, WACHTWOORD } from "../fixtures";

test("account maken, kennismaken, en na opnieuw inloggen niet nog eens", async ({ page }) => {
  const email = nieuwEmail("leerling");
  await page.goto("/app?nieuw");
  const form = page.locator("form");
  await page.getByRole("button", { name: "Ik ben leerling" }).click();
  await page.getByPlaceholder("Naam").fill("Robin");
  await page.getByPlaceholder("E-mail").fill(email);
  await page.getByPlaceholder("Wachtwoord").fill(WACHTWOORD);
  await form.getByRole("button", { name: "Account maken" }).click();

  await expect(page.getByRole("heading", { name: "Hoe oud ben je?" })).toBeVisible();
  await page.getByRole("button", { name: /9 – 12 jaar/ }).click();
  await page.getByRole("button", { name: /Net begonnen/ }).click();
  // klaar met kennismaken: Vandaag, met de tabbalk van de leerling
  const vandaag = page.getByRole("heading", { name: "Hoi Robin" });
  await expect(vandaag).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tabbalk" }).getByRole("button", { name: "Vrij spelen" })).toBeVisible();

  // Grepen: de leerling ziet de status van een noot alleen als label; die zetten ouder en leraar (AC-120)
  await kiesTab(page, "Grepen");
  await expect(page.getByRole("button", { name: "Luister" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Status" })).toHaveCount(0);
  await kiesTab(page, "Vandaag");

  await kiesInMenu(page, "Uitloggen");
  await inloggen(page, { email, password: WACHTWOORD });
  await expect(vandaag).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hoe oud ben je?" })).toHaveCount(0);
});
