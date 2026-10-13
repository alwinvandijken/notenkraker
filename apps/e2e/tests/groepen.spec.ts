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

test("groepshuiswerk, per leerling volgen en afzeggen", async ({ page, admin, maakGebruiker, maakKind }) => {
  const { leraar, noor } = await klas({ admin, maakGebruiker, maakKind });
  await inloggen(page, leraar);
  await naarGroepen(page);
  await page.getByRole("button", { name: "+ Nieuwe groep" }).click();
  await page.getByRole("textbox", { name: "Naam" }).fill("Duo");
  await page.getByRole("checkbox", { name: "Noor" }).check();
  await page.getByRole("checkbox", { name: "Sem" }).check();
  const vandaag = new Date().getDay();
  const dag = ["zo", "ma", "di", "wo", "do", "vr", "za"][vandaag]!;
  await page.getByRole("group", { name: "Lesdag" }).getByRole("button", { name: dag }).click();
  await page.getByRole("button", { name: "Groep maken" }).click();
  await expect(page.getByRole("heading", { name: "Duo" })).toBeVisible();

  // groepshuiswerk voor deze les
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("button", { name: "+ Nieuwe opdracht" }).click();
  await page.getByRole("textbox", { name: "Titel van de opdracht" }).fill("Samen inzetten");
  for (const k of ["Volgende: doel", "Volgende: versturen"]) { const b = page.getByRole("button", { name: k }); if (await b.isVisible()) await b.click(); }
  await page.getByRole("button", { name: /naar Duo sturen/ }).click();
  await expect(page.getByRole("heading", { name: "Duo" })).toBeVisible();
  const opdracht = page.getByRole("group", { name: "Wie is klaar met Samen inzetten" });
  await expect(opdracht.getByRole("button")).toHaveCount(2);

  // Noor vinkt af (via de database, zoals de leerling-app doet); de leraar ziet haar stip
  // alleen de groep van deze leraar: iPad en iPhone draaien tegelijk
  const { data: g } = await admin.from("lesson_groups").select("id").eq("teacher_id", leraar.id).eq("name", "Duo").single();
  const { data: h } = await admin.from("homework").select("id, lessons!inner(group_id), assignments!inner(title)")
    .eq("lessons.group_id", g!.id).eq("assignments.title", "Samen inzetten").single();
  await admin.from("homework_done").insert({ homework_id: h!.id, student_id: noor });
  await page.reload();
  await expect(opdracht.getByRole("button", { name: "Noor: klaar" })).toBeVisible();
  await expect(opdracht.getByRole("button", { name: "Sem: nog niet" })).toBeVisible();

  // de les van volgende week afzeggen: het huiswerk loopt door
  await page.getByRole("group", { name: "Tabbladen" }).getByRole("button", { name: "Lessen" }).click();
  await page.getByRole("list", { name: "Lessen" }).getByRole("button", { name: /gepland/ }).last().click();
  await page.getByRole("textbox", { name: "Reden" }).fill("leraar ziek");
  await page.getByRole("button", { name: "Les afzeggen" }).click();
  await expect(page.getByRole("list", { name: "Lessen" })).toContainText("leraar ziek");
  const { data: les } = await admin.from("lessons").select("end_date").eq("group_id", g!.id).eq("status", "gegeven").single();
  const over = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  expect(les!.end_date).toBe(over(13));
});
