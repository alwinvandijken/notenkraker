import { expect, inloggen, kiesInMenu, test } from "../fixtures";
import type { Page } from "@playwright/test";

/** huiswerk geven via de stappen (iPad staand en iPhone) of alles op één pagina (breed) */
async function versturen(page: Page, knop: RegExp) {
  const volgende = page.getByRole("button", { name: "Volgende: doel" });
  if (await volgende.isVisible()) {
    await volgende.click();
    await page.getByRole("button", { name: "Volgende: versturen" }).click();
  }
  await page.getByRole("button", { name: knop }).click();
}

async function opdracht(page: Page, titel: string) {
  await page.getByRole("button", { name: "+ Nieuwe opdracht" }).click();
  await page.getByRole("button", { name: "✓ Opdracht" }).last().click();
  await page.getByRole("textbox", { name: "Titel van de opdracht" }).last().fill(titel);
}

// Feedback Alwin: opslaan van huiswerk resette alles. Nu: per les, toevoegen zonder het lopende te veranderen.
test("toevoegen aan deze les houdt vinkjes; volgende les ziet het kind nog niet", async ({ page, admin, maakGebruiker, maakKind }) => {
  const ouder = await maakGebruiker("ouder", "Papa");
  const kind = await maakKind(ouder, "Noor");
  await admin.from("students").update({ age_band: "9-12", onboarded_at: new Date().toISOString() }).eq("id", kind);

  await inloggen(page, ouder);
  await page.getByRole("button", { name: "Noor: details" }).click();
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await expect(page.getByRole("group", { name: "Les" }).getByRole("button", { name: /^Deze les/ })).toHaveAttribute("aria-pressed", "true");
  await opdracht(page, "Notenalfabet achteruit");
  await versturen(page, /naar Noor sturen/);
  await expect(page.getByRole("heading", { name: "Noor" })).toBeVisible();

  // Noor vinkt af
  await kiesInMenu(page, "Zelf oefenen");
  await page.getByRole("button", { name: "Notenalfabet achteruit nog niet gedaan" }).click();
  await expect(page.getByRole("button", { name: "Notenalfabet achteruit gedaan" })).toBeVisible();
  await kiesInMenu(page, "Terug naar Mijn kinderen");

  // een opdracht erbij voor deze les: het vinkje blijft
  await page.getByRole("button", { name: "Noor: details" }).click();
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await expect(page.getByText("Je hebt voor deze les al huiswerk gegeven")).toBeVisible();
  await opdracht(page, "Ritme klappen");
  await versturen(page, /Toevoegen aan deze les/);

  // en huiswerk voor de volgende les
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("group", { name: "Les" }).getByRole("button", { name: /^Volgende les/ }).click();
  await opdracht(page, "Etude 2");
  await versturen(page, /naar Noor sturen/);
  await expect(page.getByText("Volgende les")).toBeVisible();
  await expect(page.getByText("Etude 2")).toBeVisible();

  await kiesInMenu(page, "Zelf oefenen");
  const lijst = page.getByRole("list", { name: "Huiswerk" });
  await expect(lijst.getByRole("button", { name: "Notenalfabet achteruit gedaan" })).toBeVisible();
  await expect(lijst.getByText("Ritme klappen")).toBeVisible();
  await expect(lijst.getByText("Etude 2")).toHaveCount(0);

  // aanpassen verandert het huiswerk zelf: het vinkje blijft
  await kiesInMenu(page, "Terug naar Mijn kinderen");
  await page.getByRole("button", { name: "Noor: details" }).click();
  await page.getByRole("button", { name: "Aanpassen →" }).first().click();
  await expect(page.getByRole("heading", { name: /Huiswerk aanpassen/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Titel van de opdracht" }).first()).toBeVisible();
  const volgende = page.getByRole("button", { name: "Volgende: doel" });
  if (await volgende.isVisible()) await volgende.click();
  await page.getByRole("button", { name: "Minuten per dag meer" }).click();
  const naarVersturen = page.getByRole("button", { name: "Volgende: versturen" });
  if (await naarVersturen.isVisible()) await naarVersturen.click();
  await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
  // na het opslaan terug op de pagina van Noor (pas dan verder, anders haalt "terug" ons later in)
  await expect(page.getByRole("heading", { name: "Noor", exact: true })).toBeVisible();
  await expect(page.getByText("20 min per dag", { exact: false }).first()).toBeVisible();
  await kiesInMenu(page, "Zelf oefenen");
  await expect(page.getByRole("list", { name: "Huiswerk" }).getByRole("button", { name: "Notenalfabet achteruit gedaan" })).toBeVisible();
});
