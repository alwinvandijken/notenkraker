import { expect, inloggen, kiesInMenu, nieuwEmail, test, WACHTWOORD } from "../fixtures";

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
  // klaar met kennismaken: oefenen (Grepen, Spel of Vrij oefenen)
  const onderdeel = page.getByRole("group", { name: "Onderdeel" });
  await expect(onderdeel).toBeVisible();

  await kiesInMenu(page, "Uitloggen");
  await inloggen(page, { email, password: WACHTWOORD });
  await expect(onderdeel).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hoe oud ben je?" })).toHaveCount(0);
});
