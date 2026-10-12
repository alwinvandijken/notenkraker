import { expect, inloggen, kiesTab, test } from "../fixtures";

// AC-120 PR 6: huiswerk geven in drie stappen, met de bibliotheek ernaast; de kindpagina in tabbladen
test("leraar geeft huiswerk in drie stappen met een opdracht uit de bibliotheek", async ({ page, admin, maakGebruiker, maakKind }) => {
  const leraar = await maakGebruiker("leraar", "Juf Anna");
  const ouder = await maakGebruiker("ouder");
  const kind = await maakKind(ouder, "Noor");
  await admin.from("teacher_students").insert({ teacher_id: leraar.id, student_id: kind });
  await admin.from("task_bank").insert({ owner_id: leraar.id, kind: "opdracht", title: "Toonladder G groot", categories: ["Toonladders"] });

  await inloggen(page, leraar);
  await page.getByRole("button", { name: "Noor: details" }).click();
  await expect(page.getByRole("group", { name: "Tabbladen" })).toBeVisible();
  await page.getByRole("button", { name: "Huiswerk geven" }).click();

  // stap 1: Wat, met de bibliotheek (naast het formulier op de iPad, onder de knop op de iPhone)
  const naast = page.getByRole("complementary", { name: "Uit de bibliotheek" });
  const bibliotheek = (await naast.isVisible()) ? naast : page;
  if (bibliotheek === page) await page.getByRole("button", { name: "📚 Uit de bibliotheek" }).click();
  await bibliotheek.getByRole("button", { name: /Toonladder G groot/ }).click();
  await expect(page.getByRole("textbox", { name: "Titel van de opdracht" })).toHaveValue("Toonladder G groot");

  await page.getByRole("button", { name: "Volgende: doel" }).click();
  await page.getByRole("group", { name: "Minuten per dag" }).getByRole("button", { name: "Minuten per dag meer" }).click();
  await page.getByRole("button", { name: "Volgende: versturen" }).click();
  const overzicht = page.getByRole("region", { name: "Overzicht" });
  await expect(overzicht.getByText("Toonladder G groot")).toBeVisible();
  await expect(overzicht.getByText(/20 min per dag/)).toBeVisible();
  await page.getByRole("button", { name: "Opslaan en naar Noor sturen" }).click();

  // terug op de kindpagina, tabblad Huiswerk
  await expect(page.getByRole("heading", { name: "Noor" })).toBeVisible();
  await expect(page.getByText("Toonladder G groot")).toBeVisible();
  await kiesTab(page, "Leerlingen");
});
