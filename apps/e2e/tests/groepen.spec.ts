// AC-124 stap 2: lesgroepen beheren.
import type { Page } from "@playwright/test";
import { expect, inloggen, test, type Gebruiker } from "../fixtures";

/** een leraar met twee gekoppelde leerlingen die zelf inloggen */
async function klas({ admin, maakGebruiker, maakKind }: { admin: import("@supabase/supabase-js").SupabaseClient; maakGebruiker: (r: "ouder" | "leraar" | "leerling", n?: string) => Promise<Gebruiker>; maakKind: (o: Gebruiker, n: string) => Promise<string> }) {
  const leraar = await maakGebruiker("leraar", "Juf Marieke");
  const ouder = await maakGebruiker("ouder", "Papa");
  const noor = await maakKind(ouder, "Noor");
  const sem = await maakKind(ouder, "Sem");
  await admin.from("students").update({ age_band: "9-12", onboarded_at: new Date().toISOString() }).in("id", [noor, sem]);
  await admin.from("teacher_students").insert([{ teacher_id: leraar.id, student_id: noor }, { teacher_id: leraar.id, student_id: sem }]);
  return { leraar, ouder, noor, sem };
}

async function naarGroepen(page: Page) {
  await page.getByRole("group", { name: "Weergave leerlingen" }).getByRole("button", { name: "Groepen" }).click();
}

test("een leraar maakt een groep met rooster", async ({ page, admin, maakGebruiker, maakKind }) => {
  const { leraar } = await klas({ admin, maakGebruiker, maakKind });
  await inloggen(page, leraar);
  await naarGroepen(page);
  await page.getByRole("button", { name: "+ Nieuwe groep" }).click();
  await page.getByRole("textbox", { name: "Naam" }).fill("Samenspel");
  await page.getByRole("checkbox", { name: "Noor" }).check();
  await page.getByRole("checkbox", { name: "Sem" }).check();
  await page.getByRole("group", { name: "Lesdag" }).getByRole("button", { name: "za" }).click();
  await page.getByLabel("Begintijd").fill("10:00");
  await page.getByRole("button", { name: "Groep maken" }).click();
  await expect(page.getByRole("heading", { name: "Samenspel" })).toBeVisible();
  await page.getByRole("button", { name: "← Groepen" }).click();
  await expect(page.getByRole("button", { name: /Samenspel/ })).toContainText("za 10:00 · 2 leerlingen");
});
