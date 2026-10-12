import { expect, inloggen, kiesInMenu, speelRonde, test } from "../fixtures";

test("ouder maakt een kind aan, kind speelt, ouder ziet de ronde", async ({ page, maakGebruiker }) => {
  const ouder = await maakGebruiker("ouder");
  // traag netwerk: de lijst met kinderen komt later binnen dan de ouder tikt
  await page.route("**/rest/v1/students?*", async (route) => {
    if (route.request().method() === "GET") await new Promise((r) => setTimeout(r, 800));
    await route.fallback();
  });
  await inloggen(page, ouder);
  await expect(page.getByText("Voeg eerst een kind toe.")).toBeVisible();

  await kiesInMenu(page, "Mijn kinderen");
  await page.getByRole("textbox", { name: "Naam" }).fill("Sam");
  await page.getByRole("button", { name: "Toevoegen" }).click();
  // de ouder beantwoordt leeftijd en ervaring over het kind
  await expect(page.getByRole("heading", { name: "Hoe oud is Sam?" })).toBeVisible();
  await page.getByRole("button", { name: /9 – 12 jaar/ }).click();
  await page.getByRole("button", { name: /Net begonnen/ }).click();

  await page.getByRole("button", { name: "Oefenen" }).click();
  // de notentoets doet het kind zelf; hier overslaan
  await expect(page.getByRole("heading", { name: "Welke noten ken je al?" })).toBeVisible();
  await page.getByRole("button", { name: "Overslaan" }).click();
  await page.getByRole("group", { name: "Onderdeel" }).getByRole("button", { name: "Spel", exact: true }).click();
  // de ronde gaat via de Edge Function rounds; wachten tot die hem heeft opgeslagen
  const opgeslagen = page.waitForResponse((r) => r.url().includes("/functions/v1/rounds") && r.request().method() === "POST");
  await speelRonde(page);
  expect((await opgeslagen).ok()).toBe(true);

  await kiesInMenu(page, "Overzicht");
  await page.getByRole("button", { name: "Sam: details" }).click();
  await expect(page.getByRole("heading", { name: "Sam" })).toBeVisible();
  await expect(page.getByText(/Notenspel: \d+ van \d+ goed/)).toBeVisible();
});
