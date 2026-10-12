import { expect, inloggen, kiesInMenu, test } from "../fixtures";

test("leraar koppelt een kind met de code van de ouder", async ({ browser, page, maakGebruiker, maakKind }) => {
  const ouder = await maakGebruiker("ouder");
  const leraar = await maakGebruiker("leraar", "Juf Anna");
  await maakKind(ouder, "Noor");

  await inloggen(page, ouder);
  await kiesInMenu(page, "Mijn kinderen");
  await page.getByRole("button", { name: "Code voor leraar" }).click();
  const regel = page.getByText(/Geef deze code aan de leraar:/);
  await expect(regel).toBeVisible();
  const code = (await regel.locator("b").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{4,}$/);

  // de leraar op een eigen toestel
  const ctx = await browser.newContext(test.info().project.use);
  const juf = await ctx.newPage();
  await inloggen(juf, leraar);
  await kiesInMenu(juf, "Mijn leerlingen");
  await juf.getByRole("textbox", { name: "Uitnodigingscode" }).fill(code);
  await juf.getByRole("button", { name: "Koppel" }).click();
  await expect(juf.getByText("Noor", { exact: true }).first()).toBeVisible();

  await kiesInMenu(juf, "Overzicht");
  await expect(juf.getByText("Noor", { exact: true }).first()).toBeVisible();
  await ctx.close();
});
