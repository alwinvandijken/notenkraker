import { expect, inloggen, kiesInMenu, kiesTab, test } from "../fixtures";

// AC-121: een stuk vaker opnemen (begin en eind van de week), een reactie per opname, en weggooien
test("twee opnames van hetzelfde stuk, elk met een eigen reactie", async ({ page, admin, maakGebruiker, maakKind }) => {
  const ouder = await maakGebruiker("ouder", "Papa");
  const kind = await maakKind(ouder, "Noor");
  await admin.from("students").update({ age_band: "9-12", onboarded_at: new Date().toISOString(), recording_consent: true }).eq("id", kind);

  await inloggen(page, ouder);
  await kiesTab(page, "Huiswerk");
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("button", { name: "+ Nieuwe opdracht" }).click();
  await page.getByRole("textbox", { name: "Titel van de opdracht" }).fill("Lang zal ze leven");
  await page.getByRole("checkbox", { name: /neemt het op/ }).check();
  // drie stappen: Wat · Doel · Versturen (AC-120 PR 6)
  await page.getByRole("button", { name: "Volgende: doel" }).click();
  await page.getByRole("button", { name: "Volgende: versturen" }).click();
  await expect(page.getByRole("region", { name: "Overzicht" }).getByText("Lang zal ze leven")).toBeVisible();
  await page.getByRole("button", { name: /naar Noor sturen/ }).click();
  await expect(page.getByRole("heading", { name: "Huiswerk", exact: true })).toBeVisible();

  // twee ingestuurde opnames: maandag en vandaag (opnemen zelf kan niet in een browser zonder microfoon)
  const { data: lid } = await admin.from("group_members").select("group_id").eq("student_id", kind).single();
  const { data: taak } = await admin.from("assignments").select("id").eq("group_id", lid!.group_id).eq("title", "Lang zal ze leven").single();
  const pad = (n: string) => `${kind}/${taak!.id}/${n}.webm`;
  for (const n of ["maandag", "zaterdag"]) {
    const { error } = await admin.storage.from("opnames").upload(pad(n), new Blob(["x"], { type: "audio/webm" }));
    expect(error).toBeNull();
  }
  const { error } = await admin.from("recordings").insert([
    { assignment_id: taak!.id, student_id: kind, path: pad("maandag"), submitted_at: new Date(Date.now() - 5 * 864e5).toISOString() },
    { assignment_id: taak!.id, student_id: kind, path: pad("zaterdag"), submitted_at: new Date().toISOString() },
  ]);
  expect(error).toBeNull();

  // de ouder (die het huiswerk gaf) reageert op elke opname apart, op de kindpagina
  await kiesTab(page, "Mijn kinderen");
  await page.getByRole("button", { name: "Noor: details" }).click();
  const opnames = page.getByRole("list", { name: "Opnames" });
  await expect(opnames.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("group", { name: "Reactie op opname 1" }).getByRole("button", { name: "💪" }).click();
  await page.getByRole("group", { name: "Reactie op opname 2" }).getByRole("button", { name: "⭐" }).click();
  await expect(page.getByRole("group", { name: "Reactie op opname 2" }).getByRole("button", { name: "⭐" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await admin.from("recordings").select("reaction_emoji").eq("assignment_id", taak!.id).order("submitted_at")).data?.map((r) => r.reaction_emoji))
    .toEqual(["💪", "⭐"]);

  // het kind ziet beide opnames met hun reactie, en gooit er een weg
  await kiesInMenu(page, "Zelf oefenen");
  await expect(page.getByText("2 opnames ingestuurd")).toBeVisible();
  await page.getByRole("button", { name: /Lang zal ze leven opnemen/ }).click();
  const lijst = page.getByRole("list", { name: "Opnames" });
  await expect(lijst.getByRole("listitem")).toHaveCount(2);
  await expect(lijst.getByText("⭐")).toBeVisible();
  await expect(lijst.getByText("💪")).toBeVisible();
  await page.getByRole("button", { name: "Opname 2 weggooien" }).click();
  await page.getByRole("button", { name: "Weggooien", exact: true }).click();
  await expect(lijst.getByRole("listitem")).toHaveCount(1);
  await expect(lijst.getByText("💪")).toBeVisible();
  const { data: rest } = await admin.storage.from("opnames").list(`${kind}/${taak!.id}`);
  expect(rest?.map((f) => f.name)).toEqual(["maandag.webm"]);
});
