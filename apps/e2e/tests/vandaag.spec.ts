import { expect, inloggen, kiesInMenu, kiesTab, test } from "../fixtures";

test("ouder geeft huiswerk, het kind ziet het op Vandaag als takenlijst", async ({ page, admin, maakGebruiker, maakKind }) => {
  const ouder = await maakGebruiker("ouder", "Papa");
  const kind = await maakKind(ouder, "Noor");
  // kennismaking al gedaan, en opnemen mag (AC-118)
  await admin.from("students").update({ age_band: "9-12", onboarded_at: new Date().toISOString(), recording_consent: true }).eq("id", kind);

  await inloggen(page, ouder);
  await kiesTab(page, "Huiswerk");
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("button", { name: "+ Nieuwe opdracht" }).click();
  await page.getByRole("textbox", { name: "Titel van de opdracht" }).fill("Lang zal ze leven");
  await page.getByRole("checkbox", { name: /neemt het op/ }).check();
  await page.getByRole("button", { name: "+ Nieuwe opdracht" }).click();
  await page.getByRole("button", { name: "✓ Opdracht" }).nth(1).click();
  await page.getByRole("textbox", { name: "Titel van de opdracht" }).nth(1).fill("Notenalfabet achteruit");
  await page.getByRole("button", { name: /naar Noor sturen/ }).click();
  await expect(page.getByRole("heading", { name: "Huiswerk", exact: true })).toBeVisible();

  await kiesInMenu(page, "Zelf oefenen");
  await expect(page.getByRole("heading", { name: "Hoi Noor" })).toBeVisible();
  const lijst = page.getByRole("list", { name: "Huiswerk" });
  await expect(lijst.getByText("15 minuten oefenen")).toBeVisible();
  await expect(page.getByText("huiswerk van Papa")).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin met oefenen" })).toBeVisible();

  // afvinken blijft bewaard, en dan heet de knop "Verder oefenen"
  const opdracht = lijst.getByRole("button", { name: /Notenalfabet achteruit .*gedaan/ });
  await opdracht.click();
  await expect(opdracht).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Verder oefenen" })).toBeVisible();
  await page.reload();
  await expect(lijst.getByRole("button", { name: /Notenalfabet achteruit .*gedaan/ })).toHaveAttribute("aria-pressed", "true");

  // de knop start de eerstvolgende open taak: de taakpagina van het stuk, met opnemen
  await page.getByRole("button", { name: "Verder oefenen" }).click();
  await expect(page.getByRole("heading", { name: "Lang zal ze leven" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin met opnemen" })).toBeVisible();
});
